import { createFileRoute } from "@tanstack/react-router";
import { TaxesMonthPage } from "@/components/proconta/taxes-month";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/iva-isr")({
  head: () =>
    pageHead(
      "IVA e ISR del mes",
      "Ingresos cobrados, deducciones pagadas e impuestos del mes para persona física 612.",
    ),
  component: TaxesMonthPage,
});
