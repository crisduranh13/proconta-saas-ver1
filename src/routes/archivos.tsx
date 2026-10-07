import { createFileRoute } from '@tanstack/react-router';
import { FilesPage } from '@/components/proconta/files';
import { pageHead } from '@/lib/proconta/meta';
export const Route = createFileRoute('/archivos')({head:()=>pageHead('Archivos','Documentos del periodo y validaciones de demostración. Datos ficticios DEMO.'),component:FilesPage});
