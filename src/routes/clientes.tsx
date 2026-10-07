import { createFileRoute } from '@tanstack/react-router';
import { ClientsPage } from '@/components/proconta/secondary-pages';
import { pageHead } from '@/lib/proconta/meta';
export const Route = createFileRoute('/clientes')({head:()=>pageHead('Clientes','Cartera de clientes del despacho y estado de servicios. Datos ficticios DEMO.'),component:ClientsPage});
