import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, FileSpreadsheet, ShieldCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Status } from "@/lib/proconta/demo";
import type {
  Service04Analysis,
  Service04Client,
  Service04Item,
} from "@/lib/proconta/service-04/types";
import { EmptyState, MetricCard, PageTitle, SearchInput, StatusBadge, TableWrap } from "./shared";

const maxFileBytes = 20 * 1024 * 1024;
const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
const percent = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(value);
const dateLabel = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const agingTones = ["success", "info", "warning", "warning", "danger", "info"] as const;
const severityTone = { alta: "danger", media: "warning", baja: "neutral" } as const;

async function readWorkbook(file: File) {
  // Se carga sólo tras la acción del usuario; el archivo se procesa en este navegador.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

function clientStatus(client: Service04Client): Status {
  if (client.status !== "Conciliado") return "Bloqueado";
  return client.reviewCount ? "Requiere decisión" : "Conciliado";
}

function itemLabel(item: Service04Item) {
  if (item.kind === "saldo_inicial") return "Saldo inicial sin detalle";
  if (item.kind === "diferencia_centavos")
    return `Diferencia por conciliar${item.sourceFolio ? ` (${item.sourceFolio})` : ""}`;
  if (item.kind === "saldo_a_favor") return "Saldo a favor";
  return item.folio ?? "Cargo sin folio";
}

function itemState(item: Service04Item) {
  if (item.kind === "saldo_inicial") return "Revisar: sin detalle de facturas";
  if (item.kind === "diferencia_centavos") return "Revisar: diferencia de centavos";
  if (item.kind === "saldo_a_favor") return "Revisar: saldo a favor";
  return item.applied > 0 ? "Saldo parcial" : "Pendiente";
}

export function ReceivablesPage({
  embedded = false,
  clientName,
}: {
  embedded?: boolean;
  clientName?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [creditDays, setCreditDays] = useState("0");
  const [confirmed, setConfirmed] = useState(false);
  const [analysis, setAnalysis] = useState<Service04Analysis | null>(null);
  const [busy, setBusy] = useState<"process" | "download" | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(true);
  const owner = clientName ?? "el cliente seleccionado";

  function chooseFile(next: File | undefined) {
    setFile(next ?? null);
    setAnalysis(null);
    setSelected(null);
    setConfirmed(false);
    setError("");
  }

  async function process() {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".xls")) {
      setError(
        "El archivo es .xls (formato antiguo). Ábrelo en Excel y guárdalo como .xlsx para procesarlo.",
      );
      return;
    }
    if (!name.endsWith(".xlsx")) {
      setError("Selecciona el auxiliar de clientes (cuenta 1103) en formato .xlsx.");
      return;
    }
    if (file.size > maxFileBytes) {
      setError("El archivo excede el límite local de 20 MB.");
      return;
    }
    if (!confirmed) {
      setError(`Confirma que el auxiliar corresponde a ${owner}.`);
      return;
    }
    const days = Number(creditDays || 0);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      setError("Los días de crédito deben ser un número entero entre 0 y 365.");
      return;
    }
    setBusy("process");
    setError("");
    try {
      const workbook = await readWorkbook(file).catch(() => {
        throw new Error(
          "No se pudo leer el XLSX. Comprueba que no esté dañado ni protegido con contraseña.",
        );
      });
      const { analyzeReceivables } = await import("@/lib/proconta/service-04/engine");
      const result = analyzeReceivables(workbook, { cutoffDate: cutoff || null, creditDays: days });
      setAnalysis(result);
      setCutoff(result.cutoffDate);
      setSelected(result.clients.find((client) => client.reconstructedBalance > 0)?.account ?? null);
    } catch (cause) {
      setAnalysis(null);
      setError(cause instanceof Error ? cause.message : "No se pudo procesar el auxiliar.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!analysis) return;
    setBusy("download");
    setError("");
    try {
      const { exportService04Xlsx } = await import("@/lib/proconta/service-04/exporter");
      const { filename, bytes } = await exportService04Xlsx(analysis);
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

  const clients = useMemo(
    () =>
      (analysis?.clients ?? [])
        .filter((client) => client.name.toLowerCase().includes(query.toLowerCase()))
        .sort(
          (a, b) =>
            Number(b.status !== "Conciliado") - Number(a.status !== "Conciliado") ||
            b.reconstructedBalance - a.reconstructedBalance,
        ),
    [analysis, query],
  );
  const detail = analysis?.clients.find((client) => client.account === selected) ?? null;
  const detailItems = analysis?.openItems.filter((item) => item.account === selected) ?? [];
  const findings = (analysis?.anomalies ?? []).filter(
    (anomaly) => !onlyReview || anomaly.requiresReview,
  );
  const maxBucket = Math.max(...(analysis?.aging ?? []).map((bucket) => bucket.amount), 1);

  return (
    <section className="space-y-6">
      <PageTitle
        eyebrow={embedded ? undefined : "SERVICIO 4"}
        title="Cuentas por cobrar"
        description={`${clientName ? `${clientName} · ` : ""}Facturas pendientes de cobro y antigüedad a partir del auxiliar de clientes (cuenta 1103).`}
      />
      <div className="notice">
        <ShieldCheck size={17} /> El auxiliar se procesa en este navegador. No se envía a Supabase
        ni se guarda en la cuenta del despacho.
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold">1. Cargar el auxiliar de clientes</h2>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Auxiliar de clientes XLSX"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />
        <Button variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
          <UploadCloud size={16} /> Seleccionar auxiliar
        </Button>
        {file && (
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet size={16} />
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <label className="field-label">
            Fecha de corte (opcional: por defecto, la del auxiliar)
            <input
              className="field"
              type="date"
              value={cutoff}
              onChange={(event) => setCutoff(event.target.value)}
            />
          </label>
          <label className="field-label">
            Días de crédito (0 = antigüedad por fecha de factura)
            <input
              className="field"
              type="number"
              min="0"
              max="365"
              step="1"
              value={creditDays}
              onChange={(event) => setCreditDays(event.target.value)}
            />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Confirmo que el auxiliar corresponde a {owner}.
        </label>
        <Button disabled={!file || busy !== null} onClick={process}>
          {busy === "process" ? "Procesando…" : analysis ? "Volver a procesar" : "Procesar auxiliar"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="notice tone-danger">
          {error}
        </div>
      )}

      {analysis && (
        <>
          <div
            role="status"
            className={`notice ${analysis.totals.unreconciledClients ? "tone-danger" : "tone-success"}`}
          >
            {analysis.totals.unreconciledClients
              ? `${analysis.totals.unreconciledClients} cliente(s) no cuadran con el auxiliar. Revisa "Diferencias de conciliación" antes de entregar.`
              : `Los ${analysis.totals.clients} clientes cuadran al centavo con el auxiliar (saldo ${money(analysis.totals.auxiliaryBalance)}).`}{" "}
            Corte al {dateLabel(analysis.cutoffDate)} · {analysis.company} {analysis.rfc}
          </div>
          {analysis.warnings.map((warning) => (
            <div role="status" className="notice" key={warning}>
              {warning}
            </div>
          ))}

          <div className="metrics-grid four">
            <MetricCard
              label="Saldo total pendiente"
              value={money(analysis.totals.totalPending)}
              note={`${analysis.totals.clients} clientes · ${analysis.totals.invoicesReviewed} facturas · ${analysis.totals.payments} abonos · ${analysis.totals.creditNotes} NC`}
            />
            <MetricCard
              label="Clientes con adeudo"
              value={String(analysis.totals.clientsWithBalance)}
              note={`${analysis.totals.reconciledClients} de ${analysis.totals.clients} conciliados`}
            />
            <MetricCard
              label="Facturas pendientes"
              value={String(analysis.totals.openInvoices)}
              note={`+ ${analysis.totals.openingWithoutDetail} saldo(s) inicial(es) sin detalle · ${analysis.totals.centDifferences} diferencia(s)`}
            />
            <MetricCard
              label="Porcentaje vencido"
              value={percent(analysis.totals.overduePercent)}
              note={`Más de 90 días: ${money(analysis.totals.over90)} (${percent(analysis.totals.over90Percent)})`}
              kind="warning"
            />
          </div>

          <section className="aging-section">
            <div className="section-heading">
              <h2>Antigüedad de saldos</h2>
              <span className="muted">
                {analysis.creditDays
                  ? `${analysis.creditDays} días de crédito`
                  : "Por fecha de factura"}{" "}
                · MXN
              </span>
            </div>
            <div className="aging-grid">
              {analysis.aging.map((bucket, index) => (
                <div key={bucket.key}>
                  <div className="aging-label">
                    <span>
                      {bucket.label} · {bucket.items} partidas
                    </span>
                    <strong>
                      {money(bucket.amount)} · {percent(bucket.percent)}
                    </strong>
                  </div>
                  <div className="aging-track">
                    <div
                      className={`aging-bar aging-${agingTones[index]}`}
                      style={{ width: `${Math.max(0, (bucket.amount / maxBucket) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="data-section">
            <div className="section-heading">
              <h2>Clientes</h2>
              <SearchInput value={query} onChange={setQuery} placeholder="Buscar cliente…" />
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Saldo</th>
                  <th>Facturas pendientes</th>
                  <th>Antigüedad</th>
                  <th>Último cobro</th>
                  <th>Conciliación</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.account}>
                    <td>
                      <strong>{client.name}</strong>
                      <small>{client.account}</small>
                    </td>
                    <td className="numeric">{money(client.reconstructedBalance)}</td>
                    <td>{client.openInvoices}</td>
                    <td>
                      <span
                        className={`age-pill ${client.agingLabel === "Más de 90 días" ? "overdue" : ""}`}
                      >
                        {client.agingLabel}
                      </span>
                    </td>
                    <td>{dateLabel(client.lastPaymentDate)}</td>
                    <td>
                      <StatusBadge status={clientStatus(client)} />
                      {client.difference !== 0 && <small>Diferencia {money(client.difference)}</small>}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={`Ver detalle de ${client.name}`}
                        onClick={() => setSelected(client.account)}
                      >
                        <ArrowUpRight />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {!clients.length && <EmptyState />}
          </section>

          {detail && (
            <section className="data-section space-y-3">
              <div className="section-heading">
                <h2>Detalle · {detail.name}</h2>
                <span className="muted">
                  Auxiliar {money(detail.auxiliaryBalance)} − reconstruido{" "}
                  {money(detail.reconstructedBalance)} = {money(detail.difference)}
                </span>
              </div>
              {detail.possibleCauses.map((cause) => (
                <div key={cause} role="alert" className="notice tone-danger">
                  {cause}
                </div>
              ))}
              {detailItems.length === 0 ? (
                <p className="text-sm">Sin saldo pendiente al corte.</p>
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Folio</th>
                      <th>Importe original</th>
                      <th>Pagos aplicados</th>
                      <th>Saldo pendiente</th>
                      <th>Días</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item) => (
                      <tr key={item.id}>
                        <td>{dateLabel(item.date)}</td>
                        <td>
                          {itemLabel(item)}
                          {item.poliza && <small>Póliza {item.poliza}</small>}
                        </td>
                        <td className="numeric">{money(item.original)}</td>
                        <td className="numeric">{money(item.applied)}</td>
                        <td className="numeric">{money(item.remaining)}</td>
                        <td>{item.days ?? "—"}</td>
                        <td>{itemState(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </section>
          )}

          <section className="data-section space-y-3">
            <div className="section-heading">
              <h2>Hallazgos</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyReview}
                  onChange={(event) => setOnlyReview(event.target.checked)}
                />
                Sólo partidas que requieren criterio
              </label>
            </div>
            <p className="text-sm text-muted-foreground">
              Referencias: {analysis.totals.referenceMatched} coinciden ·{" "}
              {analysis.totals.referenceMismatch} no corresponden · {analysis.totals.withoutReference}{" "}
              sin referencia · {analysis.totals.withoutCombination} sin combinación ·{" "}
              {analysis.totals.paymentsToReview} pagos por revisar.
            </p>
            {findings.length === 0 ? (
              <p className="text-sm">Sin hallazgos en este filtro.</p>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Severidad</th>
                    <th>Cliente</th>
                    <th>Hallazgo</th>
                    <th>Importe</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding, index) => (
                    <tr key={`${finding.code}-${finding.account}-${finding.rowNumber ?? index}`}>
                      <td>
                        <span className={`tone-${severityTone[finding.severity]}`}>
                          {finding.severity}
                        </span>
                      </td>
                      <td>
                        {finding.client}
                        {finding.rowNumber && <small>Renglón {finding.rowNumber}</small>}
                      </td>
                      <td>{finding.code.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="numeric">
                        {finding.amount === undefined ? "—" : money(finding.amount)}
                      </td>
                      <td>
                        {finding.message}
                        {finding.requiresReview && <small>Pendiente de criterio del contador</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </section>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold">Descargar el resultado</h2>
            <p className="text-sm text-muted-foreground">
              Resumen, facturas pendientes por cliente, antigüedad, pagos por revisar, diferencias de
              conciliación, control interno y bitácora de aplicación de abonos. Lo pendiente de
              revisión queda en amarillo.
            </p>
            <Button disabled={busy !== null} onClick={download}>
              <Download size={16} />{" "}
              {busy === "download" ? "Generando Excel…" : `Descargar Excel (${analysis.outputFilename})`}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
