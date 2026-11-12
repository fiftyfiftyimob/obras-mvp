create table public.bim_pacotes (
  id uuid primary key,
  obra_id integer not null references public.obras(id),
  importacao_id uuid not null references public.bim_importacoes(id),
  codigo text not null check (length(trim(codigo)) between 1 and 40),
  titulo text not null check (length(trim(titulo)) between 2 and 160),
  frente_id integer not null references public.frentes(id),
  servico_id integer not null references public.servicos(id),
  equipe_id integer not null references public.equipes(id),
  inicio date not null,
  fim date not null,
  quantidade_meta numeric(14,4) not null check (quantidade_meta > 0 and quantidade_meta::text <> 'NaN'),
  unidade text not null,
  estado text not null default 'rascunho' check (estado in ('rascunho','aprovado')),
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  aprovado_por uuid,
  aprovado_em timestamptz,
  check (fim >= inicio),
  check ((estado='rascunho' and aprovado_por is null and aprovado_em is null)
    or (estado='aprovado' and aprovado_por is not null and aprovado_em is not null)),
  unique (obra_id, importacao_id, codigo)
);
create index bim_pacotes_obra_periodo_idx on public.bim_pacotes (obra_id, inicio, fim);

create table public.bim_pacote_fontes (
  pacote_id uuid not null references public.bim_pacotes(id),
  quantidade_id bigint not null references public.bim_quantidades(id),
  valor numeric(14,4) not null check (valor > 0 and valor::text <> 'NaN'),
  primary key (pacote_id, quantidade_id)
);
create index bim_pacote_fontes_quantidade_idx on public.bim_pacote_fontes (quantidade_id);

create table public.bim_pacote_predecessores (
  pacote_id uuid not null references public.bim_pacotes(id),
  predecessor_id uuid not null references public.bim_pacotes(id),
  primary key (pacote_id, predecessor_id),
  check (pacote_id <> predecessor_id)
);

create table public.bim_pacote_semanas (
  id uuid primary key,
  pacote_id uuid not null references public.bim_pacotes(id),
  obra_id integer not null references public.obras(id),
  semana_inicio date not null,
  semana_fim date not null,
  quantidade_meta numeric(14,4) not null check (quantidade_meta > 0 and quantidade_meta::text <> 'NaN'),
  compromisso_id integer unique references public.compromissos_semanais(id),
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  publicado_por uuid,
  publicado_em timestamptz,
  check (semana_fim >= semana_inicio),
  check ((compromisso_id is null and publicado_por is null and publicado_em is null)
    or (compromisso_id is not null and publicado_por is not null and publicado_em is not null)),
  unique (pacote_id, semana_inicio)
);
create index bim_pacote_semanas_obra_idx on public.bim_pacote_semanas (obra_id, semana_inicio);

alter table public.bim_pacotes enable row level security;
alter table public.bim_pacote_fontes enable row level security;
alter table public.bim_pacote_predecessores enable row level security;
alter table public.bim_pacote_semanas enable row level security;
create policy bim_pacotes_ler on public.bim_pacotes for select to authenticated
  using (private.possui_obra(obra_id));
create policy bim_pacote_fontes_ler on public.bim_pacote_fontes for select to authenticated
  using (exists (select 1 from public.bim_pacotes p where p.id=pacote_id and private.possui_obra(p.obra_id)));
create policy bim_pacote_predecessores_ler on public.bim_pacote_predecessores for select to authenticated
  using (exists (select 1 from public.bim_pacotes p where p.id=pacote_id and private.possui_obra(p.obra_id)));
create policy bim_pacote_semanas_ler on public.bim_pacote_semanas for select to authenticated
  using (private.possui_obra(obra_id));
grant select on public.bim_pacotes, public.bim_pacote_fontes,
  public.bim_pacote_predecessores, public.bim_pacote_semanas to authenticated;

create function public.criar_pacote_bim(
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
    select coalesce(sum(valor),0) into v_usado from public.bim_pacote_fontes where quantidade_id=v_fonte.quantidade_id;
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

create function public.aprovar_pacote_bim(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.bim_pacotes;
begin
  select * into v from public.bim_pacotes where id=p_id for update;
  if not found or auth.uid() is null
     or not coalesce(private.papel_obra(v.obra_id) in ('administrador','engenheiro'),false)
     or not exists (select 1 from public.obras where id=v.obra_id and ativo) then
    raise exception 'Acesso negado ao pacote BIM'; end if;
  if v.estado='aprovado' then return p_id; end if;
  if exists (select 1 from public.bim_pacote_predecessores d
    join public.bim_pacotes p on p.id=d.predecessor_id
    where d.pacote_id=p_id and p.estado<>'aprovado') then
    raise exception 'Aprove primeiro os pacotes predecessores'; end if;
  update public.bim_pacotes set estado='aprovado',aprovado_por=auth.uid(),aprovado_em=now()
    where id=p_id;
  return p_id;
end;
$$;
revoke all on function public.aprovar_pacote_bim(uuid) from public;
grant execute on function public.aprovar_pacote_bim(uuid) to authenticated;

create function public.criar_proposta_bim(
  p_id uuid,p_pacote_id uuid,p_semana_inicio date,p_semana_fim date,p_quantidade numeric
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.bim_pacotes; v_usado numeric;
begin
  select * into v from public.bim_pacotes where id=p_pacote_id for update;
  if not found or auth.uid() is null
     or not coalesce(private.papel_obra(v.obra_id) in ('administrador','engenheiro','supervisor'),false)
     or not exists (select 1 from public.obras where id=v.obra_id and ativo) then
    raise exception 'Acesso negado à proposta BIM'; end if;
  if v.estado<>'aprovado' then raise exception 'Aprove o pacote antes de planejar a semana'; end if;
  if p_id is null or p_semana_inicio is null or p_semana_fim is null
     or p_semana_fim<p_semana_inicio or p_semana_fim<v.inicio or p_semana_inicio>v.fim
     or p_quantidade is null or p_quantidade<=0 or p_quantidade::text='NaN' then
    raise exception 'Semana ou quantidade inválida'; end if;
  select coalesce(sum(quantidade_meta),0) into v_usado from public.bim_pacote_semanas where pacote_id=p_pacote_id;
  if v_usado+p_quantidade>v.quantidade_meta then raise exception 'Semanas excedem a meta do pacote'; end if;
  insert into public.bim_pacote_semanas
    (id,pacote_id,obra_id,semana_inicio,semana_fim,quantidade_meta,criado_por)
  values (p_id,p_pacote_id,v.obra_id,p_semana_inicio,p_semana_fim,p_quantidade,auth.uid());
  return p_id;
end;
$$;
revoke all on function public.criar_proposta_bim(uuid,uuid,date,date,numeric) from public;
grant execute on function public.criar_proposta_bim(uuid,uuid,date,date,numeric) to authenticated;

create function public.publicar_proposta_bim(p_id uuid)
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
  if p.estado<>'aprovado' then raise exception 'O pacote BIM precisa estar aprovado'; end if;
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
