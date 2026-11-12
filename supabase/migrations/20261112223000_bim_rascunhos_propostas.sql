alter table public.bim_pacotes
  add column cancelado_em timestamptz,
  add column cancelado_por uuid;

create or replace function private.validar_capacidade_pacote_bim()
returns trigger language plpgsql set search_path = '' as $$
declare v_prod numeric;
begin
  if old.estado='rascunho' and new.estado='aprovado' then
    if old.cancelado_em is not null then raise exception 'Rascunho descartado não pode ser aprovado'; end if;
    if new.horas_equipe_previstas is null then
      raise exception 'Informe as horas disponíveis da equipe antes de aprovar'; end if;
    select produtividade_referencia into v_prod from public.servicos where id=new.servico_id;
    if v_prod is not null and v_prod > 0
       and new.quantidade_meta > v_prod * new.horas_equipe_previstas then
      raise exception 'Meta acima da capacidade estimada; aumente as horas ou reveja o pacote'; end if;
    new.produtividade_referencia := v_prod;
  end if;
  return new;
end;
$$;
create or replace function public.criar_pacote_bim(
  p_id uuid, p_obra_id integer, p_importacao_id uuid, p_codigo text, p_titulo text,
  p_frente_id integer, p_servico_id integer, p_equipe_id integer,
  p_inicio date, p_fim date, p_fontes jsonb, p_predecessores uuid[] default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_unidade text;
  v_total numeric(14,4) := 0;
  v_fonte record;
  v_quantidade public.bim_quantidades;
  v_usado numeric;
  v_predecessor public.bim_pacotes;
  v_predecessor_id uuid;
begin
  if auth.uid() is null or not coalesce(private.papel_obra(p_obra_id) in ('administrador','engenheiro','supervisor'),false)
     or not exists (select 1 from public.obras where id=p_obra_id and ativo) then
    raise exception 'Acesso negado ao planejamento BIM'; end if;
  if p_id is null or p_importacao_id is null or nullif(trim(p_codigo),'') is null
     or nullif(trim(p_titulo),'') is null or p_inicio is null or p_fim is null or p_fim < p_inicio
     or jsonb_typeof(p_fontes) is distinct from 'array' or jsonb_array_length(p_fontes)=0 then
    raise exception 'Dados do pacote incompletos'; end if;
  if exists (select 1 from public.bim_pacotes where id=p_id) then
    raise exception 'Este pacote já foi cadastrado'; end if;
  if not exists (select 1 from public.bim_importacoes
      where id=p_importacao_id and obra_id=p_obra_id and estado='concluida') then
    raise exception 'Selecione uma revisão IFC concluída desta obra'; end if;
  if not exists (select 1 from public.frentes where id=p_frente_id and obra_id=p_obra_id and ativo)
     or not exists (select 1 from public.equipes where id=p_equipe_id and obra_id=p_obra_id and ativo) then
    raise exception 'Frente ou equipe não pertence à obra'; end if;
  select unidade into v_unidade from public.servicos where id=p_servico_id and ativo
    and (dono_id is null or dono_id=auth.uid());
  if v_unidade is null then raise exception 'Serviço indisponível para esta obra'; end if;
  if (select count(*) from jsonb_to_recordset(p_fontes) as x(quantidade_id bigint,valor numeric))
     <> (select count(distinct quantidade_id) from jsonb_to_recordset(p_fontes) as x(quantidade_id bigint,valor numeric)) then
    raise exception 'Quantitativo repetido no pacote'; end if;
  foreach v_predecessor_id in array coalesce(p_predecessores,'{}'::uuid[]) loop
    select * into v_predecessor from public.bim_pacotes where id=v_predecessor_id;
    if not found or v_predecessor.obra_id <> p_obra_id
       or v_predecessor.cancelado_em is not null
       or v_predecessor.fim > p_inicio or v_predecessor.id=p_id then
      raise exception 'Predecessor incompatível com a obra ou as datas'; end if;
  end loop;
  for v_fonte in
    select x.quantidade_id,x.valor from jsonb_to_recordset(p_fontes)
      as x(quantidade_id bigint,valor numeric) order by x.quantidade_id
  loop
    select * into v_quantidade from public.bim_quantidades where id=v_fonte.quantidade_id for update;
    if not found or v_quantidade.obra_id <> p_obra_id or v_quantidade.importacao_id <> p_importacao_id
       or v_quantidade.pendencia is not null or v_quantidade.valor is null or v_quantidade.valor <= 0
       or v_quantidade.valor::text='NaN'
       or v_fonte.valor is null or v_fonte.valor <= 0 or v_fonte.valor::text='NaN'
       or private.unidade_canonica(v_quantidade.unidade) is distinct from private.unidade_canonica(v_unidade)
       or not exists (select 1 from public.bim_vinculos_servico
         where quantidade_id=v_fonte.quantidade_id and servico_id=p_servico_id
           and obra_id=p_obra_id and importacao_id=p_importacao_id) then
      raise exception 'Fonte IFC incompatível com este serviço ou revisão'; end if;
    select coalesce(sum(f.valor),0) into v_usado from public.bim_pacote_fontes f
      join public.bim_pacotes p on p.id=f.pacote_id and p.cancelado_em is null
      where f.quantidade_id=v_fonte.quantidade_id;
    if v_usado+v_fonte.valor > v_quantidade.valor then
      raise exception 'Pacotes excedem o quantitativo IFC disponível'; end if;
    v_total := v_total+v_fonte.valor;
  end loop;
  if v_total <= 0 then raise exception 'Informe ao menos um quantitativo válido'; end if;
  insert into public.bim_pacotes
    (id,obra_id,importacao_id,codigo,titulo,frente_id,servico_id,equipe_id,inicio,fim,quantidade_meta,unidade,criado_por)
  values (p_id,p_obra_id,p_importacao_id,trim(p_codigo),trim(p_titulo),
    p_frente_id,p_servico_id,p_equipe_id,p_inicio,p_fim,v_total,v_unidade,auth.uid());
  insert into public.bim_pacote_fontes (pacote_id,quantidade_id,valor)
    select p_id,x.quantidade_id,x.valor from jsonb_to_recordset(p_fontes)
      as x(quantidade_id bigint,valor numeric);
  insert into public.bim_pacote_predecessores (pacote_id,predecessor_id)
    select p_id,unnest(coalesce(p_predecessores,'{}'::uuid[]));
  return p_id;
end;
$$;
revoke all on function public.criar_pacote_bim(uuid,integer,uuid,text,text,integer,integer,integer,date,date,jsonb,uuid[]) from public;
grant execute on function public.criar_pacote_bim(uuid,integer,uuid,text,text,integer,integer,integer,date,date,jsonb,uuid[]) to authenticated;


create function public.descartar_rascunho_pacote_bim(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.bim_pacotes;
begin
  select * into v from public.bim_pacotes where id=p_id for update;
  if not found or auth.uid() is null
     or not coalesce(private.papel_obra(v.obra_id) in ('administrador','engenheiro','supervisor'),false)
     or not exists (select 1 from public.obras where id=v.obra_id and ativo) then
    raise exception 'Acesso negado ao pacote BIM'; end if;
  if v.estado<>'rascunho' or v.cancelado_em is not null
     or exists (select 1 from public.bim_pacote_predecessores where predecessor_id=p_id)
     or exists (select 1 from public.bim_pacote_semanas where pacote_id=p_id) then
    raise exception 'Este rascunho já tem dependências ou semanas'; end if;
  update public.bim_pacotes set cancelado_em=now(),cancelado_por=auth.uid() where id=p_id;
  return p_id;
end;
$$;
revoke all on function public.descartar_rascunho_pacote_bim(uuid) from public;
grant execute on function public.descartar_rascunho_pacote_bim(uuid) to authenticated;

create function public.alterar_proposta_bim(
  p_id uuid,p_semana_fim date,p_quantidade numeric
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.bim_pacote_semanas; p public.bim_pacotes; v_total numeric;
begin
  select * into v from public.bim_pacote_semanas where id=p_id for update;
  if not found or auth.uid() is null
     or not coalesce(private.papel_obra(v.obra_id) in ('administrador','engenheiro','supervisor'),false)
     or not exists (select 1 from public.obras where id=v.obra_id and ativo) then
    raise exception 'Acesso negado à proposta BIM'; end if;
  if v.compromisso_id is not null then raise exception 'Compromisso publicado não pode ser alterado aqui'; end if;
  select * into p from public.bim_pacotes where id=v.pacote_id for update;
  if p.estado<>'aprovado' or p.substituido_por is not null then
    raise exception 'Pacote não está vigente'; end if;
  if p_semana_fim is null or p_semana_fim<v.semana_inicio or p_semana_fim<p.inicio
     or v.semana_inicio>p.fim or p_quantidade is null or p_quantidade<=0
     or p_quantidade::text='NaN' then raise exception 'Semana ou quantidade inválida'; end if;
  select coalesce(sum(quantidade_meta),0) into v_total
    from public.bim_pacote_semanas where pacote_id=p.id and id<>p_id;
  if v_total+p_quantidade>p.quantidade_meta then
    raise exception 'Semanas excedem a meta do pacote'; end if;
  update public.bim_pacote_semanas set semana_fim=p_semana_fim,quantidade_meta=p_quantidade where id=p_id;
  return p_id;
end;
$$;
revoke all on function public.alterar_proposta_bim(uuid,date,numeric) from public;
grant execute on function public.alterar_proposta_bim(uuid,date,numeric) to authenticated;
