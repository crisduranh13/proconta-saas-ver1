import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, ShieldCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Status } from "@/lib/proconta/demo";
import {
  DEFAULT_CATALOG,
  SERVICE01_CATALOGS,
  normalizeCatalog,
} from "@/lib/proconta/service-01/catalogs";
import type {
  BankStatement,
  Service01Analysis,
  Service01Status,
} from "@/lib/proconta/service-01/types";
import { SERVICE01_STATUSES } from "@/lib/proconta/service-01/types";
import { MetricCard, PageTitle, StatusBadge, TableWrap } from "./shared";

const maxFileBytes = 25 * 1024 * 1024;
const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
const percent = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(value);
const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const badge: Record<Service01Status, Status> = {
  CONCILIADO: "Conciliado",
  "CONCILIADO C/OBS": "Observaciones",
  PARCIAL: "Parcial",
  "SIN CFDI": "Pendiente",
  "NO REQUIERE": "No aplica",
};

async function readWorkbook(file: File) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

async function readStatement(file: File): Promise<BankStatement> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const { extractPdfWords } = await import("@/lib/proconta/service-01/pdf-text");
    const { readBbvaPdf } = await import("@/lib/proconta/service-01/bbva-pdf");
    const pages = await extractPdfWords(new Uint8Array(await file.arrayBuffer()));
    return readBbvaPdf(pages, file.name);
  }
  if (name.endsWith(".xlsx")) {
    const { readBbvaXlsx } = await import("@/lib/proconta/service-01/bbva-xlsx");
    return readBbvaXlsx(await readWorkbook(file), file.name);
  }
  if (name.endsWith(".xls")) {
    throw new Error(`${file.name}: el formato .xls antiguo no se procesa; guárdalo como .xlsx.`);
  }
  throw new Error(`${file.name}: sólo se aceptan estados de cuenta BBVA en PDF o XLSX.`);
}

export function OutflowsCfdiPage({
  embedded = false,
  clientName,
}: {
  embedded?: boolean;
  clientName?: string;
}) {
  const bankInput = useRef<HTMLInputElement>(null);
  const cfdiInput = useRef<HTMLInputElement>(null);
  const priorInput = useRef<HTMLInputElement>(null);
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [cfdiFile, setCfdiFile] = useState<File | null>(null);
  const [priorFile, setPriorFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [catalogId, setCatalogId] = useState("auto");
  const [catalogJson, setCatalogJson] = useState("");
  const [analysis, setAnalysis] = useState<Service01Analysis | null>(null);
  const [busy, setBusy] = useState<"process" | "download" | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Service01Status | "TODAS">("TODAS");
  const owner = clientName ?? "el cliente seleccionado";

  function reset() {
    setAnalysis(null);
    setError("");
    setConfirmed(false);
  }

  function chooseCatalog(id: string) {
    setCatalogId(id);
    const catalog = SERVICE01_CATALOGS.find((entry) => entry.id === id);
    setCatalogJson(catalog ? JSON.stringify(catalog, null, 2) : "");
    setAnalysis(null);
  }

  async function process() {
    if (!bankFiles.length || !cfdiFile) {
      setError("Selecciona al menos un estado de cuenta y el reporte de CFDI recibidos.");
      return;
    }
    if ([...bankFiles, cfdiFile].some((file) => file.size > maxFileBytes)) {
      setError("Un archivo excede el límite local de 25 MB.");
      return;
    }
    if (!confirmed) {
      setError(`Confirma que los archivos corresponden a ${owner}.`);
      return;
    }
    setBusy("process");
    setError("");
    try {
      const statements: BankStatement[] = [];
      for (const file of bankFiles) statements.push(await readStatement(file));
      const { readCfdiWorkbook } = await import("@/lib/proconta/service-01/cfdi-xlsx");
      const cfdi = readCfdiWorkbook(await readWorkbook(cfdiFile), cfdiFile.name);
      const previousMonth = priorFile
        ? readCfdiWorkbook(await readWorkbook(priorFile), priorFile.name)
        : null;
      const { analyzeOutflows } = await import("@/lib/proconta/service-01/engine");
      let catalog;
      if (catalogId !== "auto") {
        const base = SERVICE01_CATALOGS.find((entry) => entry.id === catalogId) ?? DEFAULT_CATALOG;
        try {
          catalog = normalizeCatalog(catalogJson.trim() ? JSON.parse(catalogJson) : base, base);
        } catch {
          throw new Error("El catálogo editado no es un JSON válido.");
        }
      }
      setAnalysis(
        analyzeOutflows(statements, cfdi, catalog ? { catalog, previousMonth } : { previousMonth }),
      );
    } catch (cause) {
      setAnalysis(null);
      setError(cause instanceof Error ? cause.message : "No se pudo procesar la conciliación.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!analysis) return;
    setBusy("download");
    setError("");
    try {
      const { exportService01Xlsx } = await import("@/lib/proconta/service-01/exporter");
      const { filename, bytes } = await exportService01Xlsx(analysis);
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar el Excel.");
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(
    () => (analysis?.outflows ?? []).filter((row) => filter === "TODAS" || row.status === filter),
    [analysis, filter],
  );

  return (
    <section className="space-y-6">
      <PageTitle
        eyebrow={embedded ? undefined : "SERVICIO 1"}
        title="Salidas vs CFDI recibidos"
        description={`${clientName ? `${clientName} · ` : ""}Cada cargo del banco clasificado según el CFDI que lo ampara.`}
      />
      <div className="notice">
        <ShieldCheck size={17} /> Los archivos se procesan en este navegador. No se envían a
        Supabase ni se guardan en la cuenta del despacho.
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold">1. Cargar archivos</h2>
        <input
          ref={bankInput}
          type="file"
          multiple
          accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Estados de cuenta BBVA (PDF o XLSX)"
          onChange={(event) => {
            setBankFiles(Array.from(event.target.files ?? []));
            reset();
          }}
        />
        <input
          ref={cfdiInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="CFDI recibidos (Doc Digitales XLSX)"
          onChange={(event) => {
            setCfdiFile(event.target.files?.[0] ?? null);
            reset();
          }}
        />
        <input
          ref={priorInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="CFDI del mes anterior pendientes de pago (opcional)"
          onChange={(event) => {
            setPriorFile(event.target.files?.[0] ?? null);
            reset();
          }}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => bankInput.current?.click()}
          >
            <UploadCloud size={16} /> Estados de cuenta BBVA (PDF o XLSX)
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => cfdiInput.current?.click()}
          >
            <UploadCloud size={16} /> CFDI recibidos (Doc Digitales)
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => priorInput.current?.click()}
          >
            <UploadCloud size={16} /> CFDI del mes anterior (opcional)
          </Button>
        </div>
        {[...bankFiles, ...(cfdiFile ? [cfdiFile] : []), ...(priorFile ? [priorFile] : [])].map(
          (file) => (
            <p key={`${file.name}-${file.size}`} className="flex items-center gap-2 text-sm">
              <FileSpreadsheet size={16} />
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </p>
          ),
        )}
        <label className="field-label">
          Catálogo del cliente (CLABE y palabras clave → proveedor)
          <select
            className="field"
            value={catalogId}
            onChange={(event) => chooseCatalog(event.target.value)}
          >
            <option value="auto">Automático (por RFC o titular del estado de cuenta)</option>
            {SERVICE01_CATALOGS.map((catalog) => (
              <option key={catalog.id} value={catalog.id}>
                {catalog.label}
              </option>
            ))}
          </select>
        </label>
        {catalogId !== "auto" && (
          <label className="field-label">
            Catálogo editable (JSON)
            <textarea
              className="field font-mono text-xs"
              rows={8}
              value={catalogJson}
              onChange={(event) => setCatalogJson(event.target.value)}
            />
          </label>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Confirmo que los archivos corresponden a {owner}.
        </label>
        <Button disabled={!bankFiles.length || !cfdiFile || busy !== null} onClick={process}>
          {busy === "process"
            ? "Procesando…"
            : analysis
              ? "Volver a procesar"
              : "Validar y conciliar"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="notice tone-danger">
          {error}
        </div>
      )}

      {analysis && (
        <>
          <div role="status" className="notice tone-success">
            Banco validado: {analysis.totals.cargosBanco} cargos por{" "}
            {money(analysis.totals.cargosBancoImporte)} y {analysis.totals.abonosBanco} abonos por{" "}
            {money(analysis.totals.abonosBancoImporte)} · {dmy(analysis.periodFrom)} al{" "}
            {dmy(analysis.periodTo)} · catálogo: {analysis.catalog.label}
          </div>
          {analysis.warnings.map((warning) => (
            <div role="status" className="notice" key={warning}>
              {warning}
            </div>
          ))}
          <div className="metrics-grid four">
            <MetricCard
              label="Salidas revisadas"
              value={String(analysis.totals.salidas)}
              note={money(analysis.totals.importe)}
            />
            <MetricCard
              label="Con CFDI identificado"
              value={percent(analysis.totals.pctRequiereYTiene)}
              note="Del importe que requiere CFDI"
              kind="success"
            />
            <MetricCard
              label="Sin CFDI"
              value={String(analysis.byStatus["SIN CFDI"].salidas)}
              note={money(analysis.byStatus["SIN CFDI"].importe)}
              kind="warning"
            />
            <MetricCard
              label="CFDI sin pago"
              value={String(analysis.totals.cfdiSinSalida)}
              note={`${money(analysis.totals.cfdiSinSalidaImporte)} · ${analysis.totals.rep} REP`}
            />
          </div>

          <section className="data-section space-y-3">
            <div className="section-heading">
              <h2>Resultado por estatus</h2>
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th>Estatus</th>
                  <th>Salidas</th>
                  <th>Importe</th>
                  <th>% del importe</th>
                </tr>
              </thead>
              <tbody>
                {SERVICE01_STATUSES.map((status) => (
                  <tr key={status}>
                    <td>
                      <StatusBadge status={badge[status]} /> {status}
                    </td>
                    <td>{analysis.byStatus[status].salidas}</td>
                    <td className="numeric">{money(analysis.byStatus[status].importe)}</td>
                    <td className="numeric">
                      {percent(
                        analysis.totals.importe
                          ? analysis.byStatus[status].importe / analysis.totals.importe
                          : 0,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <section className="data-section space-y-3">
            <div className="section-heading">
              <h2>Salidas</h2>
              <select
                className="field"
                value={filter}
                onChange={(event) => setFilter(event.target.value as Service01Status | "TODAS")}
              >
                <option value="TODAS">Todas</option>
                {SERVICE01_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Importe</th>
                  <th>Estatus</th>
                  <th>CFDI</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.movement.account}-${row.movement.id}`}>
                    <td>{dmy(row.movement.operDate)}</td>
                    <td>
                      {row.movement.description.slice(0, 46)}
                      <small>
                        {row.movement.account}
                        {row.movement.detail ? ` · ${row.movement.detail.slice(0, 60)}` : ""}
                      </small>
                    </td>
                    <td className="numeric">{money(row.movement.cargo)}</td>
                    <td>{row.status}</td>
                    <td>
                      {row.cfdi ? (
                        <>
                          {row.cfdi.serieFolio}
                          <small>
                            {row.cfdi.rfc} · {dmy(row.cfdi.date)} · {money(row.cfdi.total)}
                          </small>
                        </>
                      ) : (
                        row.rfcHint || "—"
                      )}
                    </td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <section className="data-section space-y-3">
            <div className="section-heading">
              <h2>CFDI sin pago identificado</h2>
              <span className="muted">
                {analysis.totals.cfdiSinSalida} de {analysis.totals.cfdiActivos} CFDI activos
              </span>
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Emisor</th>
                  <th>Serie-Folio</th>
                  <th>Total</th>
                  <th>Método / Forma</th>
                  <th>Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {analysis.unpaid.map((entry) => (
                  <tr key={entry.cfdi.id}>
                    <td>{dmy(entry.cfdi.date)}</td>
                    <td>
                      {entry.cfdi.emisor.slice(0, 40)}
                      <small>{entry.cfdi.rfc}</small>
                    </td>
                    <td>{entry.cfdi.serieFolio}</td>
                    <td className="numeric">{money(entry.cfdi.total)}</td>
                    <td>
                      {entry.cfdi.metodo} / {entry.cfdi.forma}
                    </td>
                    <td>{entry.diagnostico}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold">Descargar el resultado</h2>
            <p className="text-sm text-muted-foreground">
              Excel con tres hojas: Resumen (validación del banco, estatus y control), Salidas y
              CFDI sin pago.
            </p>
            <Button disabled={busy !== null} onClick={download}>
              <Download size={16} />{" "}
              {busy === "download"
                ? "Generando Excel…"
                : `Descargar Excel (${analysis.outputFilename})`}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
