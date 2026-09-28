-- Chave de idempotência para reenvio seguro dos apontamentos salvos no dispositivo.
create table private.apontamentos_sincronizados (
 chave uuid primary key,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 tarefa_id integer not null references public.tarefas(id) on delete cascade,
 payload jsonb not null,
 evento_id integer not null references public.evolucoes_tarefa(id) on delete cascade,
 criado_em timestamptz not null default now()
);
create index apontamentos_sincronizados_usuario_idx on private.apontamentos_sincronizados(usuario_id);
alter table private.apontamentos_sincronizados enable row level security;
revoke all on private.apontamentos_sincronizados from public, anon, authenticated;

create or replace function public.registrar_apontamento_sincronizado(
 p_tarefa integer,p_tipo text,p_quantidade numeric,p_motivo text,p_observacao text,p_chave uuid
) returns integer language plpgsql security definer set search_path to ''
as $$
declare v_existente private.apontamentos_sincronizados; v_payload jsonb; v_evento integer;
begin
 if auth.uid() is null or p_chave is null then raise exception 'Entre novamente e informe a chave do apontamento.'; end if;
 if not exists(
   select 1 from public.tarefas t
   join public.obras o on o.id=t.obra_id
   join private.obra_acessos a on a.obra_id=o.id
   where t.id=p_tarefa and o.ativo and a.usuario_id=auth.uid() and a.papel='encarregado'
 ) then raise exception 'Tarefa não encontrada ou acesso negado.'; end if;
 v_payload:=jsonb_build_array(p_tarefa,p_tipo,p_quantidade,p_motivo,p_observacao);
 select * into v_existente from private.apontamentos_sincronizados where chave=p_chave;
 if found then
   if v_existente.usuario_id<>auth.uid() or v_existente.payload<>v_payload
   then raise exception 'Chave de apontamento já utilizada.'; end if;
   return v_existente.evento_id;
 end if;
 v_evento:=public.registrar_evolucao_compartilhada(p_tarefa,p_tipo,p_quantidade,p_motivo,p_observacao);
 insert into private.apontamentos_sincronizados(chave,usuario_id,tarefa_id,payload,evento_id)
 values(p_chave,auth.uid(),p_tarefa,v_payload,v_evento);
 return v_evento;
end $$;
revoke all on function public.registrar_apontamento_sincronizado(integer,text,numeric,text,text,uuid) from public,anon;
grant execute on function public.registrar_apontamento_sincronizado(integer,text,numeric,text,text,uuid) to authenticated;
