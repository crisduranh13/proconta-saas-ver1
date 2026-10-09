import { createFileRoute } from "@tanstack/react-router";
import { OutflowsCfdiPage } from "@/components/proconta/outflows-cfdi";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/salidas-vs-cfdi")({
  head: () =>
    pageHead(
      "Salidas vs CFDI",
      "Conciliación de cargos bancarios contra CFDI recibidos con estatus por salida.",
    ),
  component: OutflowsCfdiPage,
});
