import { createFileRoute } from "@tanstack/react-router";
import { ClientWorkspace } from "@/components/proconta/client-workspace";
import { clients } from "@/lib/proconta/demo";
import { pageHead } from "@/lib/proconta/meta";
export const Route = createFileRoute("/clientes/$clientId")({
  head: ({ params }) =>
    pageHead(
      clients.find((c) => c.id === params.clientId)?.name || "Cliente",
      "Espacio de trabajo del cliente: archivos, conciliación, decisiones y entregables DEMO.",
    ),
  component: ClientPage,
});
function ClientPage() {
  const { clientId } = Route.useParams();
  return <ClientWorkspace clientId={clientId} />;
}
