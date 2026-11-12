create table public.materiais (
  id bigint generated always as identity primary key,
  obra_id integer not null references public.obras(id),
  nome text not null check (length(trim(nome)) between 2 and 120),
  especificacao text not null default '',
  unidade_estoque text not null check (unidade_estoque in ('un','m','m²','m³','kg','l')),
  unidade_compra text not null check (length(trim(unidade_compra)) between 1 and 30),
  quantidade_por_embalagem numeric(14,4) not null default 1 check (quantidade_por_embalagem > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (obra_id, id)
);
create index materiais_obra_nome_idx on public.materiais (obra_id, nome);
create table public.almoxarifados (
  id bigint generated always as identity primary key,
  obra_id integer not null references public.obras(id),
  nome text not null check (length(trim(nome)) between 2 and 100),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (obra_id, id),
  unique (obra_id, nome)
);
create table public.solicitacoes_materiais (
  id bigint generated always as identity primary key,
  obra_id integer not null references public.obras(id),
  material_id bigint not null,
  almoxarifado_id bigint not null,
  frente_id integer not null references public.frentes(id),
  tarefa_id integer references public.tarefas(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  necessario_em date not null,
  observacao text,
  estado text not null default 'pendente' check (estado in ('pendente','aprovada','recusada','cancelada')),
  solicitado_por uuid not null default auth.uid(),
  solicitado_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_em timestamptz,
  justificativa_decisao text,
  foreign key (obra_id, material_id) references public.materiais(obra_id, id),
  foreign key (obra_id, almoxarifado_id) references public.almoxarifados(obra_id, id),
  constraint solicitacao_decisao_coerente check (
    (estado = 'pendente' and decidido_por is null and decidido_em is null)
    or (estado <> 'pendente' and decidido_por is not null and decidido_em is not null)
  )
);
create index solicitacoes_materiais_fila_idx on public.solicitacoes_materiais (obra_id, estado, necessario_em, id);
create index solicitacoes_materiais_material_idx on public.solicitacoes_materiais (obra_id, material_id);
create function private.validar_solicitacao_material()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.frentes f where f.id = new.frente_id and f.obra_id = new.obra_id and f.ativo)
     or not exists (select 1 from public.materiais m where m.id = new.material_id and m.obra_id = new.obra_id and m.ativo)
     or not exists (select 1 from public.almoxarifados a where a.id = new.almoxarifado_id and a.obra_id = new.obra_id and a.ativo)
     or (new.tarefa_id is not null and not exists (
       select 1 from public.tarefas t where t.id = new.tarefa_id
         and t.obra_id = new.obra_id and t.frente_id = new.frente_id
     )) then
    raise exception 'Material, almoxarifado, frente ou tarefa incompatíveis com esta obra';
  end if;
  return new;
end;
$$;
create trigger validar_solicitacao_material before insert on public.solicitacoes_materiais
for each row execute function private.validar_solicitacao_material();
alter table public.materiais enable row level security;
alter table public.almoxarifados enable row level security;
alter table public.solicitacoes_materiais enable row level security;
create policy materiais_ler on public.materiais for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy materiais_criar on public.materiais for insert to authenticated
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor'));
create policy almoxarifados_ler on public.almoxarifados for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy almoxarifados_criar on public.almoxarifados for insert to authenticated
with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor'));
create policy solicitacoes_materiais_ler on public.solicitacoes_materiais for select to authenticated
using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy solicitacoes_materiais_criar on public.solicitacoes_materiais for insert to authenticated
with check (
  private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado')
  and solicitado_por = auth.uid() and estado = 'pendente'
  and decidido_por is null and decidido_em is null
);
grant select, insert on public.materiais, public.almoxarifados to authenticated;
grant select, insert on public.solicitacoes_materiais to authenticated;
grant usage, select on sequence public.materiais_id_seq, public.almoxarifados_id_seq, public.solicitacoes_materiais_id_seq to authenticated;
create function public.decidir_solicitacao_material(p_id bigint, p_acao text, p_justificativa text default null)
returns public.solicitacoes_materiais
language plpgsql security definer set search_path = '' as $$
declare
  v public.solicitacoes_materiais;
  v_papel text;
begin
  if auth.uid() is null then raise exception 'Entre novamente para continuar'; end if;
  if p_acao not in ('aprovar','recusar','cancelar') then raise exception 'Ação inválida'; end if;
  select * into v from public.solicitacoes_materiais where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  v_papel := private.papel_obra(v.obra_id);
  if v_papel is null or v_papel = 'cliente' then raise exception 'Acesso negado'; end if;
  if v.estado <> 'pendente' then raise exception 'Esta solicitação já foi decidida'; end if;
  if p_acao in ('aprovar','recusar') and v_papel not in ('administrador','engenheiro') then
    raise exception 'Somente engenheiro ou administrador pode aprovar ou recusar';
  end if;
  if p_acao = 'cancelar' and v.solicitado_por <> auth.uid()
     and v_papel not in ('administrador','engenheiro') then
    raise exception 'Você não pode cancelar esta solicitação';
  end if;
  if p_acao = 'recusar' and nullif(trim(coalesce(p_justificativa,'')),'') is null then
    raise exception 'Informe o motivo da recusa';
  end if;
  update public.solicitacoes_materiais
    set estado = case p_acao when 'aprovar' then 'aprovada' when 'recusar' then 'recusada' else 'cancelada' end,
        decidido_por = auth.uid(), decidido_em = now(),
        justificativa_decisao = nullif(trim(coalesce(p_justificativa,'')),'')
    where id = p_id returning * into v;
  return v;
end;
$$;
revoke all on function public.decidir_solicitacao_material(bigint,text,text) from public;
grant execute on function public.decidir_solicitacao_material(bigint,text,text) to authenticated;
