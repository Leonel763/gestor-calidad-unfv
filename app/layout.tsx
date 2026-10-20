import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Gestión de calidad | Derecho UNFV',description:'Repositorio de medios de logro, seguimiento de estándares y evidencias de calidad de Derecho UNFV'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
