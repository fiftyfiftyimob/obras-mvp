-- Per-work service consumption rules are drafts until an engineer approves them.
create table public.composicoes_servico (
  id uuid primary key default gen_random_uuid(),
  obra_id integer not null references public.obras(id),
  servico_id integer not null references public.servicos(id),
  estado text not null default 'rascunho' check (estado in ('rascunho','aprovada','arquivada')),
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  aprovado_por uuid,
  aprovado_em timestamptz,
  unique (obra_id, id),
  check ((estado = 'rascunho' and aprovado_por is null and aprovado_em is null)
      or (estado <> 'rascunho' and aprovado_por is not null and aprovado_em is not null))
);
create unique index composicoes_servico_vigente_idx
  on public.composicoes_servico (obra_id, servico_id) where estado = 'aprovada';
create index composicoes_servico_lista_idx
  on public.composicoes_servico (obra_id, servico_id, criado_em desc);

create table public.composicao_itens (
  id bigint generated always as identity primary key,
  composicao_id uuid not null,
  obra_id integer not null,
  material_id bigint not null,
  consumo_por_unidade numeric(14,6) not null
    check (consumo_por_unidade > 0 and consumo_por_unidade::text <> 'NaN'),
  perda_percentual numeric(5,2) not null default 0
    check (perda_percentual >= 0 and perda_percentual <= 100 and perda_percentual::text <> 'NaN'),
  criado_em timestamptz not null default now(),
  foreign key (obra_id, composicao_id)
    references public.composicoes_servico(obra_id, id) on delete cascade,
  foreign key (obra_id, material_id) references public.materiais(obra_id, id),
  unique (composicao_id, material_id)
);
create index composicao_itens_obra_idx on public.composicao_itens (obra_id, composicao_id);

create function private.validar_composicao_servico()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.servicos s
    where s.id = new.servico_id and s.ativo
      and (s.dono_id is null or s.dono_id = auth.uid()
        or exists (select 1 from public.tarefas t
          where t.obra_id = new.obra_id and t.servico_id = s.id))
  ) then
    raise exception 'Serviço indisponível para esta obra';
  end if;
  return new;
end;
$$;
create trigger validar_composicao_servico before insert on public.composicoes_servico
  for each row execute function private.validar_composicao_servico();

create function private.validar_composicao_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.composicoes_servico c
      where c.id = new.composicao_id and c.obra_id = new.obra_id and c.estado = 'rascunho')
    or not exists (select 1 from public.materiais m
      where m.id = new.material_id and m.obra_id = new.obra_id and m.ativo) then
    raise exception 'A composição deve estar em rascunho e o material ativo na mesma obra';
  end if;
  return new;
end;
$$;
create trigger validar_composicao_item before insert on public.composicao_itens
  for each row execute function private.validar_composicao_item();

alter table public.composicoes_servico enable row level security;
alter table public.composicao_itens enable row level security;
create policy composicoes_ler on public.composicoes_servico for select to authenticated
  using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy composicoes_criar on public.composicoes_servico for insert to authenticated
  with check (estado = 'rascunho' and criado_por = (select auth.uid())
    and private.papel_obra(obra_id) in ('administrador','engenheiro'));
create policy composicoes_descartar on public.composicoes_servico for delete to authenticated
  using (estado = 'rascunho' and private.papel_obra(obra_id) in ('administrador','engenheiro'));
create policy composicao_itens_ler on public.composicao_itens for select to authenticated
  using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','estagiario','encarregado'));
create policy composicao_itens_criar on public.composicao_itens for insert to authenticated
  with check (private.papel_obra(obra_id) in ('administrador','engenheiro')
    and exists (select 1 from public.composicoes_servico c
      where c.id = composicao_itens.composicao_id and c.obra_id = composicao_itens.obra_id and c.estado = 'rascunho'));
create policy composicao_itens_excluir on public.composicao_itens for delete to authenticated
  using (private.papel_obra(obra_id) in ('administrador','engenheiro')
    and exists (select 1 from public.composicoes_servico c
      where c.id = composicao_itens.composicao_id and c.obra_id = composicao_itens.obra_id and c.estado = 'rascunho'));
grant select, insert, delete on public.composicoes_servico, public.composicao_itens to authenticated;
grant usage, select on sequence public.composicao_itens_id_seq to authenticated;

create function public.aprovar_composicao_servico(p_id uuid)
returns public.composicoes_servico
language plpgsql security definer set search_path = '' as $$
declare v public.composicoes_servico;
begin
  if auth.uid() is null then raise exception 'Entre novamente para continuar'; end if;
  select * into v from public.composicoes_servico where id = p_id for update;
  if not found or not coalesce(private.papel_obra(v.obra_id) in ('administrador','engenheiro'), false) then
    raise exception 'Acesso negado'; end if;
  if v.estado <> 'rascunho' then raise exception 'Somente rascunhos podem ser aprovados'; end if;
  if not exists (select 1 from public.composicao_itens where composicao_id = p_id) then
    raise exception 'Adicione pelo menos um material antes de aprovar'; end if;
  update public.composicoes_servico set estado = 'arquivada'
    where obra_id = v.obra_id and servico_id = v.servico_id and estado = 'aprovada';
  update public.composicoes_servico
    set estado = 'aprovada', aprovado_por = auth.uid(), aprovado_em = now()
    where id = p_id returning * into v;
  return v;
end;
$$;
revoke all on function public.aprovar_composicao_servico(uuid) from public, anon;
grant execute on function public.aprovar_composicao_servico(uuid) to authenticated;
