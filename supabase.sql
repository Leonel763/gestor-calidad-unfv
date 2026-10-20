-- Crea estas tablas en un proyecto NUEVO y exclusivo para el gestor. No se recomienda
-- usarlo para documentos sensibles antes de habilitar autenticación y roles.
create table if not exists public.evidencias (
 id uuid primary key default gen_random_uuid(), point_id text not null,
 file_name text not null, file_path text not null unique, mime_type text not null,
 size_bytes bigint not null check(size_bytes > 0 and size_bytes <= 15728640),
 uploader text not null default 'Colaborador', notes text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.seguimiento (
 point_id text primary key, status text not null default 'pendiente'
 check(status in ('pendiente','en_proceso','complementar','completo')),
 notes text not null default '', updated_at timestamptz not null default now()
);
-- Política pública de colaboración por enlace: cualquier visitante puede consultar y agregar
-- evidencias. No incluye borrar ni editar documentos. Solo usar para contenido no confidencial.
alter table public.evidencias enable row level security;
alter table public.seguimiento enable row level security;
create policy "leer evidencias" on public.evidencias for select to anon using (true);
create policy "agregar evidencias" on public.evidencias for insert to anon with check (
 file_path ~ '^evidencias/[0-9a-f-]{36}/[a-zA-Z0-9._-]+$' and
 mime_type in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg')
);
create policy "leer seguimiento" on public.seguimiento for select to anon using (true);
create policy "crear seguimiento" on public.seguimiento for insert to anon with check (true);
create policy "editar seguimiento" on public.seguimiento for update to anon using (true) with check (true);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('evidencias','evidencias',false,15728640,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg'])
on conflict (id) do nothing;
-- Storage privately served with authenticated signed URLs (security upgrade for production recommended).
create policy "cargar evidencias" on storage.objects for insert to anon
with check (bucket_id='evidencias' and name ~ '^evidencias/[0-9a-f-]{36}/[a-zA-Z0-9._-]+$');
create policy "leer evidencias storage" on storage.objects for select to anon
using (bucket_id='evidencias');