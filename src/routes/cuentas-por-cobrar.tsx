import { createFileRoute } from "@tanstack/react-router";
import { ReceivablesPage } from "@/components/proconta/receivables";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/cuentas-por-cobrar")({
  head: () =>
    pageHead(
      "Cuentas por cobrar",
      "Facturas pendientes de cobro y antigüedad de saldos a partir del auxiliar de clientes.",
    ),
  component: ReceivablesPage,
});
