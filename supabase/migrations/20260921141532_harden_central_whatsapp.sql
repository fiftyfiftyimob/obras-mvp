drop policy gestor_visualiza_integracao on public.whatsapp_integracao;
create policy gestor_visualiza_integracao on public.whatsapp_integracao
for select to authenticated using (
  exists (
    select 1 from public.obras o
    where o.dono_id = (select auth.uid())
  )
);

create index whatsapp_integracao_solicitado_por_idx
  on public.whatsapp_integracao(solicitado_por);

alter function public.solicitar_conexao_whatsapp() set schema private;
alter function public.solicitar_desconexao_whatsapp() set schema private;
alter function public.enviar_tarefa_whatsapp(integer) set schema private;
alter function public.resumo_fila_whatsapp() set schema private;

create function public.solicitar_conexao_whatsapp() returns void
language sql security invoker set search_path = '' as $$
  select private.solicitar_conexao_whatsapp();
$$;

create function public.solicitar_desconexao_whatsapp() returns void
language sql security invoker set search_path = '' as $$
  select private.solicitar_desconexao_whatsapp();
$$;

create function public.enviar_tarefa_whatsapp(p_tarefa integer) returns integer
language sql security invoker set search_path = '' as $$
  select private.enviar_tarefa_whatsapp(p_tarefa);
$$;

create function public.resumo_fila_whatsapp() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.resumo_fila_whatsapp();
$$;

revoke all on function private.solicitar_conexao_whatsapp() from public,anon;
revoke all on function private.solicitar_desconexao_whatsapp() from public,anon;
revoke all on function private.enviar_tarefa_whatsapp(integer) from public,anon;
revoke all on function private.resumo_fila_whatsapp() from public,anon;
grant execute on function private.solicitar_conexao_whatsapp() to authenticated;
grant execute on function private.solicitar_desconexao_whatsapp() to authenticated;
grant execute on function private.enviar_tarefa_whatsapp(integer) to authenticated;
grant execute on function private.resumo_fila_whatsapp() to authenticated;

revoke all on function public.solicitar_conexao_whatsapp() from public,anon;
revoke all on function public.solicitar_desconexao_whatsapp() from public,anon;
revoke all on function public.enviar_tarefa_whatsapp(integer) from public,anon;
revoke all on function public.resumo_fila_whatsapp() from public,anon;
grant execute on function public.solicitar_conexao_whatsapp() to authenticated;
grant execute on function public.solicitar_desconexao_whatsapp() to authenticated;
grant execute on function public.enviar_tarefa_whatsapp(integer) to authenticated;
grant execute on function public.resumo_fila_whatsapp() to authenticated;
