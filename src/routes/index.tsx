import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/proconta/dashboard";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Dashboard",
      "Estado operativo del despacho: clientes, decisiones, documentos y controles. ProConta v1 DEMO.",
    ),
  component: Dashboard,
});
