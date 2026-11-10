create or replace function private.validar_alocacao_tarefa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tem_historico boolean;
  data_admissao_legada date;
begin
  if new.colaborador_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.colaborador_periodos cp
    where cp.obra_id = new.obra_id
      and cp.colaborador_id = new.colaborador_id
  ) into tem_historico;

  if tem_historico then
    if not exists (
      select 1
      from public.colaborador_periodos cp
      where cp.obra_id = new.obra_id
        and cp.colaborador_id = new.colaborador_id
        and cp.data_admissao <= new.data
        and (cp.data_desligamento is null or cp.data_desligamento >= new.data)
    ) then
      raise exception 'O colaborador não estava admitido na data da tarefa.';
    end if;
  else
    select c.data_admissao
      into data_admissao_legada
    from public.colaboradores c
    where c.id = new.colaborador_id
      and c.obra_id = new.obra_id;

    if data_admissao_legada is not null and new.data < data_admissao_legada then
      raise exception 'A data da tarefa é anterior à admissão do colaborador.';
    end if;
  end if;

  if new.equipe_id is not null and not exists (
    select 1
    from public.equipe_colaboradores ec
    where ec.equipe_id = new.equipe_id
      and ec.colaborador_id = new.colaborador_id
      and ec.data_inicio <= new.data
      and (ec.data_fim is null or ec.data_fim >= new.data)
  ) then
    raise exception 'O colaborador não estava vinculado à equipe escolhida na data da tarefa.';
  end if;

  return new;
end;
$$;

revoke all on function private.validar_alocacao_tarefa() from public, anon, authenticated;

drop trigger if exists validar_alocacao_tarefa on public.tarefas;
create trigger validar_alocacao_tarefa
before insert or update of data, equipe_id, colaborador_id
on public.tarefas
for each row
execute function private.validar_alocacao_tarefa();
