import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clients, demo } from "@/lib/proconta/demo";
import { useWorkspace } from "@/lib/proconta/context";
import { SearchInput, FilterButton, StatusBadge, EmptyState } from "./shared";
export function Portfolio({ full = false }: { full?: boolean }) {
  const [query, setQuery] = useState("");
  const [attention, setAttention] = useState(false);
  const [sort, setSort] = useState("name");
  const { period } = useWorkspace();
  const filtered = clients
    .filter(
      (c) =>
        (c.name + " " + c.industry).toLowerCase().includes(query.toLowerCase()) &&
        (!attention || c.pending > 0),
    )
    .sort((a, b) => (sort === "pending" ? b.pending - a.pending : a.name.localeCompare(b.name)));
  return (
    <section className="portfolio-section">
      <div className="section-heading">
        <div>
          <h2>
            {full ? "Cartera de clientes" : "Cartera de clientes"} <span>· {period}</span>
          </h2>
          <p>Una vista de cada cliente y sus servicios del periodo.</p>
        </div>
        {!full && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/clientes">
              Ver todos los clientes
              <ArrowUpRight />
            </Link>
          </Button>
        )}
      </div>
      <div className="table-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar cliente o actividad…" />
        <div className="toolbar-right">
          <FilterButton active={attention} onClick={() => setAttention(!attention)} />
          <div className="sort-select">
            <span>Ordenar:</span>
            <select
              aria-label="Ordenar clientes"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">Nombre</option>
              <option value="pending">Pendientes</option>
            </select>
            <ChevronDown size={12} />
          </div>
        </div>
      </div>
      <div className="table-scroll portfolio-table-scroll">
        <table className="data-table">
        <thead>
          <tr>
            <th className="check-cell sticky-check">
              <input
                type="checkbox"
                aria-label="Seleccionar todos los clientes"
                onChange={(e) =>
                  document
                    .querySelectorAll<HTMLInputElement>(".client-check")
                    .forEach((el) => (el.checked = e.target.checked))
                }
              />
            </th>
            <th className="sticky-client">Cliente</th>
            <th className="sticky-type">Tipo</th>
            <th className="col-service">Conciliación</th>
            <th className="col-service">IVA / ISR</th>
            <th className="col-service">Auxiliar</th>
            <th className="col-service">Emitidas</th>
            <th className="col-service">CxC</th>
            <th className="text-center">Pendientes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td className="check-cell sticky-check">
                <input
                  type="checkbox"
                  className="client-check"
                  aria-label={`Seleccionar ${c.name}`}
                />
              </td>
              <td className="sticky-client">
                <Link className="client-cell" title={c.name} to="/clientes/$clientId" params={{ clientId: c.id }}>
                  <div className={`avatar avatar-${c.tone}`}>{c.initials}</div>
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.industry}</small>
                  </div>
                </Link>
              </td>
              <td className="sticky-type">
                <span className="type-label">{c.type}</span>
              </td>
              {c.statuses.map((s, i) => (
                <td key={i} className="col-service">
                  <StatusBadge compact status={s} />
                </td>
              ))}
              <td className="text-center">
                <span className={`pending-count ${c.pending ? "has-pending" : ""}`}>
                  {c.pending || "—"}
                </span>
              </td>
              <td>
                <Button asChild variant="ghost" size="icon" title={`Abrir ${c.name}`}>
                  <Link to="/clientes/$clientId" params={{ clientId: c.id }}>
                    <MoreHorizontal />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {!filtered.length && <EmptyState />}
      <div className="table-footer">
        <span>
          Mostrando <strong>{filtered.length}</strong> de <strong>{demo.activeCount}</strong>{" "}
          clientes · DEMO
        </span>
        <div>
          <Button variant="outline" size="icon" disabled title="Página anterior">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="sm">
            1
          </Button>
          <Button variant="outline" size="icon" disabled title="Página siguiente">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
