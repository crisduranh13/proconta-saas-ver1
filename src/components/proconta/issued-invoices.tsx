import { useRef, useState } from "react";
import { Download, FileSpreadsheet, ShieldCheck, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/proconta/context";
import type { Service03Analysis, Service03Options } from "@/lib/proconta/service-03/types";
import { MetricCard, PageTitle, TableWrap } from "./shared";

const maxFileBytes = 20 * 1024 * 1024;
const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
const monthNumbers: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

function selectedPeriodKey(period: string) {
  const [month, year] = period.toLowerCase().split(/\s+/);
  return month && year && monthNumbers[month] ? `${year}-${monthNumbers[month]}` : null;
}

async function readWorkbook(file: File) {
  // Loaded only after a user action. The browser bundle keeps Excel processing local.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

export function IssuedInvoicesPage({ clientName }: { clientName: string }) {
  const { period } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [analysis, setAnalysis] = useState<Service03Analysis | null>(null);
  const [confirmedRows, setConfirmedRows] = useState<number[]>([]);
  const [siigo16, setSiigo16] = useState("");
  const [siigo0, setSiigo0] = useState("");
  const [busy, setBusy] = useState<"process" | "download" | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");

  function chooseFile(nextFile: File | undefined) {
    setFile(nextFile ?? null);
    setAnalysis(null);
    setConfirmedRows([]);
    setSiigo16("");
    setSiigo0("");
    setClientConfirmed(false);
    setStale(false);
    setError("");
  }

  function options(): Service03Options {
    return {
      clientLabel: clientName,
      confirmedZeroRateRows: confirmedRows,
      siigoBase16: siigo16.trim() === "" ? null : Number(siigo16),
      siigoBase0: siigo0.trim() === "" ? null : Number(siigo0),
    };
  }

  async function process() {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Selecciona un archivo INGRESOS en formato .xlsx.");
      return;
    }
    if (file.size > maxFileBytes) {
      setError("El archivo excede el límite local de 20 MB.");
      return;
    }
    if (!clientConfirmed) {
      setError("Confirma que el archivo corresponde al cliente seleccionado.");
      return;
    }
    if (
      (siigo16 && !Number.isFinite(Number(siigo16))) ||
      (siigo0 && !Number.isFinite(Number(siigo0)))
    ) {
      setError("Las bases SIIGO deben ser importes numéricos.");
      return;
    }
    setBusy("process");
    setError("");
    try {
      const workbook = await readWorkbook(file).catch(() => {
        throw new Error(
          "No se pudo leer el XLSX. Comprueba que no esté dañado y que sea un reporte INGRESOS.",
        );
      });
      const { analyzeIssuedInvoices } = await import("@/lib/proconta/service-03/engine");
      const result = analyzeIssuedInvoices(workbook, options());
      const expectedMonth = selectedPeriodKey(period);
      if (expectedMonth && result.period.from.slice(0, 7) !== expectedMonth) {
        throw new Error(
          `El reporte corresponde a ${result.period.from.slice(0, 7)} y el periodo seleccionado es ${period}.`,
        );
      }
      setAnalysis(result);
      setStale(false);
    } catch (cause) {
      setAnalysis(null);
      setError(cause instanceof Error ? cause.message : "No se pudo procesar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!file || !analysis || stale) return;
    setBusy("download");
    setError("");
    try {
      // A fresh workbook ensures repeated downloads cannot append duplicate output sheets.
      const workbook = await readWorkbook(file).catch(() => {
        throw new Error("No se pudo volver a leer el XLSX para generar el resultado.");
      });
      const { analyzeIssuedInvoices } = await import("@/lib/proconta/service-03/engine");
      const { exportService03Xlsx } = await import("@/lib/proconta/service-03/exporter");
      const result = analyzeIssuedInvoices(workbook, options());
      const expectedMonth = selectedPeriodKey(period);
      if (expectedMonth && result.period.from.slice(0, 7) !== expectedMonth) {
        throw new Error(
          "El archivo ya no corresponde al periodo seleccionado. Vuelve a procesarlo.",
        );
      }
      const { filename, bytes } = await exportService03Xlsx(result);
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

  function setConfirmation(row: number, checked: boolean) {
    setConfirmedRows((current) =>
      checked ? [...current, row] : current.filter((value) => value !== row),
    );
    setStale(true);
  }

  return (
    <section className="service-section space-y-6">
      <PageTitle
        title="Revisión de facturas emitidas"
        description={`${clientName} · ${period} · Procesamiento local de prueba`}
      />
      <div className="notice">
        <ShieldCheck size={17} /> El archivo se procesa en este navegador. No se envía a Supabase ni
        se guarda en la cuenta del despacho. Las confirmaciones se pierden al salir de la página.
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold">1. Cargar y validar el reporte</h2>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Archivo INGRESOS XLSX"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />
        <Button variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
          <UploadCloud size={16} /> Seleccionar XLSX
        </Button>
        {file && (
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet size={16} />
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={clientConfirmed}
            onChange={(event) => setClientConfirmed(event.target.checked)}
          />
          Confirmo que el reporte corresponde a {clientName} y al periodo {period}.
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="field-label">
            Base 16% SIIGO (opcional)
            <input
              className="field"
              type="number"
              step="0.01"
              min="0"
              value={siigo16}
              onChange={(event) => {
                setSiigo16(event.target.value);
                setStale(true);
              }}
            />
          </label>
          <label className="field-label">
            Base 0% SIIGO (opcional)
            <input
              className="field"
              type="number"
              step="0.01"
              min="0"
              value={siigo0}
              onChange={(event) => {
                setSiigo0(event.target.value);
                setStale(true);
              }}
            />
          </label>
        </div>
        <Button disabled={!file || busy !== null} onClick={process}>
          {busy === "process"
            ? "Procesando…"
            : analysis
              ? "Recalcular revisión"
              : "Validar y procesar"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="notice tone-danger">
          {error}
        </div>
      )}
      {analysis && (
        <>
          {stale && (
            <div role="status" className="notice">
              Hay cambios pendientes. Recalcula antes de descargar.
            </div>
          )}
          {analysis.warnings.map((warning) => (
            <div role="status" className="notice" key={warning}>
              {warning}
            </div>
          ))}
          <div className="metrics-grid four">
            <MetricCard label="CFDI activos" value={String(analysis.totales.activos)} />
            <MetricCard label="Días revisados" value={String(analysis.totales.dias)} />
            <MetricCard label="Diferencia del mes" value={money(analysis.totales.W)} />
            <MetricCard
              label="Días por revisar"
              value={String(analysis.totales.dias_revisar)}
              kind="warning"
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">2. Hallazgos y decisión humana</h2>
            <p className="text-sm text-muted-foreground">
              Un CFDI sin IVA es un candidato por confirmar. Marcar tasa 0% aplica solo a esta
              revisión local; el sistema no decide la clasificación fiscal.
            </p>
            {analysis.candidatos_sin_iva.length === 0 ? (
              <p className="text-sm">No se detectaron candidatos a tasa 0%.</p>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Folio / fila</th>
                    <th>Fecha</th>
                    <th>Base sin IVA</th>
                    <th>Tipo</th>
                    <th>Decisión local</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.candidatos_sin_iva.map((candidate) => (
                    <tr key={candidate.fila}>
                      <td>
                        {candidate.folio}
                        <small>Fila {candidate.fila}</small>
                      </td>
                      <td>{candidate.dia}</td>
                      <td className="numeric">{money(candidate.base0)}</td>
                      <td>{candidate.mixto ? "Mixto" : "Sin IVA"}</td>
                      <td>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            aria-label={`Confirmar tasa 0% para folio ${candidate.folio}, fila ${candidate.fila}`}
                            checked={confirmedRows.includes(candidate.fila)}
                            onChange={(event) =>
                              setConfirmation(candidate.fila, event.target.checked)
                            }
                          />
                          Confirmar tasa 0%
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">3. Resultado por día</h2>
            <TableWrap>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>CFDI</th>
                  <th>Subtotal</th>
                  <th>IVA</th>
                  <th>Diferencia</th>
                  <th>IEPS</th>
                  <th>Revisión</th>
                </tr>
              </thead>
              <tbody>
                {analysis.dias.map((day) => (
                  <tr key={day.dia}>
                    <td>{day.dia}</td>
                    <td>{day.n}</td>
                    <td className="numeric">{money(day.S)}</td>
                    <td className="numeric">{money(day.U)}</td>
                    <td className="numeric">{money(day.W)}</td>
                    <td className="numeric">{money(day.IEPS)}</td>
                    <td>{day.revision}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Hallazgos con evidencia</h2>
            <TableWrap>
              <thead>
                <tr>
                  <th>Regla</th>
                  <th>CFDI</th>
                  <th>Fecha</th>
                  <th>Importe</th>
                  <th>Explicación</th>
                </tr>
              </thead>
              <tbody>
                {analysis.findings.map((finding, index) => (
                  <tr key={`${finding.code}-${finding.rowNumber ?? finding.day ?? index}`}>
                    <td>{finding.code}</td>
                    <td>
                      {finding.folio ?? "—"}
                      {finding.rowNumber && <small>Fila {finding.rowNumber}</small>}
                    </td>
                    <td>{finding.day ?? "—"}</td>
                    <td className="numeric">
                      {finding.amount === undefined ? "—" : money(finding.amount)}
                    </td>
                    <td>
                      {finding.message}
                      {finding.requiresHumanReview && <small>Pendiente de revisión humana</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold">4. Descargar el resultado</h2>
            <p className="text-sm text-muted-foreground">
              El Excel conserva los registros originales y agrega cálculos, hallazgos, resumen y
              controles. Quedan visibles los asuntos pendientes.
            </p>
            <Button disabled={busy !== null || stale} onClick={download}>
              <Download size={16} /> {busy === "download" ? "Generando Excel…" : "Descargar XLSX"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
