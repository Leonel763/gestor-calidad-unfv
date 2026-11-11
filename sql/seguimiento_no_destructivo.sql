-- Cambios ADITIVOS: no se actualiza ni borra ninguna evidencia, archivo ni estado preexistente.
create table if not exists public.point_reviews (
  point_id text not null,
  standard_id integer not null check (standard_id between 1 and 18),
  reviewer_id uuid not null references auth.users(id),
  reviewer_name text not null,
  reviewed_at timestamptz not null default now(),
  primary key (point_id, reviewer_id)
);
alter table public.point_reviews enable row level security;
revoke all on public.point_reviews from anon;
grant select, insert, update, delete on public.point_reviews to authenticated;
create index if not exists point_reviews_reviewer_idx on public.point_reviews(reviewer_id);
create index if not exists point_reviews_standard_idx on public.point_reviews(standard_id);

create or replace function public.stamp_point_review()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare name_value text;
begin
  if (select auth.uid()) is null then raise exception 'Se requiere una sesión válida'; end if;
  if tg_op='UPDATE' and (old.reviewer_id<>auth.uid() or old.point_id<>new.point_id) then
    raise exception 'No se puede cambiar el propietario de la revisión';
  end if;
  select p.full_name into name_value from public.profiles p
  where p.id=(select auth.uid()) and p.approved=true;
  if name_value is null then raise exception 'Cuenta no autorizada'; end if;
  new.reviewer_id := (select auth.uid());
  new.reviewer_name := name_value;
  new.reviewed_at := now();
  return new;
end $$;
revoke all on function public.stamp_point_review() from public,anon;
grant execute on function public.stamp_point_review() to authenticated;
create trigger trg_stamp_point_review before insert or update on public.point_reviews
for each row execute function public.stamp_point_review();

create policy point_review_read on public.point_reviews for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved));
create policy point_review_insert on public.point_reviews for insert to authenticated
with check(reviewer_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved));
create policy point_review_update on public.point_reviews for update to authenticated
using(reviewer_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved))
with check(reviewer_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved));
create policy point_review_delete on public.point_reviews for delete to authenticated
using(reviewer_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved));

create table if not exists public.media_exclusions (
  point_id text primary key,
  reason text not null check(length(trim(reason)) between 10 and 500),
  excluded_by uuid not null references auth.users(id),
  excluded_by_name text not null,
  excluded_at timestamptz not null default now()
);
alter table public.media_exclusions enable row level security;
revoke all on public.media_exclusions from anon;
grant select,insert,update,delete on public.media_exclusions to authenticated;
create index if not exists media_exclusions_author_idx on public.media_exclusions(excluded_by);
create or replace function public.stamp_media_exclusion()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare name_value text;
begin
  if tg_op='UPDATE' and old.point_id <> new.point_id then
    raise exception 'No se puede cambiar el medio excluido';
  end if;
  select p.full_name into name_value from public.profiles p where
  p.id=(select auth.uid()) and p.approved=true and p.role='admin';
  if name_value is null then raise exception 'Solo un administrador autorizado puede cambiar exclusiones'; end if;
  new.excluded_by:=(select auth.uid());
  new.excluded_by_name:=name_value;
  new.excluded_at:=now();
  return new;
end $$;
revoke all on function public.stamp_media_exclusion() from public,anon;
grant execute on function public.stamp_media_exclusion() to authenticated;
create trigger trg_stamp_media_exclusion before insert or update on public.media_exclusions
for each row execute function public.stamp_media_exclusion();
create policy media_exclusions_read on public.media_exclusions for select to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved));
create policy media_exclusions_insert on public.media_exclusions for insert to authenticated
with check(excluded_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved and p.role='admin'));
create policy media_exclusions_delete on public.media_exclusions for delete to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved and p.role='admin'));
create policy media_exclusions_update on public.media_exclusions for update to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved and p.role='admin'))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved and p.role='admin'));

-- Papelera lógica: los objetos y las filas de evidencias siguen intactos.
create table if not exists public.evidence_trash (
  evidence_id uuid primary key references public.evidencias(id) on delete cascade,
  trashed_by uuid not null references auth.users(id),
  trashed_by_name text not null,
  trashed_at timestamptz not null default now()
);
alter table public.evidence_trash enable row level security;
revoke all on public.evidence_trash from anon;
grant select,insert,delete on public.evidence_trash to authenticated;
create index if not exists evidence_trash_actor_idx on public.evidence_trash(trashed_by);
create policy trash_read on public.evidence_trash for select to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved));
create policy trash_insert on public.evidence_trash for insert to authenticated
with check(
 trashed_by=(select auth.uid()) and exists(
 select 1 from public.evidencias e join public.profiles p on p.id=(select auth.uid())
 where e.id=evidence_id and p.approved and (p.role='admin' or e.uploaded_by=(select auth.uid()))
 ));
create policy trash_restore on public.evidence_trash for delete to authenticated
using(exists(
 select 1 from public.evidencias e join public.profiles p on p.id=(select auth.uid())
 where e.id=evidence_id and p.approved and (p.role='admin' or e.uploaded_by=(select auth.uid()))
));
comment on table public.evidence_trash is 'Papelera lógica reversible: jamás borra archivos de Supabase Storage.';
comment on table public.point_reviews is 'Checks de puntos por usuario, independientes de conformidad final institucional.';
comment on table public.media_exclusions is 'No aplica institucional con justificación y autorización de administrador.';
