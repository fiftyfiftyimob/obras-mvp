create table public.pedidos_compra (
  id bigint generated always as identity primary key,
  obra_id integer not null references public.obras(id),
  cotacao_id bigint not null unique references public.cotacoes_materiais(id),
  oferta_id bigint not null references public.ofertas_materiais(id),
  fornecedor_id bigint not null,
  material_id bigint not null,
  almoxarifado_id bigint not null,
  quantidade numeric(14,4) not null check (quantidade > 0),
  quantidade_recebida numeric(14,4) not null default 0 check (quantidade_recebida >= 0 and quantidade_recebida <= quantidade),
  custo_contratado numeric(16,2) not null check (custo_contratado >= 0),
  entrega_prevista date not null,
  estado text not null default 'aberto' check (estado in ('aberto','parcial','concluido','cancelado')),
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  cancelado_por uuid,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  foreign key (obra_id, fornecedor_id) references public.fornecedores_materiais(obra_id,id),
  foreign key (obra_id, material_id) references public.materiais(obra_id,id),
  foreign key (obra_id, almoxarifado_id) references public.almoxarifados(obra_id,id),
  unique (obra_id,id),
  check ((estado='aberto' and quantidade_recebida=0)
    or (estado='parcial' and quantidade_recebida>0 and quantidade_recebida<quantidade)
    or (estado='concluido' and quantidade_recebida=quantidade)
    or (estado='cancelado' and quantidade_recebida=0 and cancelado_por is not null and cancelado_em is not null))
);
create index pedidos_compra_obra_estado_idx on public.pedidos_compra (obra_id,estado,entrega_prevista);

create table public.recebimentos_compra (
  id uuid primary key,
  obra_id integer not null,
  pedido_id bigint not null,
  operacao_id uuid not null unique references public.estoque_operacoes(id),
  quantidade numeric(14,4) not null check (quantidade>0),
  documento text,
  observacao text,
  recebido_por uuid not null,
  recebido_em timestamptz not null default now(),
  estorno_id uuid unique references public.estoque_operacoes(id),
  estornado_por uuid,
  estornado_em timestamptz,
  motivo_estorno text,
  foreign key (obra_id,pedido_id) references public.pedidos_compra(obra_id,id),
  check ((estorno_id is null and estornado_por is null and estornado_em is null)
    or (estorno_id is not null and estornado_por is not null and estornado_em is not null))
);
create index recebimentos_compra_pedido_idx on public.recebimentos_compra (pedido_id,recebido_em);

alter table public.pedidos_compra enable row level security;
alter table public.recebimentos_compra enable row level security;
create policy pedidos_compra_ler on public.pedidos_compra for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy recebimentos_compra_ler on public.recebimentos_compra for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
grant select on public.pedidos_compra, public.recebimentos_compra to authenticated;

create function public.criar_pedido_compra(p_cotacao_id bigint,p_almoxarifado_id bigint)
returns public.pedidos_compra
language plpgsql security definer set search_path = '' as $$
declare v_c public.cotacoes_materiais; v_o public.ofertas_materiais; v_p public.pedidos_compra;
begin
  if auth.uid() is null then raise exception 'Entre novamente para continuar'; end if;
  select * into v_c from public.cotacoes_materiais where id=p_cotacao_id for update;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if private.papel_obra(v_c.obra_id) not in ('administrador','engenheiro')
    or not exists (select 1 from public.obras where id=v_c.obra_id and ativo) then
    raise exception 'Acesso negado ao pedido';
  end if;
  select * into v_p from public.pedidos_compra where cotacao_id=p_cotacao_id;
  if found then return v_p; end if;
  if v_c.estado <> 'encerrada' or v_c.oferta_escolhida_id is null then
    raise exception 'Escolha uma proposta antes de criar o pedido';
  end if;
  select * into v_o from public.ofertas_materiais
    where id=v_c.oferta_escolhida_id and cotacao_id=v_c.id;
  if not found or v_o.validade_ate<current_date then
    raise exception 'Proposta escolhida inexistente ou vencida';
  end if;
  if not exists (select 1 from public.almoxarifados
    where id=p_almoxarifado_id and obra_id=v_c.obra_id and ativo) then
    raise exception 'Almoxarifado inválido para esta obra';
  end if;
  insert into public.pedidos_compra
    (obra_id,cotacao_id,oferta_id,fornecedor_id,material_id,almoxarifado_id,
     quantidade,custo_contratado,entrega_prevista,criado_por)
  values (v_c.obra_id,v_c.id,v_o.id,v_o.fornecedor_id,v_c.material_id,p_almoxarifado_id,
    v_c.quantidade,v_o.custo_entregue,v_o.entrega_em,auth.uid())
  returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.criar_pedido_compra(bigint,bigint) from public;
grant execute on function public.criar_pedido_compra(bigint,bigint) to authenticated;

create function public.registrar_recebimento_compra(
  p_id uuid,p_pedido_id bigint,p_quantidade numeric,p_documento text default null,p_observacao text default null)
returns public.recebimentos_compra
language plpgsql security definer set search_path = '' as $$
declare v_p public.pedidos_compra; v_r public.recebimentos_compra; v_obs text;
begin
  if auth.uid() is null then raise exception 'Entre novamente para continuar'; end if;
  if p_id is null or p_quantidade is null or p_quantidade<=0 or p_quantidade::text='NaN'
    or length(coalesce(p_documento,''))>100 or length(coalesce(p_observacao,''))>1000 then
    raise exception 'Dados de recebimento inválidos';
  end if;
  select * into v_p from public.pedidos_compra where id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if private.papel_obra(v_p.obra_id) not in ('administrador','engenheiro','supervisor')
    or not exists (select 1 from public.obras where id=v_p.obra_id and ativo) then
    raise exception 'Acesso negado ao recebimento';
  end if;
  select * into v_r from public.recebimentos_compra where id=p_id;
  if found then
    if v_r.pedido_id<>p_pedido_id or v_r.quantidade<>p_quantidade
      or v_r.documento is distinct from nullif(trim(coalesce(p_documento,'')),'')
      or v_r.observacao is distinct from nullif(trim(coalesce(p_observacao,'')),'') then
      raise exception 'Identificador já usado em outro recebimento';
    end if;
    return v_r;
  end if;
  if v_p.estado not in ('aberto','parcial') or v_p.quantidade_recebida+p_quantidade>v_p.quantidade then
    raise exception 'Quantidade excede o saldo pendente do pedido';
  end if;
  v_obs := 'Recebimento do pedido #' || v_p.id::text
    || case when nullif(trim(coalesce(p_documento,'')),'') is null then ''
      else ' · documento ' || trim(p_documento) end;
  perform public.registrar_operacao_estoque(p_id,v_p.obra_id,'entrada',v_p.material_id,
    v_p.almoxarifado_id,p_quantidade,null,null,v_obs,null);
  insert into public.recebimentos_compra
    (id,obra_id,pedido_id,operacao_id,quantidade,documento,observacao,recebido_por)
  values (p_id,v_p.obra_id,v_p.id,p_id,p_quantidade,
    nullif(trim(coalesce(p_documento,'')),''),
    nullif(trim(coalesce(p_observacao,'')),''),auth.uid()) returning * into v_r;
  update public.pedidos_compra set quantidade_recebida=quantidade_recebida+p_quantidade,
    estado=case when quantidade_recebida+p_quantidade=quantidade then 'concluido' else 'parcial' end
  where id=v_p.id;
  return v_r;
end;
$$;
revoke all on function public.registrar_recebimento_compra(uuid,bigint,numeric,text,text) from public;
grant execute on function public.registrar_recebimento_compra(uuid,bigint,numeric,text,text) to authenticated;

create function private.bloquear_estorno_recebimento_compra()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.recebimentos_compra
    where operacao_id=new.estorno_de and estornado_em is null) then
    raise exception 'Estorne o recebimento pelo pedido de compra';
  end if;
  return new;
end;
$$;
create trigger bloquear_estorno_recebimento_compra before insert on public.estoque_operacoes
for each row when (new.tipo='estorno') execute function private.bloquear_estorno_recebimento_compra();

create function public.estornar_recebimento_compra(
  p_recebimento_id uuid,p_estorno_id uuid,p_motivo text)
returns public.recebimentos_compra
language plpgsql security definer set search_path = '' as $$
declare v_p public.pedidos_compra; v_r public.recebimentos_compra;
begin
  if auth.uid() is null then raise exception 'Entre novamente para continuar'; end if;
  if p_estorno_id is null or nullif(trim(coalesce(p_motivo,'')),'') is null then
    raise exception 'Informe o motivo do estorno';
  end if;
  select * into v_r from public.recebimentos_compra where id=p_recebimento_id;
  if not found then raise exception 'Recebimento não encontrado'; end if;
  select * into v_p from public.pedidos_compra where id=v_r.pedido_id for update;
  if private.papel_obra(v_p.obra_id) not in ('administrador','engenheiro','supervisor')
    or not exists (select 1 from public.obras where id=v_p.obra_id and ativo) then
    raise exception 'Acesso negado ao estorno do recebimento';
  end if;
  select * into v_r from public.recebimentos_compra where id=p_recebimento_id for update;
  if v_r.estorno_id is not null then
    if v_r.estorno_id<>p_estorno_id or v_r.motivo_estorno<>trim(p_motivo) then
      raise exception 'Recebimento já estornado';
    end if;
    return v_r;
  end if;
  update public.recebimentos_compra set
    estorno_id=p_estorno_id,estornado_por=auth.uid(),estornado_em=now(),
    motivo_estorno=trim(p_motivo)
  where id=v_r.id;
  perform public.registrar_operacao_estoque(p_estorno_id,v_p.obra_id,'estorno',v_p.material_id,
    v_p.almoxarifado_id,v_r.quantidade,null,null,
    'Estorno de recebimento #' || v_r.id::text,v_r.operacao_id);
  update public.pedidos_compra set quantidade_recebida=quantidade_recebida-v_r.quantidade,
    estado=case when quantidade_recebida-v_r.quantidade=0 then 'aberto' else 'parcial' end
  where id=v_p.id;
  select * into v_r from public.recebimentos_compra where id=p_recebimento_id;
  return v_r;
end;
$$;
revoke all on function public.estornar_recebimento_compra(uuid,uuid,text) from public;
grant execute on function public.estornar_recebimento_compra(uuid,uuid,text) to authenticated;
