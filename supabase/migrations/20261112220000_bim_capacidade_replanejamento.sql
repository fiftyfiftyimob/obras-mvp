alter table public.bim_pacotes
  add column horas_equipe_previstas numeric(14,2) check (
    horas_equipe_previstas > 0 and horas_equipe_previstas::text <> 'NaN'
  ),
  add column produtividade_referencia numeric(14,4),
  add column substituido_por uuid references public.bim_pacotes(id);
create function private.validar_capacidade_pacote_bim()
returns trigger language plpgsql set search_path = '' as $$
declare v_prod numeric;
begin
  if old.estado='rascunho' and new.estado='aprovado' then
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
create trigger validar_capacidade_pacote_bim before update on public.bim_pacotes
  for each row execute function private.validar_capacidade_pacote_bim();

create function public.definir_capacidade_pacote_bim(p_id uuid,p_horas numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.bim_pacotes;
begin
  select * into v from public.bim_pacotes where id=p_id for update;
  if not found or auth.uid() is null
     or not coalesce(private.papel_obra(v.obra_id) in ('administrador','engenheiro','supervisor'),false)
     or not exists (select 1 from public.obras where id=v.obra_id and ativo) then
    raise exception 'Acesso negado ao pacote BIM'; end if;
  if v.estado<>'rascunho' then raise exception 'A capacidade só pode ser alterada no rascunho'; end if;
  if p_horas is null or p_horas<=0 or p_horas::text='NaN' then
    raise exception 'Informe horas de equipe maiores que zero'; end if;
  update public.bim_pacotes set horas_equipe_previstas=p_horas where id=p_id;
  return p_id;
end;
$$;
revoke all on function public.definir_capacidade_pacote_bim(uuid,numeric) from public;
grant execute on function public.definir_capacidade_pacote_bim(uuid,numeric) to authenticated;

create table public.bim_replanejamentos (
  id uuid primary key default gen_random_uuid(),
  obra_id integer not null references public.obras(id),
  pacote_id uuid not null references public.bim_pacotes(id),
  nova_importacao_id uuid not null references public.bim_importacoes(id),
  decisao text not null check (decisao in ('manter','substituir')),
  pacote_novo_id uuid references public.bim_pacotes(id),
  motivo text not null check (length(trim(motivo)) between 5 and 1000),
  registrado_por uuid not null,
  registrado_em timestamptz not null default now(),
  unique (pacote_id,nova_importacao_id),
  check ((decisao='manter' and pacote_novo_id is null)
    or (decisao='substituir' and pacote_novo_id is not null))
);
create index bim_replanejamentos_obra_idx on public.bim_replanejamentos (obra_id,registrado_em desc);
alter table public.bim_replanejamentos enable row level security;
create policy bim_replanejamentos_ler on public.bim_replanejamentos for select to authenticated
  using (private.possui_obra(obra_id));
grant select on public.bim_replanejamentos to authenticated;

create function public.registrar_replanejamento_bim(
  p_pacote_id uuid,p_nova_importacao_id uuid,p_decisao text,
  p_motivo text,p_pacote_novo_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_anterior public.bim_pacotes; v_novo public.bim_pacotes; v_id uuid;
begin
  select * into v_anterior from public.bim_pacotes where id=p_pacote_id for update;
  if not found or auth.uid() is null
     or not coalesce(private.papel_obra(v_anterior.obra_id) in ('administrador','engenheiro'),false)
     or not exists (select 1 from public.obras where id=v_anterior.obra_id and ativo) then
    raise exception 'Acesso negado ao replanejamento BIM'; end if;
  if v_anterior.estado<>'aprovado' or v_anterior.substituido_por is not null then
    raise exception 'O pacote anterior precisa estar aprovado e vigente'; end if;
  if p_decisao not in ('manter','substituir') or length(trim(coalesce(p_motivo,'')))<5 then
    raise exception 'Informe a decisão e o motivo'; end if;
  if p_nova_importacao_id=v_anterior.importacao_id
     or not exists (select 1 from public.bim_importacoes
       where id=p_nova_importacao_id and obra_id=v_anterior.obra_id and estado='concluida') then
    raise exception 'Escolha uma nova revisão concluída da mesma obra'; end if;
  if p_decisao='substituir' then
    select * into v_novo from public.bim_pacotes where id=p_pacote_novo_id for update;
    if not found or v_novo.obra_id<>v_anterior.obra_id
       or v_novo.importacao_id<>p_nova_importacao_id or v_novo.estado<>'aprovado'
       or v_novo.servico_id<>v_anterior.servico_id or v_novo.frente_id<>v_anterior.frente_id then
      raise exception 'O novo pacote precisa estar aprovado, na mesma frente e serviço'; end if;
    if exists (select 1 from public.bim_replanejamentos where pacote_novo_id=p_pacote_novo_id) then
      raise exception 'Novo pacote já usado em outro replanejamento'; end if;
  elsif p_pacote_novo_id is not null then
    raise exception 'A decisão de manter não aceita pacote substituto'; end if;
  insert into public.bim_replanejamentos
    (obra_id,pacote_id,nova_importacao_id,decisao,pacote_novo_id,motivo,registrado_por)
  values (v_anterior.obra_id,p_pacote_id,p_nova_importacao_id,p_decisao,p_pacote_novo_id,
    trim(p_motivo),auth.uid()) returning id into v_id;
  if p_decisao='substituir' then
    update public.bim_pacotes set substituido_por=p_pacote_novo_id where id=p_pacote_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.registrar_replanejamento_bim(uuid,uuid,text,text,uuid) from public;
grant execute on function public.registrar_replanejamento_bim(uuid,uuid,text,text,uuid) to authenticated;


create function private.bim_guard_semana_substituida()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.bim_pacotes
    where id=new.pacote_id and substituido_por is not null) then
    raise exception 'Este pacote foi substituído por outra revisão'; end if;
  return new;
end;
$$;
create trigger bim_guard_semana_substituida before insert on public.bim_pacote_semanas
  for each row execute function private.bim_guard_semana_substituida();
create or replace function public.publicar_proposta_bim(p_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v public.bim_pacote_semanas; p public.bim_pacotes; c integer;
begin
  select * into v from public.bim_pacote_semanas where id=p_id for update;
  if not found then raise exception 'Proposta semanal não encontrada'; end if;
  if auth.uid() is null or not coalesce(private.papel_obra(v.obra_id) in ('administrador','engenheiro'),false)
     or not exists (select 1 from public.obras where id=v.obra_id and ativo) then
    raise exception 'Acesso negado à publicação BIM'; end if;
  if v.compromisso_id is not null then return v.compromisso_id; end if;
  select * into p from public.bim_pacotes where id=v.pacote_id;
  if p.estado<>'aprovado' or p.substituido_por is not null then
    raise exception 'O pacote BIM precisa estar aprovado e vigente'; end if;
  if not exists (select 1 from public.frentes where id=p.frente_id and obra_id=p.obra_id and ativo)
     or not exists (select 1 from public.equipes where id=p.equipe_id and obra_id=p.obra_id and ativo)
     or not exists (select 1 from public.servicos where id=p.servico_id and ativo and unidade=p.unidade
       and (dono_id is null or dono_id=auth.uid())) then
    raise exception 'Frente, equipe ou serviço do pacote não está mais disponível'; end if;
  insert into public.compromissos_semanais
    (obra_id,semana_inicio,semana_fim,servico_id,frente_id,equipe_id,quantidade_meta,unidade,observacao,autor_id)
  values (v.obra_id,v.semana_inicio,v.semana_fim,p.servico_id,p.frente_id,p.equipe_id,
    v.quantidade_meta,p.unidade,'Origem BIM · pacote '||p.codigo||' · revisão '||p.importacao_id::text,auth.uid())
  returning id into c;
  update public.bim_pacote_semanas set compromisso_id=c,publicado_por=auth.uid(),publicado_em=now()
    where id=p_id;
  return c;
end;
$$;
revoke all on function public.publicar_proposta_bim(uuid) from public;
grant execute on function public.publicar_proposta_bim(uuid) to authenticated;
