-- Mantem funcoes privilegiadas fora do schema exposto e publica apenas wrappers invoker.
alter function public.emitir_acesso_operario(integer) set schema private;
alter function public.desativar_acesso_operario(bigint) set schema private;

create function public.emitir_acesso_operario(p_colaborador integer)
returns table(canal_id bigint, codigo text, telefone_e164 text, expira_em timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.emitir_acesso_operario(p_colaborador);
$$;

create function public.desativar_acesso_operario(p_canal bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.desativar_acesso_operario(p_canal);
$$;

revoke all on function private.emitir_acesso_operario(integer) from public,anon;
grant execute on function private.emitir_acesso_operario(integer) to authenticated;
revoke all on function private.desativar_acesso_operario(bigint) from public,anon;
grant execute on function private.desativar_acesso_operario(bigint) to authenticated;
revoke all on function public.emitir_acesso_operario(integer) from public,anon;
grant execute on function public.emitir_acesso_operario(integer) to authenticated;
revoke all on function public.desativar_acesso_operario(bigint) from public,anon;
grant execute on function public.desativar_acesso_operario(bigint) to authenticated;

create index canais_operario_criado_por_idx on public.canais_operario(criado_por);
create index evidencias_tarefa_colaborador_idx on public.evidencias_tarefa(colaborador_id);
create index evidencias_tarefa_canal_idx on public.evidencias_tarefa(canal_id);
create index sessoes_operario_tarefa_idx on public.sessoes_operario(tarefa_ativa_id);
create index whatsapp_inbox_canal_idx on public.whatsapp_inbox(canal_id);
create index whatsapp_outbox_canal_idx on public.whatsapp_outbox(canal_id);
