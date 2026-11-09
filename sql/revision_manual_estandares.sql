-- Revisión manual, independiente del porcentaje de medios completos.
-- Los datos existentes de evidencias/seguimiento no se modifican.
create table if not exists public.standard_reviews (
  standard_id integer primary key check (standard_id between 1 and 18),
  status text not null check (status in ('en_revision', 'revisado')),
  reviewed_by uuid not null references auth.users(id),
  reviewer_name text not null,
  reviewed_at timestamptz not null default now()
);

alter table public.standard_reviews enable row level security;
revoke all on table public.standard_reviews from anon;
grant select, insert, update, delete on table public.standard_reviews to authenticated;

-- Identidad y sello horario se imponen en el servidor, nunca desde el navegador.
create or replace function public.stamp_standard_review()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  new.reviewed_by := (select auth.uid());
  select p.full_name into new.reviewer_name
    from public.profiles p
    where p.id = new.reviewed_by and p.approved = true and p.role = 'admin';
  if coalesce(new.reviewer_name,'') = '' then
    raise exception 'Solo un administrador aprobado puede revisar estándares';
  end if;
  new.reviewed_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_standard_review() from public, anon;
grant execute on function public.stamp_standard_review() to authenticated;

drop trigger if exists stamp_standard_review on public.standard_reviews;
create trigger stamp_standard_review before insert or update on public.standard_reviews
  for each row execute function public.stamp_standard_review();

drop policy if exists standard_reviews_approved_read on public.standard_reviews;
create policy standard_reviews_approved_read on public.standard_reviews
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.approved = true
  ));

drop policy if exists standard_reviews_admin_insert on public.standard_reviews;
create policy standard_reviews_admin_insert on public.standard_reviews
  for insert to authenticated
  with check (
    reviewed_by = (select auth.uid()) and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.approved = true and p.role = 'admin'
    )
  );

drop policy if exists standard_reviews_admin_update on public.standard_reviews;
create policy standard_reviews_admin_update on public.standard_reviews
  for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.approved = true and p.role = 'admin'
  ))
  with check (
    reviewed_by = (select auth.uid()) and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.approved = true and p.role = 'admin'
    )
  );

drop policy if exists standard_reviews_admin_delete on public.standard_reviews;
create policy standard_reviews_admin_delete on public.standard_reviews
  for delete to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.approved = true and p.role = 'admin'
  ));
