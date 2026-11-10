-- Canonicalize legacy square-unit spellings while keeping all dependent records consistent.
create or replace function private.unidade_canonica(p_unidade text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when pg_catalog.lower(pg_catalog.btrim(p_unidade)) in ('m2', 'm²') then 'm²'
    when pg_catalog.lower(pg_catalog.btrim(p_unidade)) in ('m3', 'm³') then 'm³'
    else pg_catalog.lower(pg_catalog.btrim(p_unidade))
  end;
$;

revoke all on function private.unidade_canonica(text) from public;
grant execute on function private.unidade_canonica(text) to authenticated, service_role;

create or replace function private.validar_registro()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(new);
  antigo jsonb;
  obra integer;
  ref integer;
  tabela text;
  campo text;
  v record;
begin
  if TG_OP = 'UPDATE' then
    antigo := to_jsonb(old);
    foreach campo in array array['obra_id', 'dono_id', 'autor_id', 'rdo_id', 'equipe_id', 'colaborador_id'] loop
      if campo in ('equipe_id', 'colaborador_id') and TG_TABLE_NAME <> 'equipe_colaboradores' then
        continue;
      end if;
      if j ? campo and j->campo is distinct from antigo->campo then
        raise exception 'Não é permitido transferir este registro.';
      end if;
    end loop;
  end if;

  if TG_OP = 'INSERT' and j ? 'autor_id' and (j->>'autor_id')::uuid is distinct from auth.uid() then
    raise exception 'Autor inválido.';
  end if;
  if j ? 'criado_por_id' and j->>'criado_por_id' is not null and auth.uid() is not null then
    raise exception 'Use a conta atual para registrar autoria.';
  end if;
  if TG_OP = 'UPDATE'
    and TG_TABLE_NAME = 'tarefas'
    and antigo->>'status' <> 'nao_iniciada'
    and (j - array['status', 'atualizado_em']) is distinct from (antigo - array['status', 'atualizado_em'])
    and not (
      (j - array['status', 'atualizado_em', 'unidade']) is not distinct from
        (antigo - array['status', 'atualizado_em', 'unidade'])
      and private.unidade_canonica(j->>'unidade') is not distinct from
        private.unidade_canonica(antigo->>'unidade')
    ) then
    raise exception 'Uma tarefa iniciada só pode receber registros de execução.';
  end if;

  if TG_OP = 'UPDATE'
    and TG_TABLE_NAME = 'servicos'
    and j->>'unidade' is distinct from antigo->>'unidade'
    and (
      exists (
        select 1 from public.tarefas t
        where t.servico_id = new.id
          and private.unidade_canonica(t.unidade) is distinct from private.unidade_canonica(new.unidade)
      )
      or exists (
        select 1 from public.compromissos_semanais c
        where c.servico_id = new.id
          and private.unidade_canonica(c.unidade) is distinct from private.unidade_canonica(new.unidade)
      )
      or exists (
        select 1 from public.rdos_itens i
        where i.servico_id = new.id
          and private.unidade_canonica(i.unidade) is distinct from private.unidade_canonica(new.unidade)
      )
    ) then
    raise exception 'A unidade do serviço não pode divergir dos registros vinculados.';
  end if;

  if j ? 'atualizado_em' then
    new := jsonb_populate_record(new, jsonb_build_object('atualizado_em', now()));
  end if;

  obra := (j->>'obra_id')::integer;
  if TG_TABLE_NAME = 'rdos_itens' then
    select obra_id into obra from public.rdos where id = (j->>'rdo_id')::integer;
  end if;
  if TG_TABLE_NAME in ('equipes', 'colaboradores') and obra is null then
    raise exception 'Selecione uma obra.';
  end if;
  if obra is not null and TG_OP = 'INSERT' and not exists(select 1 from public.obras where id = obra and ativo) then
    raise exception 'Restaure a obra antes de adicionar registros.';
  end if;
  if TG_TABLE_NAME = 'tarefas' and TG_OP = 'INSERT' and j->>'status' <> 'nao_iniciada' then
    raise exception 'A tarefa deve começar como não iniciada.';
  end if;
  if TG_TABLE_NAME = 'tarefas' and j->>'equipe_id' is null and j->>'colaborador_id' is null then
    raise exception 'Selecione uma equipe ou colaborador.';
  end if;

  for v in
    select * from (values
      ('frente_id', 'frentes'),
      ('equipe_id', 'equipes'),
      ('equipe_principal_id', 'equipes'),
      ('colaborador_id', 'colaboradores'),
      ('compromisso_semanal_id', 'compromissos_semanais')
    ) as x(c, t)
  loop
    if j->>v.c is not null and obra is not null then
      execute format('select obra_id from public.%I where id = $1', v.t)
        into ref using (j->>v.c)::integer;
      if ref is distinct from obra then
        raise exception 'Os vínculos devem pertencer à mesma obra.';
      end if;
    end if;
  end loop;

  if j->>'servico_id' is not null
    and (TG_OP = 'INSERT'
      or TG_TABLE_NAME <> 'tarefas'
      or (j->>'servico_id') is distinct from (antigo->>'servico_id')
      or (j->>'unidade') is distinct from (antigo->>'unidade'))
    and not exists (
      select 1 from public.servicos s
      where s.id = (j->>'servico_id')::integer
        and (s.dono_id is null or s.dono_id = auth.uid())
        and private.unidade_canonica(s.unidade) = private.unidade_canonica(j->>'unidade')
    ) then
    raise exception 'Serviço ou unidade inválidos.';
  end if;

  if TG_TABLE_NAME = 'tarefas' and j->>'compromisso_semanal_id' is not null
    and not exists (
      select 1 from public.compromissos_semanais c
      where c.id = (j->>'compromisso_semanal_id')::integer
        and c.servico_id = (j->>'servico_id')::integer
        and c.frente_id = (j->>'frente_id')::integer
        and c.equipe_id = (j->>'equipe_id')::integer
        and (j->>'data')::date between c.semana_inicio and c.semana_fim
    ) then
    raise exception 'A tarefa deve respeitar serviço, frente, equipe e período do compromisso.';
  end if;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.servicos s
    join public.tarefas t on t.servico_id = s.id
    where private.unidade_canonica(s.unidade) = 'm²'
      and private.unidade_canonica(t.unidade) is distinct from private.unidade_canonica(s.unidade)
    union all
    select 1
    from public.servicos s
    join public.compromissos_semanais c on c.servico_id = s.id
    where private.unidade_canonica(s.unidade) = 'm²'
      and private.unidade_canonica(c.unidade) is distinct from private.unidade_canonica(s.unidade)
    union all
    select 1
    from public.servicos s
    join public.rdos_itens i on i.servico_id = s.id
    where private.unidade_canonica(s.unidade) = 'm²'
      and private.unidade_canonica(i.unidade) is distinct from private.unidade_canonica(s.unidade)
  ) then
    raise exception 'Há registros de serviço em unidade incompatível; a padronização foi cancelada.';
  end if;
end;
$$;

update public.tarefas t
set unidade = 'm²'
from public.servicos s
where s.id = t.servico_id
  and private.unidade_canonica(s.unidade) = 'm²'
  and private.unidade_canonica(t.unidade) = 'm²'
  and t.unidade is distinct from 'm²';

update public.compromissos_semanais c
set unidade = 'm²'
from public.servicos s
where s.id = c.servico_id
  and private.unidade_canonica(s.unidade) = 'm²'
  and private.unidade_canonica(c.unidade) = 'm²'
  and c.unidade is distinct from 'm²';

update public.rdos_itens i
set unidade = 'm²'
from public.servicos s
where s.id = i.servico_id
  and private.unidade_canonica(s.unidade) = 'm²'
  and private.unidade_canonica(i.unidade) = 'm²'
  and i.unidade is distinct from 'm²';

update public.servicos s
set unidade = 'm²'
where private.unidade_canonica(s.unidade) = 'm²'
  and s.unidade is distinct from 'm²';
