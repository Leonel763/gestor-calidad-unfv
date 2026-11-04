-- EJECUTAR ÚNICAMENTE CUANDO LA VERSIÓN CON LOGIN ESTÉ PROBADA Y
-- VAYA A REEMPLAZAR A LA WEB OFICIAL.
-- No ejecutar mientras la web oficial anónima siga en uso: bloquearía sus consultas y cargas.
begin;
drop policy if exists "agregar evidencias" on public.evidencias;
drop policy if exists "leer evidencias" on public.evidencias;
drop policy if exists "crear seguimiento" on public.seguimiento;
drop policy if exists "editar seguimiento" on public.seguimiento;
drop policy if exists "leer seguimiento" on public.seguimiento;
drop policy if exists "cargar evidencias" on storage.objects;
drop policy if exists "leer evidencias storage" on storage.objects;
drop policy if exists "initial matrix upload only" on storage.objects;
-- La matriz pública puede continuar siendo visible si se desea;
-- los documentos y el seguimiento ya solo admiten usuarios autenticados aprobados.
commit;
