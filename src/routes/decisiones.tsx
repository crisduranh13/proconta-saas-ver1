import { createFileRoute } from "@tanstack/react-router";
import { DecisionsPage } from "@/components/proconta/decisions";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/decisiones")({
  head: () =>
    pageHead(
      "Decisiones pendientes",
      "Bandeja de revisión de hallazgos y criterios del contador. Datos ficticios DEMO.",
    ),
  component: DecisionsPage,
});
