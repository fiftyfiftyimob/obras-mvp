create or replace function public.claim_whatsapp_outbox(p_limite integer default 20)
returns table(id bigint,canal_id bigint,telefone_e164 text,tipo text,corpo text,metadados jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  update public.whatsapp_outbox set
    status=case when tentativas>=5 then 'erro' else 'pendente' end,
    ultimo_erro=case when tentativas>=5 then coalesce(ultimo_erro,'Processamento interrompido na ultima tentativa.') else ultimo_erro end,
    processando_em=null
  where status='processando' and processando_em < now()-interval '5 minutes';

  update public.whatsapp_outbox set status='erro',
    ultimo_erro=coalesce(ultimo_erro,'Limite de tentativas atingido.')
  where status='pendente' and tentativas>=5;

  return query
  with fila as (
    select o.id from public.whatsapp_outbox o
    where o.status='pendente' and o.disponivel_em<=now() and o.tentativas<5
    order by o.id for update skip locked limit greatest(1,least(p_limite,100))
  ), atualizada as (
    update public.whatsapp_outbox o set status='processando',processando_em=now(),tentativas=o.tentativas+1
    from fila where o.id=fila.id
    returning o.id,o.canal_id,o.telefone_e164,o.tipo,o.corpo,o.metadados
  ) select * from atualizada;
end $$;

revoke all on function public.claim_whatsapp_outbox(integer) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_outbox(integer) to service_role;
