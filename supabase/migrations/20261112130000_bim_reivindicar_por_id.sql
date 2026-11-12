create or replace function public.bim_reivindicar_importacao(p_id uuid default null)
returns setof public.bim_importacoes
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Acesso negado';
  end if;
  select i.id into v_id from public.bim_importacoes i
    where ((p_id is null and ((i.estado = 'pendente' and i.processar_apos <= now())
                         or (i.estado = 'processando' and i.lease_ate < now())))
        or (p_id is not null and i.id = p_id and i.estado = 'pendente'))
    order by i.criado_em
    for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.bim_importacoes i
    set estado='processando', tentativas=i.tentativas+1, lease_ate=now()+interval '30 minutes'
    where i.id=v_id returning i.*;
end;
$$;
revoke all on function public.bim_reivindicar_importacao(uuid) from public, anon, authenticated;
grant execute on function public.bim_reivindicar_importacao(uuid) to service_role;