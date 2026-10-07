import { createFileRoute } from "@tanstack/react-router";
import { ProcessesPage } from "@/components/proconta/secondary-pages";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/procesos")({
  head: () =>
    pageHead(
      "Procesos",
      "Seguimiento operativo de servicios contables por cliente. Datos ficticios DEMO.",
    ),
  component: ProcessesPage,
});
