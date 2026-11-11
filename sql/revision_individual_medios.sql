-- Revisión granular por medio de logro, independiente del seguimiento y la revisión histórica por punto.
-- Migración no destructiva: no altera evidencias, seguimiento ni point_reviews.
create table if not exists public.medium_reviews (
  medium_id text not null,
  standard_id integer not null check (standard_id between 1 and 18),
  reviewer_id uuid not null references auth.users(id),
  reviewer_name text not null,
  reviewed_at timestamptz not null default now(),
  primary key (medium_id, reviewer_id)
);
alter table public.medium_reviews enable row level security;
revoke all on table public.medium_reviews from anon;
grant select,insert,delete on table public.medium_reviews to authenticated;

create or replace function public.stamp_medium_review()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para revisar medios';
  end if;
  select full_name into actor_name from public.profiles
  where id=(select auth.uid()) and approved=true;
  if coalesce(trim(actor_name),'')='' then
    raise exception 'Solo las cuentas aprobadas pueden registrar revisiones';
  end if;
  new.reviewer_id:=(select auth.uid());
  new.reviewer_name:=actor_name;
  new.reviewed_at:=now();
  return new;
end;
$$;
revoke all on function public.stamp_medium_review() from public,anon;
grant execute on function public.stamp_medium_review() to authenticated;

drop trigger if exists stamp_medium_review on public.medium_reviews;
create trigger stamp_medium_review before insert or update on public.medium_reviews
for each row execute function public.stamp_medium_review();

drop policy if exists medium_reviews_approved_read on public.medium_reviews;
create policy medium_reviews_approved_read on public.medium_reviews for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved=true));
drop policy if exists medium_reviews_own_insert on public.medium_reviews;
create policy medium_reviews_own_insert on public.medium_reviews for insert to authenticated
with check (reviewer_id=(select auth.uid()) and exists(select 1 from public.profiles p
 where p.id=(select auth.uid()) and p.approved=true));
drop policy if exists medium_reviews_own_delete on public.medium_reviews;
create policy medium_reviews_own_delete on public.medium_reviews for delete to authenticated
using (reviewer_id=(select auth.uid()) and exists(select 1 from public.profiles p
 where p.id=(select auth.uid()) and p.approved=true));
