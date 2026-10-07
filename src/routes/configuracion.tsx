import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/components/proconta/secondary-pages';
import { pageHead } from '@/lib/proconta/meta';
export const Route = createFileRoute('/configuracion')({head:()=>pageHead('Configuración','Preferencias del espacio de trabajo ProConta. Datos ficticios DEMO.'),component:SettingsPage});
