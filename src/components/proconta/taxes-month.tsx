import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, ShieldCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BankStatement } from "@/lib/proconta/service-01/types";
import type { DeductionStatus, Service02Analysis } from "@/lib/proconta/service-02/types";
import { DEDUCTION_STATUSES, DEPOSIT_CLASSES } from "@/lib/proconta/service-02/types";
import { MetricCard, PageTitle, TableWrap } from "./shared";

const maxFileBytes = 25 * 1024 * 1024;
const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
const percent = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 2 }).format(value);
const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

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
    return readBbvaPdf(await extractPdfWords(new Uint8Array(await file.arrayBuffer())), file.name);
  }
  if (name.endsWith(".xlsx")) {
    const { readBbvaXlsx } = await import("@/lib/proconta/service-01/bbva-xlsx");
    return readBbvaXlsx(await readWorkbook(file), file.name);
  }
  throw new Error(`${file.name}: sólo se aceptan estados de cuenta BBVA en PDF o XLSX.`);
}

function FilePicker({
  label,
  multiple = false,
  disabled,
  onChange,
}: {
  label: string;
  multiple?: boolean;
  disabled: boolean;
  onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        aria-label={label}
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
      />
      <Button variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
        <UploadCloud size={16} /> {label}
      </Button>
    </>
  );
}

export function TaxesMonthPage({
  embedded = false,
  clientName,
}: {
  embedded?: boolean;
  clientName?: string;
}) {
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [recibidosFile, setRecibidosFile] = useState<File | null>(null);
  const [emitidosFile, setEmitidosFile] = useState<File | null>(null);
  const [priorFile, setPriorFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [analysis, setAnalysis] = useState<Service02Analysis | null>(null);
  const [busy, setBusy] = useState<"process" | "download" | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<DeductionStatus | "TODOS">("TODOS");
  const owner = clientName ?? "el cliente seleccionado";
  const files = [
    ...bankFiles,
    ...(recibidosFile ? [recibidosFile] : []),
    ...(emitidosFile ? [emitidosFile] : []),
    ...(priorFile ? [priorFile] : []),
  ];

  function reset() {
    setAnalysis(null);
    setError("");
    setConfirmed(false);
  }

  async function process() {
    if (!bankFiles.length || !recibidosFile || !emitidosFile) {
      setError("Selecciona los estados de cuenta, los CFDI recibidos y los CFDI emitidos.");
      return;
    }
    if (files.some((file) => file.size > maxFileBytes)) {
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
      const recibidos = readCfdiWorkbook(await readWorkbook(recibidosFile), recibidosFile.name);
      const emitidos = readCfdiWorkbook(await readWorkbook(emitidosFile), emitidosFile.name);
      const previousMonth = priorFile
        ? readCfdiWorkbook(await readWorkbook(priorFile), priorFile.name)
        : null;
      const { analyzeMonthTaxes } = await import("@/lib/proconta/service-02/engine");
      setAnalysis(analyzeMonthTaxes({ statements, recibidos, emitidos, previousMonth }));
    } catch (cause) {
      setAnalysis(null);
      setError(cause instanceof Error ? cause.message : "No se pudo calcular el mes.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!analysis) return;
    setBusy("download");
    setError("");
    try {
      const { exportService02Xlsx } = await import("@/lib/proconta/service-02/exporter");
      const { filename, bytes } = await exportService02Xlsx(analysis);
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

  const received = useMemo(
    () => (analysis?.received ?? []).filter((row) => filter === "TODOS" || row.status === filter),
    [analysis, filter],
  );

  return (
    <section className="space-y-6">
      <PageTitle
        eyebrow={embedded ? undefined : "SERVICIO 2"}
        title="IVA e ISR del mes"
        description={`${clientName ? `${clientName} · ` : ""}Persona física 612, flujo de efectivo: ingresos cobrados, deducciones pagadas y el impuesto del mes.`}
      />
      <div className="notice">
        <ShieldCheck size={17} /> Los archivos se procesan en este navegador. No se envían a
        Supabase ni se guardan en la cuenta del despacho.
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold">1. Cargar archivos</h2>
        <div className="flex flex-wrap gap-3">
          <FilePicker
            label="Estados de cuenta BBVA (PDF o XLSX)"
            multiple
            disabled={busy !== null}
            onChange={(list) => {
              setBankFiles(list);
              reset();
            }}
          />
          <FilePicker
            label="CFDI recibidos"
            disabled={busy !== null}
            onChange={(list) => {
              setRecibidosFile(list[0] ?? null);
              reset();
            }}
          />
          <FilePicker
            label="CFDI emitidos"
            disabled={busy !== null}
            onChange={(list) => {
              setEmitidosFile(list[0] ?? null);
              reset();
            }}
          />
          <FilePicker
            label="CFDI del mes anterior (opcional)"
            disabled={busy !== null}
            onChange={(list) => {
              setPriorFile(list[0] ?? null);
              reset();
            }}
          />
        </div>
        {files.map((file) => (
          <p key={`${file.name}-${file.size}`} className="flex items-center gap-2 text-sm">
            <FileSpreadsheet size={16} />
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        ))}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Confirmo que los archivos corresponden a {owner}.
        </label>
        <Button
          disabled={!bankFiles.length || !recibidosFile || !emitidosFile || busy !== null}
          onClick={process}
        >
          {busy === "process" ? "Calculando…" : analysis ? "Volver a calcular" : "Calcular el mes"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="notice tone-danger">
          {error}
        </div>
      )}

      {analysis && (
        <>
          {analysis.warnings.map((warning) => (
            <div role="status" className="notice" key={warning}>
              {warning}
            </div>
          ))}
          <div className="metrics-grid four">
            <MetricCard
              label="IVA a pagar"
              value={money(analysis.iva.aPagar)}
              note={`Trasladado ${money(analysis.iva.trasladado)} − acreditable ${money(analysis.iva.acreditable)}`}
              kind="warning"
            />
            <MetricCard
              label="ISR del mes"
              value={money(analysis.isr.isr)}
              note={`Base ${money(analysis.isr.base)} · límite ${money(analysis.isr.limiteInferior)} · ${percent(analysis.isr.pctExcedente)}`}
              kind="warning"
            />
            <MetricCard
              label="Cobrado con IVA"
              value={money(analysis.ingresos.cobradoConIva)}
              note={`Base ${money(analysis.ingresos.baseSinIva)} · ${analysis.ingresos.depositos} depósitos`}
            />
            <MetricCard
              label="Deducciones"
              value={money(analysis.isr.deducciones)}
              note={`${analysis.byDeduction.DEDUCIBLE.cfdi} CFDI deducibles de ${analysis.received.length}`}
              kind="success"
            />
          </div>

          <section className="data-section space-y-3">
            <div className="section-heading">
              <h2>Depósitos del mes</h2>
              <span className="muted">
                {DEPOSIT_CLASSES.map(
                  (c) =>
                    `${c}: ${analysis.byDeposit[c].depositos} · ${money(analysis.byDeposit[c].importe)}`,
                ).join(" | ")}
              </span>
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Depósito</th>
                  <th>Clasificación</th>
                  <th>Base / IVA</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {analysis.deposits.map((row) => (
                  <tr key={`${row.movement.account}-${row.movement.id}`}>
                    <td>{dmy(row.movement.operDate)}</td>
                    <td>
                      {row.movement.description.slice(0, 60)}
                      <small>{row.movement.account}</small>
                    </td>
                    <td className="numeric">{money(row.movement.abono)}</td>
                    <td>{row.classification}</td>
                    <td className="numeric">
                      {row.classification === "NO ES INGRESO"
                        ? "—"
                        : `${money(row.base)} / ${money(row.iva)}`}
                    </td>
                    <td>
                      {row.note}
                      {row.reference && <small>{row.reference}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <section className="data-section space-y-3">
            <div className="section-heading">
              <h2>CFDI emitidos</h2>
              <span className="muted">
                Cobrados {analysis.byIssued.COBRADO} · vía REP{" "}
                {analysis.byIssued["COBRADO VÍA REP"]} · pendientes{" "}
                {analysis.byIssued["PENDIENTE DE COBRO"]}
              </span>
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Receptor</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Estatus</th>
                  <th>Cobrado</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {analysis.issued.map((row) => (
                  <tr key={row.key}>
                    <td>
                      {row.key}
                      <small>{row.metodo}</small>
                    </td>
                    <td>
                      {row.receptor.slice(0, 40)}
                      <small>{row.receptorRfc}</small>
                    </td>
                    <td>{dmy(row.date)}</td>
                    <td className="numeric">{row.total === null ? "—" : money(row.total)}</td>
                    <td>{row.status}</td>
                    <td className="numeric">{money(row.cobrado)}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <section className="data-section space-y-3">
            <div className="section-heading">
              <h2>CFDI recibidos</h2>
              <select
                className="field"
                value={filter}
                onChange={(event) => setFilter(event.target.value as DeductionStatus | "TODOS")}
              >
                <option value="TODOS">Todos ({analysis.received.length})</option>
                {DEDUCTION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status} ({analysis.byDeduction[status].cfdi})
                  </option>
                ))}
              </select>
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Emisor</th>
                  <th>Serie-Folio</th>
                  <th>Subtotal / IVA</th>
                  <th>Total</th>
                  <th>Estatus</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {received.map((row) => (
                  <tr key={`${row.key}-${row.date}-${row.total}`}>
                    <td>{dmy(row.date)}</td>
                    <td>
                      {row.emisor.slice(0, 40)}
                      <small>{row.rfc}</small>
                    </td>
                    <td>
                      {row.serieFolio}
                      <small>
                        {row.metodo} / {row.forma} / {row.uso}
                      </small>
                    </td>
                    <td className="numeric">
                      {money(row.subtotal)} / {money(row.iva)}
                    </td>
                    <td className="numeric">{money(row.total)}</td>
                    <td>{row.status}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold">Descargar el resultado</h2>
            <p className="text-sm text-muted-foreground">
              Excel con tres hojas: Resumen (ingresos, IVA, ISR y controles), Ingresos (depósitos y
              CFDI emitidos) y Recibidos.
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
