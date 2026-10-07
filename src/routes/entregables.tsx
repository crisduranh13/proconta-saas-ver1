import { createFileRoute } from "@tanstack/react-router";
import { DeliverablesPage } from "@/components/proconta/secondary-pages";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/entregables")({
  head: () =>
    pageHead(
      "Entregables",
      "Archivos y controles previos al cierre del periodo. Datos ficticios DEMO.",
    ),
  component: DeliverablesPage,
});
