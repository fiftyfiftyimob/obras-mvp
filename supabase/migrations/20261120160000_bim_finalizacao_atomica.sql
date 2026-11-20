-- Armazena lotes temporarios e publica uma revisao IFC numa unica transacao.
create table public.bim_extracao_lotes (
  importacao_id uuid not null references public.bim_importacoes(id) on delete cascade,
  tentativa integer not null check (tentativa > 0),
  lote integer not null check (lote >= 0),
  elementos jsonb not null check (
    jsonb_typeof(elementos) = 'array'
    and jsonb_array_length(elementos) between 1 and 200
    and octet_length(elementos::text) <= 5000000
  ),
  primary key (importacao_id, tentativa, lote)
);
alter table public.bim_extracao_lotes enable row level security;
revoke all on public.bim_extracao_lotes from public, anon, authenticated;
grant select, insert, delete on public.bim_extracao_lotes to service_role;

alter table public.bim_elementos add column indice_extracao bigint;
create unique index bim_elementos_indice_extracao_idx
  on public.bim_elementos (importacao_id, indice_extracao)
  where indice_extracao is not null;

create function public.bim_finalizar_importacao(
  p_id uuid,
  p_tentativa integer,
  p_schema text,
  p_total_elementos integer,
  p_total_pendencias integer
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.bim_importacoes%rowtype;
  v_lotes bigint;
  v_ultimo integer;
  v_elementos bigint;
  v_pendencias_elementos bigint;
  v_pendencias_quantidades bigint;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Acesso negado';
  end if;
  select * into v_job from public.bim_importacoes where id = p_id for update;
  if not found or v_job.estado <> 'processando' or v_job.tentativas <> p_tentativa
     or v_job.lease_ate is null or v_job.lease_ate <= now() then
    raise exception 'Tentativa de extracao nao esta ativa';
  end if;
  if p_schema not in ('IFC2X3','IFC4','IFC4X3')
     or p_total_elementos is null or p_total_elementos < 0
     or p_total_pendencias is null or p_total_pendencias < 0 then
    raise exception 'Metadados IFC invalidos';
  end if;
  select count(*), coalesce(max(lote), -1), coalesce(sum(jsonb_array_length(elementos)), 0)
    into v_lotes, v_ultimo, v_elementos
    from public.bim_extracao_lotes
    where importacao_id = p_id and tentativa = p_tentativa;
  if v_elementos <> p_total_elementos
     or (v_lotes > 0 and v_ultimo <> v_lotes - 1)
     or exists (
       select 1 from public.bim_extracao_lotes
       where importacao_id = p_id and tentativa = p_tentativa
         and lote < v_ultimo and jsonb_array_length(elementos) <> 200
     ) then
    raise exception 'Lotes IFC incompletos';
  end if;
  select coalesce(sum(jsonb_array_length(coalesce(x.item->'pendencias', '[]'::jsonb))), 0)
    into v_pendencias_elementos
    from public.bim_extracao_lotes l
    cross join lateral jsonb_array_elements(l.elementos) as x(item)
    where l.importacao_id = p_id and l.tentativa = p_tentativa;
  select count(*) into v_pendencias_quantidades
    from public.bim_extracao_lotes l
    cross join lateral jsonb_array_elements(l.elementos) as x(item)
    cross join lateral jsonb_array_elements(coalesce(x.item->'quantidades', '[]'::jsonb)) as q(item)
    where l.importacao_id = p_id and l.tentativa = p_tentativa
      and nullif(q.item->>'pendencia', '') is not null;
  if v_pendencias_elementos + v_pendencias_quantidades <> p_total_pendencias then
    raise exception 'Total de pendencias IFC divergente';
  end if;

  delete from public.bim_elementos where importacao_id = p_id;
  insert into public.bim_elementos (
    importacao_id, obra_id, indice_extracao, global_id, classe, nome,
    local, local_global_id, pendencias
  )
  select p_id, v_job.obra_id, l.lote::bigint * 200 + x.ord,
    x.item->>'global_id', x.item->>'classe', x.item->>'nome',
    x.item->>'local', x.item->>'local_global_id',
    coalesce(x.item->'pendencias', '[]'::jsonb)
  from public.bim_extracao_lotes l
  cross join lateral jsonb_array_elements(l.elementos) with ordinality as x(item, ord)
  where l.importacao_id = p_id and l.tentativa = p_tentativa;

  insert into public.bim_quantidades (
    elemento_id, importacao_id, obra_id, conjunto, nome, tipo, valor, unidade, pendencia
  )
  select be.id, p_id, v_job.obra_id, q.item->>'conjunto', q.item->>'nome',
    q.item->>'tipo', nullif(q.item->>'valor', '')::numeric,
    q.item->>'unidade', q.item->>'pendencia'
  from public.bim_extracao_lotes l
  cross join lateral jsonb_array_elements(l.elementos) with ordinality as x(item, ord)
  join public.bim_elementos be
    on be.importacao_id = p_id and be.indice_extracao = l.lote::bigint * 200 + x.ord
  cross join lateral jsonb_array_elements(coalesce(x.item->'quantidades', '[]'::jsonb)) as q(item)
  where l.importacao_id = p_id and l.tentativa = p_tentativa;

  update public.bim_importacoes
    set estado = 'concluida', schema_ifc = p_schema,
        total_elementos = p_total_elementos, total_pendencias = p_total_pendencias,
        erro = null, lease_ate = null, concluido_em = now()
    where id = p_id;
  delete from public.bim_extracao_lotes where importacao_id = p_id;
end;
$$;
revoke all on function public.bim_finalizar_importacao(uuid,integer,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.bim_finalizar_importacao(uuid,integer,text,integer,integer)
  to service_role;
notify pgrst, 'reload schema';
