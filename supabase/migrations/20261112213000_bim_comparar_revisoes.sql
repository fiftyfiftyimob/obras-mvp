create function public.comparar_revisoes_bim(p_base uuid,p_nova uuid)
returns table (
  global_id text,
  classe_anterior text, classe_nova text,
  elemento_anterior text, elemento_novo text,
  local_anterior text, local_novo text,
  medida text, unidade text,
  valor_anterior numeric, valor_novo numeric, delta numeric,
  situacao text, observacao text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_obra integer;
begin
  select obra_id into v_obra from public.bim_importacoes where id=p_base and estado='concluida';
  if v_obra is null or p_nova=p_base
     or not exists (select 1 from public.bim_importacoes where id=p_nova and obra_id=v_obra and estado='concluida')
     or not coalesce(private.possui_obra(v_obra),false) then
    raise exception 'Selecione duas revisões concluídas da mesma obra'; end if;
  return query
  with anterior as (
    select e.id as elemento_id,e.global_id,e.classe,e.nome as elemento_nome,e.local,
      q.conjunto,q.nome as medida_nome,q.tipo,private.unidade_canonica(q.unidade) as unidade,
      sum(q.valor) as valor,bool_or(q.pendencia is not null or q.valor is null) as pendente
    from public.bim_elementos e
    join public.bim_quantidades q on q.elemento_id=e.id and q.importacao_id=e.importacao_id
    where e.importacao_id=p_base
    group by e.id,e.global_id,e.classe,e.nome,e.local,q.conjunto,q.nome,q.tipo,private.unidade_canonica(q.unidade)
  ), nova as (
    select e.id as elemento_id,e.global_id,e.classe,e.nome as elemento_nome,e.local,
      q.conjunto,q.nome as medida_nome,q.tipo,private.unidade_canonica(q.unidade) as unidade,
      sum(q.valor) as valor,bool_or(q.pendencia is not null or q.valor is null) as pendente
    from public.bim_elementos e
    join public.bim_quantidades q on q.elemento_id=e.id and q.importacao_id=e.importacao_id
    where e.importacao_id=p_nova
    group by e.id,e.global_id,e.classe,e.nome,e.local,q.conjunto,q.nome,q.tipo,private.unidade_canonica(q.unidade)
  )
  select coalesce(a.global_id,n.global_id),
    a.classe,n.classe,a.elemento_nome,n.elemento_nome,a.local,n.local,
    coalesce(a.medida_nome,n.medida_nome,a.tipo,n.tipo),
    coalesce(a.unidade,n.unidade),
    a.valor,n.valor,
    case when a.pendente or n.pendente then null
      else coalesce(n.valor,0)-coalesce(a.valor,0) end,
    case
      when coalesce(a.global_id,n.global_id) is null then 'verificar_identificador'
      when a.elemento_id is null then 'adicionado'
      when n.elemento_id is null then 'removido'
      when a.pendente or n.pendente then 'pendente'
      when a.valor is distinct from n.valor or a.classe is distinct from n.classe
        or a.elemento_nome is distinct from n.elemento_nome or a.local is distinct from n.local then 'alterado'
      else 'igual'
    end,
    case
      when coalesce(a.global_id,n.global_id) is null then 'Elemento sem GlobalId; confirme a correspondência manualmente.'
      when a.elemento_id is null or n.elemento_id is null then 'Confira se houve inclusão, exclusão ou troca de GlobalId.'
      when a.pendente or n.pendente then 'Uma das medições tem pendência.'
      else null
    end
  from anterior a full join nova n
    on a.global_id=n.global_id and a.global_id is not null
    and a.conjunto is not distinct from n.conjunto
    and a.medida_nome is not distinct from n.medida_nome
    and a.tipo=n.tipo and a.unidade is not distinct from n.unidade
  order by coalesce(a.global_id,n.global_id) nulls last,
    coalesce(a.medida_nome,n.medida_nome,a.tipo,n.tipo);
end;
$$;
revoke all on function public.comparar_revisoes_bim(uuid,uuid) from public;
grant execute on function public.comparar_revisoes_bim(uuid,uuid) to authenticated;
