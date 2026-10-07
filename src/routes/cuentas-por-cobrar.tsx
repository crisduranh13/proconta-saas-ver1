import { createFileRoute } from "@tanstack/react-router";
import { ReceivablesPage } from "@/components/proconta/receivables";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/cuentas-por-cobrar")({
  head: () =>
    pageHead(
      "Cuentas por cobrar",
      "Saldos y antigüedad de la cartera de compradores. Datos ficticios DEMO.",
    ),
  component: ReceivablesPage,
});
