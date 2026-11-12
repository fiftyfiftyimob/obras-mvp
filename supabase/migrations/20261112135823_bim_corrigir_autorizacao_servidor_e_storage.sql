create or replace function private.bim_guard_importacao()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'service_role' then return new; end if;
  if old.estado <> 'aguardando_envio' or new.estado <> 'pendente'
     or (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
    raise exception 'A importação só pode ser marcada como enviada';
  end if;
  return new;
end;
$$;

create or replace function public.bim_reivindicar_importacao(p_id uuid default null)
returns setof public.bim_importacoes language sql security invoker set search_path = ''
as $$
  with candidate as (
    select i.id from public.bim_importacoes i
    where (p_id is null or i.id = p_id)
      and ((i.estado = 'pendente' and (p_id is not null or i.processar_apos <= now()))
        or (i.estado = 'processando' and i.lease_ate < now()))
      and exists (select 1 from storage.objects o where o.bucket_id = 'modelos-bim' and o.name = i.caminho_arquivo)
    order by i.criado_em
    for update of i skip locked limit 1
  )
  update public.bim_importacoes i
    set estado = 'processando', tentativas = i.tentativas + 1, lease_ate = now() + interval '30 minutes'
    from candidate where i.id = candidate.id returning i.*;
$$;

create or replace function public.bim_reivindicar_importacao()
returns setof public.bim_importacoes language sql security invoker set search_path = ''
as $$ select * from public.bim_reivindicar_importacao(null::uuid); $$;
revoke execute on function public.bim_reivindicar_importacao(uuid), public.bim_reivindicar_importacao() from public, anon, authenticated;
grant execute on function public.bim_reivindicar_importacao(uuid), public.bim_reivindicar_importacao() to service_role;

alter policy bim_importacoes_ler on public.bim_importacoes using (private.possui_obra(obra_id));
alter policy bim_elementos_ler on public.bim_elementos using (private.possui_obra(obra_id));
alter policy bim_quantidades_ler on public.bim_quantidades using (private.possui_obra(obra_id));

create policy bim_arquivo_excluir on storage.objects for delete to authenticated using (
  bucket_id = 'modelos-bim' and exists (
    select 1 from public.bim_importacoes i
    where i.caminho_arquivo = objects.name and i.estado in ('aguardando_envio', 'pendente', 'falha')
      and private.papel_obra(i.obra_id) in ('administrador','engenheiro','supervisor','encarregado')
  )
);
drop policy if exists bim_importacoes_excluir on public.bim_importacoes;
create policy bim_importacoes_excluir on public.bim_importacoes for delete to authenticated using (
  estado in ('aguardando_envio', 'pendente', 'falha')
  and private.papel_obra(obra_id) in ('administrador','engenheiro','supervisor','encarregado')
  and not exists (select 1 from storage.objects o where o.bucket_id = 'modelos-bim' and o.name = caminho_arquivo)
);