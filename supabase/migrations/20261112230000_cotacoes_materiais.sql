create table public.fornecedores_materiais (
  id bigint generated always as identity primary key,
  obra_id integer not null references public.obras(id),
  nome text not null check (length(trim(nome)) between 2 and 160),
  documento text,
  contato text,
  telefone text,
  email text,
  ativo boolean not null default true,
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (obra_id, id)
);
create index fornecedores_materiais_obra_nome_idx on public.fornecedores_materiais (obra_id, nome);

create table public.cotacoes_materiais (
  id bigint generated always as identity primary key,
  obra_id integer not null references public.obras(id),
  material_id bigint not null,
  solicitacao_id bigint references public.solicitacoes_materiais(id),
  quantidade numeric(14,4) not null check (quantidade > 0 and quantidade::text <> 'NaN'),
  necessario_em date not null,
  observacao text,
  estado text not null default 'aberta' check (estado in ('aberta','encerrada')),
  oferta_escolhida_id bigint,
  justificativa_escolha text,
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_em timestamptz,
  foreign key (obra_id, material_id) references public.materiais(obra_id, id),
  unique (obra_id, id),
  check ((estado = 'aberta' and oferta_escolhida_id is null and decidido_por is null and decidido_em is null)
    or (estado = 'encerrada' and oferta_escolhida_id is not null and decidido_por is not null and decidido_em is not null))
);
create index cotacoes_materiais_fila_idx on public.cotacoes_materiais (obra_id, estado, necessario_em, id);

create table public.ofertas_materiais (
  id bigint generated always as identity primary key,
  obra_id integer not null,
  cotacao_id bigint not null,
  fornecedor_id bigint not null,
  quantidade numeric(14,4) not null check (quantidade > 0),
  unidade_compra text not null,
  quantidade_por_embalagem numeric(14,4) not null check (quantidade_por_embalagem > 0),
  preco_embalagem numeric(14,2) not null check (preco_embalagem >= 0 and preco_embalagem::text <> 'NaN'),
  frete numeric(14,2) not null default 0 check (frete >= 0 and frete::text <> 'NaN'),
  impostos numeric(14,2) not null default 0 check (impostos >= 0 and impostos::text <> 'NaN'),
  desconto numeric(14,2) not null default 0 check (desconto >= 0 and desconto::text <> 'NaN'),
  entrega_em date not null,
  validade_ate date not null,
  observacao text,
  custo_entregue numeric(16,2) generated always as
    (ceil(quantidade / quantidade_por_embalagem) * preco_embalagem + frete + impostos - desconto) stored,
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (obra_id, cotacao_id) references public.cotacoes_materiais(obra_id, id),
  foreign key (obra_id, fornecedor_id) references public.fornecedores_materiais(obra_id, id),
  unique (cotacao_id, fornecedor_id),
  unique (cotacao_id, id),
  check (ceil(quantidade / quantidade_por_embalagem) * preco_embalagem + frete + impostos >= desconto)
);
create index ofertas_materiais_cotacao_custo_idx on public.ofertas_materiais (cotacao_id, custo_entregue, entrega_em);
alter table public.cotacoes_materiais add constraint cotacao_oferta_escolhida_fk
  foreign key (id, oferta_escolhida_id) references public.ofertas_materiais(cotacao_id, id);

create function private.validar_cotacao_material()
returns trigger language plpgsql set search_path = '' as $$
declare v_s public.solicitacoes_materiais;
begin
  if new.criado_por <> auth.uid() then raise exception 'Criador inválido'; end if;
  if new.solicitacao_id is not null then
    select * into v_s from public.solicitacoes_materiais where id = new.solicitacao_id;
    if not found or v_s.obra_id <> new.obra_id or v_s.material_id <> new.material_id
      or v_s.estado <> 'aprovada' then
      raise exception 'Solicitação aprovada incompatível com a cotação';
    end if;
  end if;
  return new;
end;
$$;
create trigger validar_cotacao_material before insert on public.cotacoes_materiais
for each row execute function private.validar_cotacao_material();

create function private.validar_oferta_material()
returns trigger language plpgsql set search_path = '' as $$
declare v_c public.cotacoes_materiais; v_m public.materiais;
begin
  select * into v_c from public.cotacoes_materiais where id = new.cotacao_id for update;
  if not found or v_c.obra_id <> new.obra_id or v_c.estado <> 'aberta' then
    raise exception 'Cotação inexistente ou encerrada';
  end if;
  if tg_op = 'INSERT' then
    if new.criado_por <> auth.uid() then raise exception 'Criador inválido'; end if;
    select * into v_m from public.materiais where id = v_c.material_id and obra_id = v_c.obra_id;
    if not found then raise exception 'Material inválido'; end if;
    new.quantidade := v_c.quantidade;
    new.unidade_compra := v_m.unidade_compra;
    new.quantidade_por_embalagem := v_m.quantidade_por_embalagem;
  else
    if (new.obra_id,new.cotacao_id,new.fornecedor_id,new.quantidade,new.unidade_compra,
        new.quantidade_por_embalagem,new.criado_por,new.criado_em)
       is distinct from
       (old.obra_id,old.cotacao_id,old.fornecedor_id,old.quantidade,old.unidade_compra,
        old.quantidade_por_embalagem,old.criado_por,old.criado_em) then
      raise exception 'Altere apenas os valores e condições da proposta';
    end if;
    new.atualizado_em := now();
  end if;
  if not exists (select 1 from public.fornecedores_materiais f
    where f.id = new.fornecedor_id and f.obra_id = new.obra_id and f.ativo) then
    raise exception 'Fornecedor inválido ou inativo';
  end if;
  return new;
end;
$$;
create trigger validar_oferta_material before insert or update on public.ofertas_materiais
for each row execute function private.validar_oferta_material();

alter table public.fornecedores_materiais enable row level security;
alter table public.cotacoes_materiais enable row level security;
alter table public.ofertas_materiais enable row level security;
create policy fornecedores_materiais_ler on public.fornecedores_materiais for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy fornecedores_materiais_criar on public.fornecedores_materiais for insert to authenticated
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario')
  and criado_por = auth.uid());
create policy cotacoes_materiais_ler on public.cotacoes_materiais for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy cotacoes_materiais_criar on public.cotacoes_materiais for insert to authenticated
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario')
  and criado_por = auth.uid() and estado = 'aberta' and oferta_escolhida_id is null);
create policy ofertas_materiais_ler on public.ofertas_materiais for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy ofertas_materiais_criar on public.ofertas_materiais for insert to authenticated
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario')
  and criado_por = auth.uid());
create policy ofertas_materiais_editar on public.ofertas_materiais for update to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario'))
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario'));
grant select, insert on public.fornecedores_materiais, public.cotacoes_materiais to authenticated;
grant select, insert, update on public.ofertas_materiais to authenticated;
grant usage, select on sequence public.fornecedores_materiais_id_seq,
  public.cotacoes_materiais_id_seq, public.ofertas_materiais_id_seq to authenticated;

create function public.escolher_oferta_material(p_cotacao_id bigint, p_oferta_id bigint, p_justificativa text default null)
returns public.cotacoes_materiais
language plpgsql security definer set search_path = '' as $$
declare v_c public.cotacoes_materiais; v_o public.ofertas_materiais; v_menor numeric;
begin
  if auth.uid() is null then raise exception 'Entre novamente para continuar'; end if;
  select * into v_c from public.cotacoes_materiais where id = p_cotacao_id for update;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if private.papel_obra(v_c.obra_id) not in ('administrador','engenheiro') then
    raise exception 'Somente engenheiro ou administrador pode escolher fornecedor';
  end if;
  if v_c.estado <> 'aberta' then raise exception 'Cotação já encerrada'; end if;
  select * into v_o from public.ofertas_materiais
    where id = p_oferta_id and cotacao_id = p_cotacao_id;
  if not found then raise exception 'Proposta incompatível com esta cotação'; end if;
  if v_o.validade_ate < current_date then raise exception 'Proposta vencida'; end if;
  select min(custo_entregue) into v_menor from public.ofertas_materiais
    where cotacao_id = p_cotacao_id and validade_ate >= current_date;
  if (v_o.custo_entregue > v_menor or v_o.entrega_em > v_c.necessario_em)
    and nullif(trim(coalesce(p_justificativa,'')),'') is null then
    raise exception 'Justifique a escolha acima do menor custo ou após a data necessária';
  end if;
  update public.cotacoes_materiais set estado = 'encerrada',
    oferta_escolhida_id = v_o.id,
    justificativa_escolha = nullif(trim(coalesce(p_justificativa,'')),''),
    decidido_por = auth.uid(), decidido_em = now()
  where id = p_cotacao_id returning * into v_c;
  return v_c;
end;
$$;
revoke all on function public.escolher_oferta_material(bigint,bigint,text) from public;
grant execute on function public.escolher_oferta_material(bigint,bigint,text) to authenticated;
