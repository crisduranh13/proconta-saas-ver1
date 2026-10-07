import { useState } from "react";
import { Download, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { demo, receivables, money } from "@/lib/proconta/demo";
import { PageTitle, MetricCard, TableWrap, StatusBadge, SearchInput, EmptyState } from "./shared";
export function ReceivablesPage({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const filtered = receivables.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageTitle
        eyebrow={embedded ? undefined : "CLIENTE A · SEPTIEMBRE 2026"}
        title="Cuentas por cobrar"
        description="Saldos abiertos y antigüedad de la cartera."
      />
      <div className="metrics-grid four">
        {demo.receivableMetrics.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>
      <section className="aging-section">
        <div className="section-heading">
          <h2>Antigüedad de saldos</h2>
          <span className="muted">Importes en MXN · DEMO</span>
        </div>
        <div className="aging-grid">
          {demo.aging.map((a) => (
            <div key={a.label}>
              <div className="aging-label">
                <span>{a.label}</span>
                <strong>{a.value}</strong>
              </div>
              <div className="aging-track">
                <div className={`aging-bar aging-${a.tone} aging-width-${a.width}`} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="data-section">
        <div className="section-heading">
          <h2>Cartera por cobrar</h2>
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar comprador…" />
        </div>
        <TableWrap>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Saldo</th>
              <th>Facturas</th>
              <th>Antigüedad</th>
              <th>Último pago</th>
              <th>Estatus</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.name}>
                <td>
                  <strong>{r.name}</strong>
                  <small>Comprador ficticio</small>
                </td>
                <td className="numeric">{money(r.balance)}</td>
                <td>{r.invoices}</td>
                <td>
                  <span className={`age-pill ${r.age === "90+ días" ? "overdue" : ""}`}>
                    {r.age}
                  </span>
                </td>
                <td>{r.last}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={`Ver saldo ${r.name}`}
                    onClick={() =>
                      setSelected(
                        `${r.name} · ${r.invoices} facturas abiertas · ${money(r.balance)} · ${r.age}`,
                      )
                    }
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
      {selected && (
        <div className="notice mt-6" role="status">
          {selected}
          <Button variant="ghost" size="sm" onClick={() => setSelected("")}>
            Cerrar
          </Button>
        </div>
      )}
    </>
  );
}
