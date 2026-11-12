create table public.bim_vinculos_servico (
  quantidade_id bigint primary key references public.bim_quantidades(id) on delete cascade,
  obra_id integer not null references public.obras(id),
  importacao_id uuid not null references public.bim_importacoes(id) on delete cascade,
  servico_id integer not null references public.servicos(id),
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index bim_vinculos_servico_obra_idx on public.bim_vinculos_servico (obra_id, importacao_id, servico_id);
create function private.validar_bim_vinculo_servico()
returns trigger language plpgsql set search_path = '' as $$
declare q record; s record;
begin
  select obra_id, importacao_id, valor, unidade, pendencia into q
    from public.bim_quantidades where id = new.quantidade_id;
  select unidade, ativo, dono_id into s from public.servicos where id = new.servico_id;
  if q.obra_id is distinct from new.obra_id or q.importacao_id is distinct from new.importacao_id
     or q.valor is null or q.valor <= 0 or q.pendencia is not null
     or s.ativo is distinct from true or not (s.dono_id is null or s.dono_id = auth.uid())
     or replace(replace(lower(coalesce(q.unidade,'')), '²', '2'), '³', '3')
        <> replace(replace(lower(coalesce(s.unidade,'')), '²', '2'), '³', '3') then
    raise exception 'Quantitativo e serviço incompatíveis';
  end if;
  if not exists (select 1 from public.bim_importacoes i
      where i.id = new.importacao_id and i.obra_id = new.obra_id and i.estado = 'concluida') then
    raise exception 'Revisão BIM ainda não concluída';
  end if;
  return new;
end;
$$;
create trigger validar_bim_vinculo_servico before insert or update on public.bim_vinculos_servico
for each row execute function private.validar_bim_vinculo_servico();
alter table public.bim_vinculos_servico enable row level security;
create policy bim_vinculos_ler on public.bim_vinculos_servico for select to authenticated
using (private.possui_obra(obra_id));
create policy bim_vinculos_criar on public.bim_vinculos_servico for insert to authenticated
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor') and criado_por = auth.uid());
create policy bim_vinculos_alterar on public.bim_vinculos_servico for update to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor'))
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor'));
create policy bim_vinculos_excluir on public.bim_vinculos_servico for delete to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor'));
grant select, insert, update, delete on public.bim_vinculos_servico to authenticated;
grant all on public.bim_vinculos_servico to service_role;