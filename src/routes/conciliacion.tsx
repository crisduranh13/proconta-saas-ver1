import { createFileRoute } from "@tanstack/react-router";
import { ReconciliationPage } from "@/components/proconta/reconciliation";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/conciliacion")({
  head: () =>
    pageHead(
      "Conciliación",
      "Revisión de salidas bancarias y CFDI relacionados. Datos ficticios DEMO.",
    ),
  component: ReconciliationPage,
});
