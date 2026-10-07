import { useState } from "react";
import {
  ClipboardCheck,
  ArrowUpRight,
  FileText,
  Check,
  X,
  Clock3,
  Eye,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { decisions, money, type Status } from "@/lib/proconta/demo";
import { useWorkspace } from "@/lib/proconta/context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PageTitle, StatusBadge, SearchInput, EmptyState } from "./shared";
export function DecisionsPage({
  client,
  embedded = false,
}: {
  client?: string;
  embedded?: boolean;
}) {
  const [selected, setSelected] = useState<(typeof decisions)[number] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Pendientes");
  const [resolved, setResolved] = useState<Record<number, Status>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState("");
  const { period } = useWorkspace();
  const filtered = decisions.filter(
    (d) =>
      (!client || d.client === client) &&
      (d.title + " " + d.client).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "Todas" || (filter === "Resueltas" ? Boolean(resolved[d.id]) : !resolved[d.id])),
  );
  function decide(status: Status) {
    if (!selected) return;
    setResolved({ ...resolved, [selected.id]: status });
    setFeedback(`${selected.client} · ${status}. Decisión guardada en esta sesión DEMO.`);
    setSelected(null);
  }
  return (
    <>
      <PageTitle
        title="Decisiones pendientes"
        description="La aplicación propone. El contador decide."
        actions={<span className="plain-tag">{period}</span>}
      />
      {feedback && (
        <div role="status" className="notice mb-6">
          <Check size={16} />
          {feedback}
        </div>
      )}
      <div className="decisions-toolbar">
        <div className="filter-tabs">
          {["Pendientes", "Resueltas", "Todas"].map((f) => (
            <Button
              variant="ghost"
              className={filter === f ? "selected" : ""}
              onClick={() => setFilter(f)}
              key={f}
            >
              {f}
            </Button>
          ))}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar decisión o cliente…" />
      </div>
      <div className="decision-list">
        {filtered.map((d) => (
          <article className="decision-card" key={d.id}>
            <div className="decision-top">
              <span className="client-caption">
                {d.client}
                <span>·</span>
                {d.service}
              </span>
              <StatusBadge status={resolved[d.id] || "Requiere decisión"} />
            </div>
            <div className="decision-main">
              <div>
                <h2>{d.title}</h2>
                <p>{d.explanation}</p>
              </div>
              <strong className="decision-amount">
                {money(d.amount)}
                <small>Importe identificado</small>
              </strong>
            </div>
            <div className="decision-bottom">
              <span className={`priority-tag ${d.priority === "Alta" ? "high" : ""}`}>
                <CircleAlert size={13} />
                Prioridad {d.priority.toLowerCase()}
              </span>
              <span className="confidence">
                <span className="live-dot" />
                Confianza DEMO {d.confidence}
              </span>
              <Button variant="outline" onClick={() => setSelected(d)}>
                Revisar decisión
                <ArrowUpRight />
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState title="Bandeja al día" description="No hay decisiones en esta vista." />
      )}
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="workspace-sheet decision-sheet">
          <SheetHeader>
            <SheetTitle>Revisar decisión</SheetTitle>
            <SheetDescription>
              {selected?.client} · {selected?.service} · {period}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <>
              <div className="detail-section">
                <StatusBadge status="Requiere decisión" />
                <h2>{selected.title}</h2>
                <strong className="detail-amount">{money(selected.amount)}</strong>
                <p>{selected.explanation}</p>
              </div>
              <div className="detail-section">
                <h3>
                  <FileText size={16} />
                  Evidencia
                </h3>
                {selected.evidence.map((e) => (
                  <div className="evidence-row" key={e}>
                    {e}
                  </div>
                ))}
              </div>
              <div className="detail-section">
                <h3>Propuesta de ProConta</h3>
                <p>{selected.proposal}</p>
                <span className="muted">Confianza ilustrativa: {selected.confidence}</span>
              </div>
              <div className="decision-question">{selected.question}</div>
              <label className="field-label">
                Comentario del contador
                <textarea
                  className="field"
                  value={comments[selected.id] || ""}
                  onChange={(e) => setComments({ ...comments, [selected.id]: e.target.value })}
                  placeholder="Documenta tu criterio…"
                />
              </label>
              <div className="decision-actions">
                <Button onClick={() => decide("Confirmado")}>
                  <Check />
                  Confirmar criterio
                </Button>
                <Button variant="outline" onClick={() => decide("Rechazado")}>
                  <X />
                  Rechazar sugerencia
                </Button>
                <Button variant="outline" onClick={() => decide("En revisión")}>
                  <Eye />
                  Necesito revisar
                </Button>
                <Button variant="ghost" onClick={() => decide("Pospuesto")}>
                  <Clock3 />
                  Posponer
                </Button>
              </div>
              <p className="muted text-xs mt-4">
                La decisión se conserva solo durante esta sesión de demostración.
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
