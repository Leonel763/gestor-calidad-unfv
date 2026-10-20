# Gestor de Calidad — Derecho UNFV

Aplicación web Next.js para organizar la matriz GAB Derecho de los 18 estándares por punto y medio de logro. Las evidencias y estados se sincronizan mediante Supabase.

## Contenido

- `lib/matriz.json`: matriz incorporada al código, incluidos los 18 estándares y 89 puntos; 161 subpuntos numerados y 6 registros a nivel de punto.
- `app/page.tsx`: pestañas E1–E18, acordeones, panel de progreso, biblioteca, pendientes y fichas con carga de documentos.
- `app/api/documents/delete/route.ts`: borrado mediante clave administrativa, con eliminación del archivo y su registro.
- `supabase.sql`: estructura de referencia. **No volver a ejecutarlo** sobre el proyecto Supabase existente sin revisar las políticas actuales.

## Enlazar GitHub con Vercel

1. Crear un repositorio GitHub **privado y vacío** denominado `gestor-calidad-unfv`, sin README automático.
2. Subir el contenido **de esta carpeta**, no la carpeta contenedora.
3. Vercel → proyecto `gestor-calidad-unfv` → Settings → Git → conectar el repositorio. El framework es `Next.js`, sin Build Command personalizado.
4. Establecer variables en Vercel para *Production* y *Preview*:

   - `NEXT_PUBLIC_SUPABASE_URL`: URL pública del proyecto Supabase (ver `.env.example`).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave publicable del proyecto (ver `.env.example`).
   - `SUPABASE_SERVICE_ROLE_KEY`: clave secreta **service_role** (obtenerla desde Supabase > Project Settings > API Keys, nunca guardarla en Git).
   - `ADMIN_DELETE_PASSWORD`: clave propia y larga para borrar documentos (no publicarla ni registrarla en código).

5. Publicar con un push a `main`. Vercel hará despliegues en cambios posteriores.

## Autorización para borrar

La eliminación usa una ruta privada del servidor y solicita la contraseña del administrador. **No se han agregado políticas de DELETE para visitantes anónimos** en Supabase. La contraseña y clave `service_role` permanecen en Vercel como variables de servidor. Si faltan, se muestra un mensaje indicando que el borrado aún no está habilitado. El resto de la web funciona normalmente.

**Importante:** un usuario con el enlace puede consultar y subir evidencias, así como modificar su estado, según las políticas originales de Supabase. Antes de trabajar con documentos institucionales reservados, activar usuarios y roles.

## En local

```bash
npm install
npm run dev
```

Para compilar producción: `npm run build`.
