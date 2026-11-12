-- Human review is required before an IFC revision can supply new BIM packages.
alter table public.bim_importacoes
  add column conferida_por uuid references auth.users(id),
  add column conferida_em timestamptz,
  add constraint bim_conferencia_par check ((conferida_por is null) = (conferida_em is null));

create or replace function private.bim_guard_importacao()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
  if old.estado = 'aguardando_envio' and new.estado = 'pendente'
     and (to_jsonb(new) - 'estado') = (to_jsonb(old) - 'estado') then
    return new;
  end if;
  if old.estado = 'concluida' and new.estado = 'concluida'
     and old.conferida_em is null and new.conferida_por = auth.uid()
     and new.conferida_em is null
     and (to_jsonb(new) - 'conferida_por') = (to_jsonb(old) - 'conferida_por') then
    if not exists (
      select 1 from public.bim_quantidades q
      where q.importacao_id = old.id and q.valor > 0 and q.pendencia is null
    ) then
      raise exception 'A revisão não tem quantitativo válido para conferir';
    end if;
    new.conferida_em := now();
    return new;
  end if;
  raise exception 'Alteração da revisão IFC não permitida';
end;
$$;

create policy bim_importacoes_conferir on public.bim_importacoes
  for update to authenticated
  using (estado = 'concluida' and conferida_em is null
    and private.papel_obra(obra_id) in ('administrador','engenheiro'))
  with check (estado = 'concluida' and conferida_por = (select auth.uid())
    and private.papel_obra(obra_id) in ('administrador','engenheiro'));

create function private.bim_exigir_conferencia_pacote()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.bim_importacoes i
    where i.id = new.importacao_id and i.obra_id = new.obra_id
      and i.estado = 'concluida' and i.conferida_em is not null
  ) then
    raise exception 'Confira a revisão IFC antes de criar pacotes BIM';
  end if;
  return new;
end;
$$;
create trigger bim_exigir_conferencia_pacote
  before insert on public.bim_pacotes
  for each row execute function private.bim_exigir_conferencia_pacote();
