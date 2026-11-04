# Acceso con cuentas personales (versión de prueba)

El sistema usa **Supabase Auth (correo y contraseña)** y una tabla `public.profiles` para guardar nombre, aprobación y rol. El nombre del autor se inserta automáticamente desde el perfil validado en la base de datos mediante un trigger (no se confía en un campo editable del navegador).

## Primer usuario administrador

1. Visita la vista previa en Vercel, elige **Solicitar una cuenta**, coloca tu nombre y un correo al que tengas acceso.
2. Si Supabase exige confirmar el correo, completa la verificación.
3. En Supabase > SQL Editor, después de que exista la cuenta, ejecuta una consulta con tu correo **sin compartirlo ni pegar credenciales en el repositorio**:

```sql
update public.profiles
set approved = true, role = 'admin'
where id in (
  select id from auth.users where email = 'TU_CORREO_REGISTRADO'
);
```

4. Vuelve a la pantalla de espera y haz clic en **Comprobar aprobación**.
5. Para aprobar otros colaboradores, usa el mismo `UPDATE` con `role='colaborador'` (no asignes admin innecesariamente).

En Supabase > Authentication > URL Configuration registra la URL oficial del sitio y las direcciones de redirección permitidas para las vistas previas que necesites usar. Ajusta la confirmación de correo en Authentication > Providers > Email.

## Permisos

- Una cuenta nueva queda **pendiente de aprobación**.
- Solo las cuentas autenticadas y aprobadas pueden leer y cargar evidencias mediante las políticas nuevas.
- Las nuevas evidencias almacenan el ID `uploaded_by` y su nombre `uploader` establecido por la base de datos.
- La ruta de borrado exige token verificado, cuenta aprobada y ser el autor o administrador. Los documentos anteriores al login solo pueden ser borrados por administradores.
- Los datos y archivos existentes se mantienen; sus documentos históricos no tienen `uploaded_by` retroactivo.

## Antes de publicar la nueva web

La web oficial antigua todavía depende de las políticas de acceso anónimo. Por seguridad y para evitar cortarla prematuramente, **no se retiraron automáticamente**. Esto significa que los accesos históricos siguen disponibles hasta que se haga la migración de cierre; el login de vista previa por sí solo no asegura el backend frente a la web antigua.

1. Prueba el registro, confirmación por correo, aprobación, inicio y cierre de sesión.
2. Haz una carga pequeña de prueba con una cuenta aprobada y verifica `uploaded_by`, `uploader` y nombre en biblioteca.
3. Prueba que una cuenta pendiente no pueda consultar ni cargar y que un usuario distinto no pueda borrar documentos de otro.
4. Revisa Vercel, la configuración de dominios y los permisos de Storage.
5. **Durante la publicación** de la web autenticada, aplica `sql/activar-login-obligatorio.sql` para revocar las políticas anónimas heredadas. Aplicarlo ahora cortaría cargas y consultas de la web oficial vigente.
