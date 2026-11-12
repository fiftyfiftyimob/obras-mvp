-- Modelos BIM: arquivos privados, revisão e extração conferível.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('modelos-bim', 'modelos-bim', false, 209715200, array['application/octet-stream','application/x-step','model/ifc'])
on conflict (id) do nothing;

create table public.bim_importacoes (
  id uuid primary key default gen_random_uuid(),
  obra_id integer not null references public.obras(id),
  revisao text not null,
  nome_arquivo text not null,
  caminho_arquivo text not null unique,
  tamanho_bytes bigint not null check (tamanho_bytes > 0 and tamanho_bytes <= 209715200),
  estado text not null default 'aguardando_envio'
    check (estado in ('aguardando_envio','pendente','processando','concluida','falha')),
  schema_ifc text,
  total_elementos integer not null default 0,
  total_pendencias integer not null default 0,
  erro text,
  tentativas integer not null default 0,
  processar_apos timestamptz not null default now(),
  lease_ate timestamptz,
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (obra_id, revisao),
  check (caminho_arquivo = obra_id::text || '/' || id::text || '/modelo.ifc')
);
create index bim_importacoes_fila_idx on public.bim_importacoes (processar_apos, criado_em)
  where estado in ('pendente','processando');
create index bim_importacoes_obra_idx on public.bim_importacoes (obra_id, criado_em desc);

create table public.bim_elementos (
  id bigint generated always as identity primary key,
  importacao_id uuid not null references public.bim_importacoes(id) on delete cascade,
  obra_id integer not null references public.obras(id),
  global_id text,
  classe text not null,
  nome text,
  local text,
  local_global_id text,
  pendencias jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index bim_elementos_importacao_idx on public.bim_elementos (importacao_id, id);
create index bim_elementos_global_idx on public.bim_elementos (importacao_id, global_id);

create table public.bim_quantidades (
  id bigint generated always as identity primary key,
  elemento_id bigint not null references public.bim_elementos(id) on delete cascade,
  importacao_id uuid not null references public.bim_importacoes(id) on delete cascade,
  obra_id integer not null references public.obras(id),
  conjunto text,
  nome text,
  tipo text not null,
  valor numeric,
  unidade text,
  pendencia text
);
create index bim_quantidades_elemento_idx on public.bim_quantidades (elemento_id);

-- Only the upload state may be changed by browser clients.
create or replace function private.bim_guard_importacao()
returns trigger language plpgsql set search_path = '' as $
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
  if old.estado <> 'aguardando_envio' or new.estado <> 'pendente'
     or (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
    raise exception 'A importação só pode ser marcada como enviada';
  end if;
  return new;
end;
$;
create trigger bim_guard_importacao before update on public.bim_importacoes
for each row execute function private.bim_guard_importacao();

grant select, insert, update, delete on public.bim_importacoes, public.bim_elementos, public.bim_quantidades to service_role;
grant usage, select on sequence public.bim_elementos_id_seq, public.bim_quantidades_id_seq to service_role;

alter table public.bim_importacoes enable row level security;
alter table public.bim_elementos enable row level security;
alter table public.bim_quantidades enable row level security;

create policy bim_importacoes_ler on public.bim_importacoes for select to authenticated
  using (private.possui_obra(obra_id));
create policy bim_importacoes_criar on public.bim_importacoes for insert to authenticated
  with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor')
    and criado_por = (select auth.uid()));
create policy bim_importacoes_marcar_envio on public.bim_importacoes for update to authenticated
  using (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor')
    and estado = 'aguardando_envio')
  with check (private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor')
    and estado = 'pendente');
create policy bim_elementos_ler on public.bim_elementos for select to authenticated
  using (private.possui_obra(obra_id));
create policy bim_quantidades_ler on public.bim_quantidades for select to authenticated
  using (private.possui_obra(obra_id));

grant select, insert, update on public.bim_importacoes to authenticated;
grant select on public.bim_elementos, public.bim_quantidades to authenticated;

create policy bim_arquivo_ler on storage.objects for select to authenticated
  using (bucket_id = 'modelos-bim' and exists (
    select 1 from public.bim_importacoes i
    where i.caminho_arquivo = name and private.possui_obra(i.obra_id)
  ));
create policy bim_arquivo_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'modelos-bim' and exists (
    select 1 from public.bim_importacoes i
    where i.caminho_arquivo = name and i.estado = 'aguardando_envio'
      and i.criado_por = (select auth.uid())
      and private.papel_obra(i.obra_id) in ('administrador','engenheiro','supervisor')
  ));

create or replace function public.bim_reivindicar_importacao()
returns setof public.bim_importacoes
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Acesso negado';
  end if;
  select i.id into v_id from public.bim_importacoes i
    where (i.estado = 'pendente' and i.processar_apos <= now())
       or (i.estado = 'processando' and i.lease_ate < now())
    order by i.criado_em
    for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.bim_importacoes i
    set estado='processando', tentativas=i.tentativas+1, lease_ate=now()+interval '30 minutes'
    where i.id=v_id returning i.*;
end;
$$;
revoke all on function public.bim_reivindicar_importacao() from public, anon, authenticated;
grant execute on function public.bim_reivindicar_importacao() to service_role;
