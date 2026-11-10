-- Read-only projection for clients already assigned to the work.
create function private.dashboard_obra_cliente(p_obra integer)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.papel_obra(p_obra) is distinct from 'cliente' then
    raise exception 'Acesso negado ao dashboard desta obra.' using errcode = '42501';
  end if;
  return (
    with tasks as (
      select id, data, status, servico_id, frente_id, equipe_id, compromisso_semanal_id,
        quantidade_meta, unidade, horas_previstas,
        coalesce(observacao like 'SIMULACAO ANUAL 2026-2027%', false) as simulacao
      from public.tarefas where obra_id = p_obra
    ), plan as (
      select id, semana_inicio, semana_fim, servico_id, frente_id, equipe_id, quantidade_meta, unidade,
        coalesce(observacao like 'SIMULACAO ANUAL 2026-2027%', false) as simulacao
      from public.compromissos_semanais where obra_id = p_obra
    ), diaries as (
      select id, data, clima, coalesce(strpos(observacao_geral, 'SIMULACAO ANUAL 2026-2027') > 0, false) as simulacao
      from public.rdos where obra_id = p_obra
    ), items as (
      select i.id, i.rdo_id, t.id as tarefa_id, i.frente_id, i.servico_id, i.equipe_id, i.quantidade_realizada, i.unidade
      from public.rdos_itens i join diaries r on r.id = i.rdo_id left join tasks t on t.id = i.tarefa_id
    ), workforce as (
      select c.id as internal_id, row_number() over (order by c.id) as id, c.ativo, c.data_admissao
      from public.colaboradores c where c.obra_id = p_obra
    ), service_ids as (
      select servico_id from tasks union select servico_id from plan union select servico_id from items
    )
    select jsonb_build_object(
      'tarefas', coalesce((select jsonb_agg(t) from tasks t), '[]'::jsonb),
      'compromissos_semanais', coalesce((select jsonb_agg(p) from plan p), '[]'::jsonb),
      'rdos', coalesce((select jsonb_agg(r) from diaries r), '[]'::jsonb),
      'rdos_itens', coalesce((select jsonb_agg(i) from items i), '[]'::jsonb),
      'frentes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'nivel', f.nivel))
        from public.frentes f where f.obra_id = p_obra), '[]'::jsonb),
      'equipes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome))
        from public.equipes e where e.obra_id = p_obra), '[]'::jsonb),
      'servicos', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'unidade', s.unidade, 'produtividade_referencia', s.produtividade_referencia))
        from public.servicos s join service_ids i on i.servico_id = s.id), '[]'::jsonb),
      'evolucoes_tarefa', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tarefa_id', e.tarefa_id,
        'tipo', e.tipo, 'timestamp', e.timestamp, 'quantidade_realizada', e.quantidade_realizada, 'motivo_impedimento', e.motivo_impedimento))
        from public.evolucoes_tarefa e join tasks t on t.id = e.tarefa_id), '[]'::jsonb),
      'evidencias_tarefa', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tarefa_id', e.tarefa_id, 'criado_em', e.criado_em))
        from public.evidencias_tarefa e join tasks t on t.id = e.tarefa_id), '[]'::jsonb),
      'colaboradores', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'ativo', c.ativo, 'data_admissao', c.data_admissao))
        from workforce c), '[]'::jsonb),
      'colaborador_periodos', coalesce((select jsonb_agg(jsonb_build_object('colaborador_id', c.id,
        'data_admissao', p.data_admissao, 'data_desligamento', p.data_desligamento, 'origem', p.origem))
        from public.colaborador_periodos p join workforce c on c.internal_id = p.colaborador_id
        where p.obra_id = p_obra), '[]'::jsonb),
      'equipe_colaboradores', coalesce((select jsonb_agg(jsonb_build_object('equipe_id', e.id,
        'colaborador_id', c.id, 'data_inicio', m.data_inicio, 'data_fim', m.data_fim))
        from public.equipe_colaboradores m join workforce c on c.internal_id = m.colaborador_id
        join public.equipes e on e.id = m.equipe_id and e.obra_id = p_obra), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function private.dashboard_obra_cliente(integer) from public, anon, authenticated;
grant execute on function private.dashboard_obra_cliente(integer) to authenticated;

create function public.dashboard_obra_cliente(p_obra integer)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.dashboard_obra_cliente(p_obra); $$;
revoke all on function public.dashboard_obra_cliente(integer) from public, anon, authenticated;
grant execute on function public.dashboard_obra_cliente(integer) to authenticated;
