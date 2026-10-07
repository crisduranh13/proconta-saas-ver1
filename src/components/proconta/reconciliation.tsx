import { useState } from "react";
import { ArrowUpRight, CircleCheck, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { movements, demo, money } from "@/lib/proconta/demo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PageTitle, MetricCard, TableWrap, StatusBadge, SearchInput, EmptyState } from "./shared";
export function ReconciliationPage({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [selected, setSelected] = useState<(typeof movements)[number] | null>(null);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const filtered = movements.filter(
    (m) =>
      (m.description + " " + m.provider).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "Todos" || m.status === filter),
  );
  return (
    <>
      <PageTitle
        eyebrow={embedded ? undefined : "CLIENTE A · SEPTIEMBRE 2026"}
        title="Conciliación"
        description="Salidas bancarias vs. CFDI recibidos"
        actions={<span className="plain-tag">DEMO</span>}
      />
      <div className="metrics-grid five">
        {demo.reconciliationMetrics.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>
      <section className="data-section">
        <div className="section-heading">
          <h2>Movimientos del periodo</h2>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar movimiento o proveedor…"
          />
        </div>
        <div className="filter-tabs">
          {["Todos", "Conciliado", "Observaciones", "Parcial", "Sin CFDI", "No aplica"].map((f) => (
            <Button
              variant="ghost"
              className={filter === f ? "selected" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
        <TableWrap>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción bancaria / Proveedor</th>
              <th>Importe</th>
              <th>CFDI</th>
              <th>Diferencia</th>
              <th>Estatus</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} onClick={() => setSelected(m)} className="clickable-row">
                <td>{m.date}</td>
                <td>
                  <strong>{m.description}</strong>
                  <small>{m.provider}</small>
                </td>
                <td className="numeric">{money(m.amount)}</td>
                <td>{m.cfdi}</td>
                <td className={`numeric ${m.difference ? "tone-danger" : ""}`}>
                  {money(m.difference)}
                </td>
                <td>
                  <StatusBadge status={reviewed.includes(m.id) ? "En revisión" : m.status} />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Ver evidencia"
                    aria-label={`Ver evidencia ${m.description}`}
                  >
                    <ArrowUpRight />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!filtered.length && <EmptyState />}
      </section>
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="workspace-sheet">
          <SheetHeader>
            <SheetTitle>Detalle de conciliación</SheetTitle>
            <SheetDescription>Movimiento y evidencia · DEMO</SheetDescription>
          </SheetHeader>
          {selected && (
            <>
              <div className="detail-section">
                <StatusBadge status={selected.status} />
                <h2>{money(selected.amount)}</h2>
                <h3>{selected.description}</h3>
                <p>
                  {selected.date} · {selected.provider}
                </p>
              </div>
              <div className="detail-section">
                <h3>
                  <FileText size={16} /> CFDI relacionado
                </h3>
                <p>
                  {selected.cfdi === "—"
                    ? "No se encontró un CFDI relacionado."
                    : `Folio ficticio ${selected.cfdi} · ${selected.provider}`}
                </p>
              </div>
              <div className="detail-section">
                <h3>
                  <ShieldCheck size={16} /> Evidencia y criterio de coincidencia
                </h3>
                <p>{selected.observation}</p>
                <dl>
                  <dt>Confianza de coincidencia DEMO</dt>
                  <dd>{selected.confidence}</dd>
                  <dt>Diferencia</dt>
                  <dd>{money(selected.difference)}</dd>
                  <dt>Regla ilustrativa</dt>
                  <dd>Comparación de importe, proveedor y fecha</dd>
                </dl>
              </div>
              <label className="field-label">
                Comentario del contador
                <textarea className="field" placeholder="Agregar una observación…" />
              </label>
              <Button
                className="mt-6 w-full"
                onClick={() => {
                  setReviewed([...reviewed, selected.id]);
                  setSelected(null);
                }}
              >
                <CircleCheck />
                Marcar para revisión
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
