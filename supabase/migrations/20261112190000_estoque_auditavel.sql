alter table public.solicitacoes_materiais
  add column quantidade_reservada numeric(14,4) not null default 0,
  add column quantidade_entregue numeric(14,4) not null default 0,
  add constraint solicitacao_quantidades_validas check (
    quantidade_reservada >= 0 and quantidade_entregue >= 0
    and quantidade_reservada + quantidade_entregue <= quantidade
  );

create table public.estoque_saldos (
  obra_id integer not null references public.obras(id),
  almoxarifado_id bigint not null,
  material_id bigint not null,
  fisico numeric(14,4) not null default 0 check (fisico >= 0),
  reservado numeric(14,4) not null default 0 check (reservado >= 0 and reservado <= fisico),
  atualizado_em timestamptz not null default now(),
  primary key (obra_id, almoxarifado_id, material_id),
  foreign key (obra_id, almoxarifado_id) references public.almoxarifados(obra_id,id),
  foreign key (obra_id, material_id) references public.materiais(obra_id,id)
);

create table public.estoque_operacoes (
  id uuid primary key,
  obra_id integer not null references public.obras(id),
  material_id bigint not null,
  almoxarifado_id bigint not null,
  destino_id bigint,
  solicitacao_id bigint references public.solicitacoes_materiais(id),
  tipo text not null check (tipo in ('inventario_inicial','entrada','reserva','baixa','devolucao','liberacao','transferencia','contagem','estorno')),
  quantidade numeric(14,4) not null check (quantidade >= 0),
  assinatura jsonb not null,
  observacao text,
  estorno_de uuid unique references public.estoque_operacoes(id),
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  foreign key (obra_id, almoxarifado_id) references public.almoxarifados(obra_id,id),
  foreign key (obra_id, destino_id) references public.almoxarifados(obra_id,id),
  foreign key (obra_id, material_id) references public.materiais(obra_id,id)
);
create index estoque_operacoes_obra_idx on public.estoque_operacoes (obra_id, criado_em desc);

create table public.estoque_movimentos (
  id bigint generated always as identity primary key,
  operacao_id uuid not null references public.estoque_operacoes(id),
  obra_id integer not null,
  almoxarifado_id bigint not null,
  material_id bigint not null,
  solicitacao_id bigint references public.solicitacoes_materiais(id),
  delta_fisico numeric(14,4) not null default 0,
  delta_reservado numeric(14,4) not null default 0,
  delta_solicitacao_reservada numeric(14,4) not null default 0,
  delta_solicitacao_entregue numeric(14,4) not null default 0,
  criado_em timestamptz not null default now(),
  foreign key (obra_id, almoxarifado_id, material_id)
    references public.estoque_saldos(obra_id, almoxarifado_id, material_id)
);
create index estoque_movimentos_extrato_idx on public.estoque_movimentos
  (obra_id, almoxarifado_id, material_id, id desc);

alter table public.estoque_saldos enable row level security;
alter table public.estoque_operacoes enable row level security;
alter table public.estoque_movimentos enable row level security;
create policy estoque_saldos_ler on public.estoque_saldos for select to authenticated
  using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy estoque_operacoes_ler on public.estoque_operacoes for select to authenticated
  using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy estoque_movimentos_ler on public.estoque_movimentos for select to authenticated
  using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
grant select on public.estoque_saldos, public.estoque_operacoes, public.estoque_movimentos to authenticated;

create function public.registrar_operacao_estoque(
  p_id uuid, p_obra_id integer, p_tipo text, p_material_id bigint,
  p_almoxarifado_id bigint, p_quantidade numeric,
  p_solicitacao_id bigint default null, p_destino_id bigint default null,
  p_observacao text default null, p_estorno_de uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_papel text;
  v_assinatura jsonb;
  v_criada boolean;
  v_existente public.estoque_operacoes;
  v_solicitacao public.solicitacoes_materiais;
  v_origem public.estoque_operacoes;
  v_linha record;
  v_fisico numeric;
  v_reservado numeric;
  v_delta numeric;
  v_destino bigint;
  v_armazem bigint;
begin
  if auth.uid() is null then raise exception 'Entre novamente para continuar'; end if;
  if p_id is null or p_obra_id is null or p_material_id is null or p_almoxarifado_id is null
     or p_quantidade is null or p_quantidade < 0 then raise exception 'Parâmetros de estoque inválidos'; end if;
  if p_tipo not in ('inventario_inicial','entrada','reserva','baixa','devolucao','liberacao','transferencia','contagem','estorno')
     then raise exception 'Tipo de operação inválido'; end if;
  if p_tipo <> 'contagem' and p_tipo <> 'estorno' and p_quantidade <= 0 then
    raise exception 'Informe uma quantidade maior que zero'; end if;
  v_papel := private.papel_obra(p_obra_id);
  if v_papel not in ('administrador','engenheiro','supervisor','encarregado')
     or not exists (select 1 from public.obras where id = p_obra_id and ativo) then
    raise exception 'Acesso negado à operação de estoque';
  end if;
  if p_tipo in ('inventario_inicial','entrada','transferencia','contagem','estorno')
     and v_papel not in ('administrador','engenheiro','supervisor') then
    raise exception 'Esta operação requer engenheiro, supervisor ou administrador';
  end if;
  if not exists (select 1 from public.materiais where id=p_material_id and obra_id=p_obra_id)
     or not exists (select 1 from public.almoxarifados where id=p_almoxarifado_id and obra_id=p_obra_id)
     then raise exception 'Material ou almoxarifado não pertence à obra'; end if;
  if p_tipo = 'transferencia' and (p_destino_id is null or p_destino_id = p_almoxarifado_id
     or not exists (select 1 from public.almoxarifados where id=p_destino_id and obra_id=p_obra_id)) then
    raise exception 'Escolha outro almoxarifado da mesma obra para transferir'; end if;
  if p_tipo <> 'transferencia' and p_destino_id is not null then raise exception 'Destino inesperado'; end if;
  if p_tipo in ('reserva','baixa','devolucao','liberacao') and p_solicitacao_id is null then
    raise exception 'Selecione uma solicitação aprovada'; end if;
  if p_tipo not in ('reserva','baixa','devolucao','liberacao','estorno') and p_solicitacao_id is not null then
    raise exception 'Solicitação inesperada'; end if;
  if p_tipo = 'estorno' and p_estorno_de is null then raise exception 'Selecione a operação para estornar'; end if;
  if p_tipo <> 'estorno' and p_estorno_de is not null then raise exception 'Estorno inesperado'; end if;
  v_assinatura := jsonb_build_object(
    'obra',p_obra_id,'tipo',p_tipo,'material',p_material_id,'almoxarifado',p_almoxarifado_id,
    'quantidade',p_quantidade,'solicitacao',p_solicitacao_id,'destino',p_destino_id,
    'observacao',p_observacao,'estorno',p_estorno_de
  );
  insert into public.estoque_operacoes
    (id,obra_id,material_id,almoxarifado_id,destino_id,solicitacao_id,tipo,quantidade,assinatura,observacao,estorno_de,criado_por)
  values (p_id,p_obra_id,p_material_id,p_almoxarifado_id,p_destino_id,p_solicitacao_id,p_tipo,p_quantidade,v_assinatura,p_observacao,p_estorno_de,auth.uid())
  on conflict (id) do nothing;
  v_criada := found;
  if not v_criada then
    select * into v_existente from public.estoque_operacoes where id=p_id for update;
    if v_existente.assinatura is distinct from v_assinatura then
      raise exception 'Identificador já usado em outra operação';
    end if;
    return p_id;
  end if;

  if p_tipo = 'estorno' then
    select * into v_origem from public.estoque_operacoes where id=p_estorno_de for update;
    if not found or v_origem.obra_id <> p_obra_id or v_origem.material_id <> p_material_id
       or v_origem.almoxarifado_id <> p_almoxarifado_id
       or v_origem.solicitacao_id is distinct from p_solicitacao_id
       or v_origem.quantidade <> p_quantidade or v_origem.tipo = 'estorno'
       or exists (select 1 from public.estoque_operacoes where estorno_de=p_estorno_de and id<>p_id) then
      raise exception 'Operação de origem não pode ser estornada'; end if;
  end if;

  if p_solicitacao_id is not null then
    select * into v_solicitacao from public.solicitacoes_materiais where id=p_solicitacao_id for update;
    if not found or v_solicitacao.estado <> 'aprovada'
       or v_solicitacao.obra_id <> p_obra_id
       or v_solicitacao.material_id <> p_material_id
       or v_solicitacao.almoxarifado_id <> p_almoxarifado_id then
      raise exception 'Solicitação incompatível ou não aprovada'; end if;
  elsif p_tipo = 'estorno' and v_origem.solicitacao_id is not null then
    select * into v_solicitacao from public.solicitacoes_materiais where id=v_origem.solicitacao_id for update;
  end if;

  v_destino := case when p_tipo='transferencia' then p_destino_id
    when p_tipo='estorno' then v_origem.destino_id else null end;
  for v_armazem in select x from unnest(array[p_almoxarifado_id,v_destino]) as x where x is not null order by x loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      p_obra_id::text || ':' || p_material_id::text || ':' || v_armazem::text, 0));
    insert into public.estoque_saldos (obra_id,almoxarifado_id,material_id)
      values (p_obra_id,v_armazem,p_material_id) on conflict do nothing;
  end loop;

  if p_tipo = 'estorno' then
    for v_linha in select * from public.estoque_movimentos where operacao_id=p_estorno_de order by id loop
      update public.estoque_saldos set
        fisico=fisico-v_linha.delta_fisico,
        reservado=reservado-v_linha.delta_reservado,
        atualizado_em=now()
      where obra_id=p_obra_id and almoxarifado_id=v_linha.almoxarifado_id and material_id=p_material_id;
      if v_linha.solicitacao_id is not null then
        update public.solicitacoes_materiais set
          quantidade_reservada=quantidade_reservada-v_linha.delta_solicitacao_reservada,
          quantidade_entregue=quantidade_entregue-v_linha.delta_solicitacao_entregue
        where id=v_linha.solicitacao_id;
      end if;
      insert into public.estoque_movimentos
        (operacao_id,obra_id,almoxarifado_id,material_id,solicitacao_id,
         delta_fisico,delta_reservado,delta_solicitacao_reservada,delta_solicitacao_entregue)
      values (p_id,p_obra_id,v_linha.almoxarifado_id,p_material_id,v_linha.solicitacao_id,
        -v_linha.delta_fisico,-v_linha.delta_reservado,
        -v_linha.delta_solicitacao_reservada,-v_linha.delta_solicitacao_entregue);
    end loop;
    return p_id;
  end if;

  select fisico,reservado into v_fisico,v_reservado from public.estoque_saldos
    where obra_id=p_obra_id and almoxarifado_id=p_almoxarifado_id and material_id=p_material_id for update;
  if p_tipo = 'inventario_inicial' and exists (
    select 1 from public.estoque_movimentos where obra_id=p_obra_id
      and almoxarifado_id=p_almoxarifado_id and material_id=p_material_id
  ) then raise exception 'Saldo inicial já informado; use entrada ou contagem'; end if;
  if p_tipo in ('reserva','transferencia') and v_fisico-v_reservado < p_quantidade then
    raise exception 'Saldo disponível insuficiente'; end if;
  if p_tipo='reserva' and v_solicitacao.quantidade-v_solicitacao.quantidade_reservada-v_solicitacao.quantidade_entregue < p_quantidade then
    raise exception 'Quantidade excede o saldo da solicitação'; end if;
  if p_tipo in ('baixa','liberacao') and v_solicitacao.quantidade_reservada < p_quantidade then
    raise exception 'Reserva insuficiente para esta operação'; end if;
  if p_tipo='devolucao' and v_solicitacao.quantidade_entregue < p_quantidade then
    raise exception 'Devolução excede a entrega registrada'; end if;
  if p_tipo='contagem' and p_quantidade < v_reservado then
    raise exception 'A contagem não pode ficar abaixo do saldo reservado'; end if;
  v_delta := case p_tipo
    when 'inventario_inicial' then p_quantidade when 'entrada' then p_quantidade
    when 'baixa' then -p_quantidade when 'devolucao' then p_quantidade
    when 'transferencia' then -p_quantidade when 'contagem' then p_quantidade-v_fisico else 0 end;
  update public.estoque_saldos set
    fisico=fisico+v_delta,
    reservado=reservado+case p_tipo when 'reserva' then p_quantidade
      when 'baixa' then -p_quantidade when 'liberacao' then -p_quantidade else 0 end,
    atualizado_em=now()
  where obra_id=p_obra_id and almoxarifado_id=p_almoxarifado_id and material_id=p_material_id;
  if p_tipo='transferencia' then
    update public.estoque_saldos set fisico=fisico+p_quantidade,atualizado_em=now()
      where obra_id=p_obra_id and almoxarifado_id=p_destino_id and material_id=p_material_id;
    insert into public.estoque_movimentos
      (operacao_id,obra_id,almoxarifado_id,material_id,delta_fisico)
      values (p_id,p_obra_id,p_destino_id,p_material_id,p_quantidade);
  end if;
  if p_tipo in ('reserva','baixa','devolucao','liberacao') then
    update public.solicitacoes_materiais set
      quantidade_reservada=quantidade_reservada+case p_tipo when 'reserva' then p_quantidade
        when 'baixa' then -p_quantidade when 'liberacao' then -p_quantidade else 0 end,
      quantidade_entregue=quantidade_entregue+case p_tipo when 'baixa' then p_quantidade
        when 'devolucao' then -p_quantidade else 0 end
    where id=p_solicitacao_id;
  end if;
  insert into public.estoque_movimentos
    (operacao_id,obra_id,almoxarifado_id,material_id,solicitacao_id,
     delta_fisico,delta_reservado,delta_solicitacao_reservada,delta_solicitacao_entregue)
  values (p_id,p_obra_id,p_almoxarifado_id,p_material_id,p_solicitacao_id,
    v_delta,
    case p_tipo when 'reserva' then p_quantidade when 'baixa' then -p_quantidade
      when 'liberacao' then -p_quantidade else 0 end,
    case p_tipo when 'reserva' then p_quantidade when 'baixa' then -p_quantidade
      when 'liberacao' then -p_quantidade else 0 end,
    case p_tipo when 'baixa' then p_quantidade when 'devolucao' then -p_quantidade else 0 end);
  return p_id;
end;
$$;
revoke all on function public.registrar_operacao_estoque(uuid,integer,text,bigint,bigint,numeric,bigint,bigint,text,uuid) from public;
grant execute on function public.registrar_operacao_estoque(uuid,integer,text,bigint,bigint,numeric,bigint,bigint,text,uuid) to authenticated;
