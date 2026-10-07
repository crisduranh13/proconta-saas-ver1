import { createFileRoute } from '@tanstack/react-router';
import { HistoryPage } from '@/components/proconta/secondary-pages';
import { pageHead } from '@/lib/proconta/meta';
export const Route = createFileRoute('/historial')({head:()=>pageHead('Historial y auditoría','Trazabilidad y actividad del despacho contable. Datos ficticios DEMO.'),component:HistoryPage});
