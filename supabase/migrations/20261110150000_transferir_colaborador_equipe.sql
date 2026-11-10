-- Change a worker's team in one transaction while retaining the previous membership interval.
create or replace function public.transferir_colaborador_equipe(
  p_vinculo_id integer,
  p_equipe_destino_id integer,
  p_data_inicio date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_colaborador_id integer;
  v_obra_id integer;
  v_obra_destino_id integer;
  v_equipe_origem_id integer;
  v_inicio_origem date;
  v_fim_origem date;
  v_ativo_colaborador boolean;
  v_papel text;
  v_hoje date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_novo_vinculo_id integer;
begin
  if v_usuario is null then
    raise exception 'Entre novamente para transferir o colaborador.';
  end if;
  if p_vinculo_id is null or p_equipe_destino_id is null or p_data_inicio is null then
    raise exception 'Informe o vínculo, a equipe de destino e a data da transferência.';
  end if;
  if p_data_inicio <> v_hoje then
    raise exception 'A transferência deve ser registrada na data em que entrar em vigor.';
  end if;

  select c.id, c.obra_id, c.ativo, ec.equipe_id, ec.data_inicio, ec.data_fim
    into v_colaborador_id, v_obra_id, v_ativo_colaborador,
         v_equipe_origem_id, v_inicio_origem, v_fim_origem
  from public.equipe_colaboradores ec
  join public.colaboradores c on c.id = ec.colaborador_id
  where ec.id = p_vinculo_id
    and ec.ativo
  for update of ec, c;

  if not found or v_obra_id is null then
    raise exception 'O vínculo ativo não foi encontrado.';
  end if;
  if not v_ativo_colaborador then
    raise exception 'O colaborador está desligado.';
  end if;

  v_papel := private.papel_obra(v_obra_id);
  if v_papel is null or v_papel not in ('administrador', 'engenheiro', 'supervisor') then
    raise exception 'Seu perfil não pode transferir colaboradores nesta obra.';
  end if;

  if p_data_inicio <= v_inicio_origem then
    raise exception 'A transferência precisa começar depois do início do vínculo atual.';
  end if;
  if v_fim_origem is not null and v_fim_origem < p_data_inicio then
    raise exception 'O vínculo selecionado já terminou antes da transferência.';
  end if;
  if p_equipe_destino_id = v_equipe_origem_id then
    raise exception 'Selecione uma equipe diferente da equipe atual.';
  end if;

  select e.obra_id into v_obra_destino_id
  from public.equipes e
  where e.id = p_equipe_destino_id
    and e.ativo
  for update;

  if not found or v_obra_destino_id is distinct from v_obra_id then
    raise exception 'A equipe de destino precisa estar ativa na mesma obra.';
  end if;

  if exists (
    select 1
    from public.equipe_colaboradores ec
    where ec.colaborador_id = v_colaborador_id
      and ec.equipe_id = p_equipe_destino_id
      and ec.ativo
      and (ec.data_fim is null or ec.data_fim >= p_data_inicio)
  ) then
    raise exception 'O colaborador já tem um vínculo ativo ou futuro com essa equipe.';
  end if;

  update public.equipe_colaboradores
  set ativo = false,
      data_fim = p_data_inicio - 1
  where id = p_vinculo_id
    and ativo;

  if not found then
    raise exception 'O vínculo mudou enquanto a transferência era registrada. Atualize a tela e tente novamente.';
  end if;

  insert into public.equipe_colaboradores (
    equipe_id, colaborador_id, data_inicio, data_fim, ativo
  )
  values (
    p_equipe_destino_id, v_colaborador_id, p_data_inicio, null, true
  )
  returning id into v_novo_vinculo_id;

  update public.colaboradores
  set equipe_principal_id = p_equipe_destino_id
  where id = v_colaborador_id
    and obra_id = v_obra_id
    and ativo;

  if not found then
    raise exception 'Não foi possível atualizar a equipe principal do colaborador.';
  end if;

  return v_novo_vinculo_id;
end;
$$;

revoke all on function public.transferir_colaborador_equipe(integer, integer, date) from public, anon;
grant execute on function public.transferir_colaborador_equipe(integer, integer, date) to authenticated;
