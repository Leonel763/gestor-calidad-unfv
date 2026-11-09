-- Una revisión independiente por persona y estándar.
-- Amplía la tabla existente; las marcas anteriores conservan su revisor y fecha.
-- No modifica la matriz, las evidencias, las cuentas ni el seguimiento.
alter table public.standard_reviews
  drop constraint if exists standard_reviews_pkey;
alter table public.standard_reviews
  add constraint standard_reviews_pkey primary key (standard_id, reviewed_by);

-- Las marcas siempre pertenecen a la cuenta autenticada.
create or replace function public.stamp_standard_review()
returns trigger
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  current_reviewer uuid;
  current_name text;
begin
  current_reviewer := (select auth.uid());
  if current_reviewer is null then
    raise exception 'Debes iniciar sesión para registrar una revisión';
  end if;
  select p.full_name
    into current_name
    from public.profiles p
    where p.id = current_reviewer and p.approved = true;
  if coalesce(nullif(trim(current_name), ''), '') = '' then
    raise exception 'Solo cuentas autorizadas pueden registrar revisiones';
  end if;
  if tg_op = 'UPDATE' and old.reviewed_by <> current_reviewer then
    raise exception 'Solo puedes modificar tu propia revisión';
  end if;
  new.reviewed_by := current_reviewer;
  new.reviewer_name := current_name;
  new.reviewed_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_standard_review() from public, anon;
grant execute on function public.stamp_standard_review() to authenticated;

-- RLS: lectura compartida de revisiones y escritura individual, incluso para
-- administradores; un usuario no puede cambiar la marca de otra persona.
drop policy if exists standard_reviews_admin_insert on public.standard_reviews;
drop policy if exists standard_reviews_admin_update on public.standard_reviews;
drop policy if exists standard_reviews_admin_delete on public.standard_reviews;
drop policy if exists standard_reviews_self_insert on public.standard_reviews;
drop policy if exists standard_reviews_self_update on public.standard_reviews;
drop policy if exists standard_reviews_self_delete on public.standard_reviews;

create policy standard_reviews_self_insert
  on public.standard_reviews for insert to authenticated
  with check (
    reviewed_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.approved = true
    )
  );

create policy standard_reviews_self_update
  on public.standard_reviews for update to authenticated
  using (
    reviewed_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.approved = true
    )
  )
  with check (
    reviewed_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.approved = true
    )
  );

create policy standard_reviews_self_delete
  on public.standard_reviews for delete to authenticated
  using (
    reviewed_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.approved = true
    )
  );

-- Conservar la política standard_reviews_approved_read para que el equipo
-- autorizado pueda ver quién revisó cada estándar.
revoke all on table public.standard_reviews from anon;
grant select, insert, update, delete on table public.standard_reviews to authenticated;
comment on table public.standard_reviews is
  'Revisiones manuales independientes por usuario y estándar; no representan aprobación final institucional.';
