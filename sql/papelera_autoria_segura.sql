-- Solo protege la autoría y fecha de la papelera nueva; no altera evidencias.
create or replace function public.stamp_evidence_trash()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor_name text;
begin
  select p.full_name into actor_name from public.profiles p
  where p.id=(select auth.uid()) and p.approved=true;
  if actor_name is null then raise exception 'Cuenta no autorizada'; end if;
  new.trashed_by:=(select auth.uid());
  new.trashed_by_name:=actor_name;
  new.trashed_at:=now();
  return new;
end $$;
revoke all on function public.stamp_evidence_trash() from public,anon;
grant execute on function public.stamp_evidence_trash() to authenticated;
drop trigger if exists trg_stamp_evidence_trash on public.evidence_trash;
create trigger trg_stamp_evidence_trash before insert on public.evidence_trash
for each row execute function public.stamp_evidence_trash();
