-- Perfis por obra: dados compartilhados são expostos somente por RPCs com escopo explícito.
create table if not exists private.obra_acessos (
  obra_id integer not null references public.obras(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  papel text not null check (papel in ('encarregado','cliente')),
  criado_em timestamptz not null default now(),
  primary key (obra_id, usuario_id)
);
create index if not exists obra_acessos_usuario_idx on private.obra_acessos(usuario_id);
alter table private.obra_acessos enable row level security;
revoke all on private.obra_acessos from public, anon, authenticated;

create or replace function public.listar_acessos_obra(p_obra integer)
returns table(usuario_id uuid, email text, papel text, criado_em timestamptz)
language plpgsql security definer set search_path to ''
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.obras o where o.id=p_obra and o.dono_id=auth.uid())
 then raise exception 'Acesso negado.'; end if;
 return query select a.usuario_id,a.email,a.papel,a.criado_em
 from private.obra_acessos a where a.obra_id=p_obra order by a.criado_em desc;
end $$;

create or replace function public.conceder_acesso_obra(p_obra integer,p_email text,p_papel text)
returns void language plpgsql security definer set search_path to ''
as $$
declare v_usuario uuid; v_email text;
begin
 if auth.uid() is null or not exists(select 1 from public.obras o where o.id=p_obra and o.dono_id=auth.uid())
 then raise exception 'Acesso negado.'; end if;
 if p_papel not in ('encarregado','cliente') or p_email is null or length(trim(p_email))=0 or length(trim(p_email))>320
 then raise exception 'Informe um email e perfil válidos.'; end if;
 select u.id,lower(u.email) into v_usuario,v_email from auth.users u
 where lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null;
 if v_usuario is null then raise exception 'Este email ainda não possui conta confirmada no aplicativo.'; end if;
 if v_usuario=auth.uid() then raise exception 'O gestor já possui acesso à obra.'; end if;
 insert into private.obra_acessos(obra_id,usuario_id,email,papel)
 values(p_obra,v_usuario,v_email,p_papel)
 on conflict (obra_id,usuario_id) do update set email=excluded.email,papel=excluded.papel;
end $$;

create or replace function public.revogar_acesso_obra(p_obra integer,p_usuario uuid)
returns void language plpgsql security definer set search_path to ''
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.obras o where o.id=p_obra and o.dono_id=auth.uid())
 then raise exception 'Acesso negado.'; end if;
 delete from private.obra_acessos a where a.obra_id=p_obra and a.usuario_id=p_usuario;
end $$;

create or replace function public.minhas_obras_compartilhadas()
returns table(id integer,nome text,cidade text,estado text,papel text)
language plpgsql security definer set search_path to ''
as $$
begin
 if auth.uid() is null then raise exception 'Entre novamente.'; end if;
 return query select o.id,o.nome,o.cidade,o.estado,a.papel
 from private.obra_acessos a join public.obras o on o.id=a.obra_id
 where a.usuario_id=auth.uid() and o.ativo order by o.nome;
end $$;

create or replace function public.detalhe_obra_compartilhada(p_obra integer)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_papel text; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Entre novamente.'; end if;
 select a.papel into v_papel from private.obra_acessos a join public.obras o on o.id=a.obra_id
 where a.obra_id=p_obra and a.usuario_id=auth.uid() and o.ativo;
 if v_papel is null then raise exception 'Acesso negado.'; end if;
 select jsonb_build_object(
   'obra',jsonb_build_object('id',o.id,'nome',o.nome,'endereco',o.endereco,'cidade',o.cidade,'estado',o.estado,'papel',v_papel),
   'tarefas',coalesce((select jsonb_agg(jsonb_build_object(
     'id',t.id,'data',t.data,'turno',t.turno,'status',t.status,'servico',s.nome,
     'frente',f.nome,'equipe',e.nome,'quantidade_meta',t.quantidade_meta,'unidade',t.unidade,
     'observacao',t.observacao,'quantidade_realizada',
     coalesce((select sum(ev.quantidade_realizada) from public.evolucoes_tarefa ev where ev.tarefa_id=t.id),0)
   ) order by t.data desc,t.id desc)
   from public.tarefas t join public.servicos s on s.id=t.servico_id
   join public.frentes f on f.id=t.frente_id
   left join public.equipes e on e.id=t.equipe_id
   where t.obra_id=o.id),'[]'::jsonb),
   'rdos',coalesce((select jsonb_agg(jsonb_build_object(
     'id',r.id,'data',r.data,'clima',r.clima,'observacao_geral',r.observacao_geral,
     'itens',coalesce((select jsonb_agg(jsonb_build_object(
       'id',i.id,'frente',fi.nome,'servico',si.nome,'equipe',ei.nome,
       'quantidade_realizada',i.quantidade_realizada,'unidade',i.unidade,'observacao',i.observacao
     ) order by i.id) from public.rdos_itens i
       left join public.frentes fi on fi.id=i.frente_id
       left join public.servicos si on si.id=i.servico_id
       left join public.equipes ei on ei.id=i.equipe_id
       where i.rdo_id=r.id),'[]'::jsonb)
   ) order by r.data desc,r.id desc) from public.rdos r where r.obra_id=o.id),'[]'::jsonb)
 ) into v_result from public.obras o where o.id=p_obra;
 return v_result;
end $$;

create or replace function public.registrar_evolucao_compartilhada(
 p_tarefa integer,p_tipo text,p_quantidade numeric default 0,p_motivo text default null,p_observacao text default null
) returns integer language plpgsql security definer set search_path to ''
as $$
declare v_tarefa public.tarefas; v_status text; v_evento integer;
begin
 if auth.uid() is null then raise exception 'Entre novamente.'; end if;
 select t.* into v_tarefa from public.tarefas t
 join public.obras o on o.id=t.obra_id
 join private.obra_acessos a on a.obra_id=o.id and a.usuario_id=auth.uid() and a.papel='encarregado'
 where t.id=p_tarefa and o.ativo for update of t;
 if not found then raise exception 'Tarefa não encontrada ou acesso negado.'; end if;
 if p_quantidade is null or p_quantidade<0 then raise exception 'Quantidade inválida.'; end if;
 if p_tipo='inicio' and v_tarefa.status='nao_iniciada' then v_status:='em_execucao';
 elsif p_tipo='pausa' and v_tarefa.status='em_execucao' then v_status:='pausada';
 elsif p_tipo='retomada' and v_tarefa.status in ('pausada','bloqueada') then v_status:='em_execucao';
 elsif p_tipo='impedimento' and v_tarefa.status in ('nao_iniciada','em_execucao','pausada') then v_status:='bloqueada';
 elsif p_tipo='producao' and v_tarefa.status='em_execucao' then v_status:='em_execucao';
 elsif p_tipo='solicitacao_conclusao' and v_tarefa.status='em_execucao' then v_status:='aguardando_validacao';
 else raise exception 'Esta ação não é permitida no estado atual da tarefa.'; end if;
 if p_tipo='impedimento' and (p_motivo is null or p_motivo not in ('falta_material','falta_ferramenta','frente_ocupada','projeto_pendente','chuva','espera_equipe','seguranca','outro'))
 then raise exception 'Informe o motivo do impedimento.'; end if;
 if p_tipo in ('inicio','retomada') and p_quantidade<>0 then raise exception 'Registre a produção em outro apontamento.'; end if;
 if p_tipo='producao' and p_quantidade<=0 then raise exception 'Informe uma quantidade maior que zero.'; end if;
 insert into public.evolucoes_tarefa(tarefa_id,autor_id,tipo,quantidade_realizada,motivo_impedimento,observacao)
 values(p_tarefa,auth.uid(),p_tipo,p_quantidade,case when p_tipo='impedimento' then p_motivo else null end,p_observacao)
 returning id into v_evento;
 update public.tarefas set status=v_status,atualizado_em=now() where id=p_tarefa;
 return v_evento;
end $$;

-- Em uma alteração apenas de status, a unidade/serviço já foram validados na criação.
CREATE OR REPLACE FUNCTION private.validar_registro()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j jsonb := to_jsonb(new); antigo jsonb; obra integer; ref integer; tabela text; campo text; v record;
begin
 if TG_OP='UPDATE' then
  antigo:=to_jsonb(old);
  foreach campo in array array['obra_id','dono_id','autor_id','rdo_id','equipe_id','colaborador_id'] loop
   if campo in ('equipe_id','colaborador_id') and TG_TABLE_NAME <> 'equipe_colaboradores' then continue; end if;
   if j ? campo and j->campo is distinct from antigo->campo then raise exception 'Não é permitido transferir este registro.'; end if;
  end loop;
 end if;
 if TG_OP='INSERT' and j ? 'autor_id' and (j->>'autor_id')::uuid is distinct from auth.uid() then raise exception 'Autor inválido.'; end if;
 if j ? 'criado_por_id' and j->>'criado_por_id' is not null and auth.uid() is not null then raise exception 'Use a conta atual para registrar autoria.'; end if;
 if TG_OP='UPDATE' and TG_TABLE_NAME='tarefas' and antigo->>'status'<>'nao_iniciada' and (j-array['status','atualizado_em']) is distinct from (antigo-array['status','atualizado_em']) then raise exception 'Uma tarefa iniciada só pode receber registros de execução.'; end if;
 if TG_OP='UPDATE' and TG_TABLE_NAME='servicos' and j->>'unidade' is distinct from antigo->>'unidade' and (exists(select 1 from public.tarefas where servico_id=new.id) or exists(select 1 from public.compromissos_semanais where servico_id=new.id) or exists(select 1 from public.rdos_itens where servico_id=new.id)) then raise exception 'A unidade de um serviço já utilizado não pode ser alterada.'; end if;
 if j ? 'atualizado_em' then new:=jsonb_populate_record(new,jsonb_build_object('atualizado_em',now())); end if;
 obra:=(j->>'obra_id')::integer;
 if TG_TABLE_NAME='rdos_itens' then select obra_id into obra from public.rdos where id=(j->>'rdo_id')::integer; end if;
 if TG_TABLE_NAME in ('equipes','colaboradores') and obra is null then raise exception 'Selecione uma obra.'; end if;
 if obra is not null and TG_OP='INSERT' and not exists(select 1 from public.obras where id=obra and ativo) then raise exception 'Restaure a obra antes de adicionar registros.'; end if;
 if TG_TABLE_NAME='tarefas' and TG_OP='INSERT' and j->>'status'<>'nao_iniciada' then raise exception 'A tarefa deve começar como não iniciada.'; end if;
 if TG_TABLE_NAME='tarefas' and j->>'equipe_id' is null and j->>'colaborador_id' is null then raise exception 'Selecione uma equipe ou colaborador.'; end if;
 for v in select * from (values ('frente_id','frentes'),('equipe_id','equipes'),('equipe_principal_id','equipes'),('colaborador_id','colaboradores'),('compromisso_semanal_id','compromissos_semanais')) as x(c,t) loop
  if j->>v.c is not null and obra is not null then
   execute format('select obra_id from public.%I where id=$1',v.t) into ref using (j->>v.c)::integer;
   if ref is distinct from obra then raise exception 'Os vínculos devem pertencer à mesma obra.'; end if;
  end if;
 end loop;
 if j->>'servico_id' is not null and (TG_OP='INSERT' or TG_TABLE_NAME<>'tarefas' or (j->>'servico_id') is distinct from (antigo->>'servico_id') or (j->>'unidade') is distinct from (antigo->>'unidade')) and not exists(select 1 from public.servicos where id=(j->>'servico_id')::integer and (dono_id is null or dono_id=auth.uid()) and unidade=j->>'unidade') then raise exception 'Serviço ou unidade inválidos.'; end if;
 if TG_TABLE_NAME='tarefas' and j->>'compromisso_semanal_id' is not null and not exists(select 1 from public.compromissos_semanais c where c.id=(j->>'compromisso_semanal_id')::integer and c.servico_id=(j->>'servico_id')::integer and c.frente_id=(j->>'frente_id')::integer and c.equipe_id=(j->>'equipe_id')::integer and (j->>'data')::date between c.semana_inicio and c.semana_fim) then raise exception 'A tarefa deve respeitar serviço, frente, equipe e período do compromisso.'; end if;
 return new;
end $function$;

revoke all on function public.listar_acessos_obra(integer) from public,anon;
revoke all on function public.conceder_acesso_obra(integer,text,text) from public,anon;
revoke all on function public.revogar_acesso_obra(integer,uuid) from public,anon;
revoke all on function public.minhas_obras_compartilhadas() from public,anon;
revoke all on function public.detalhe_obra_compartilhada(integer) from public,anon;
revoke all on function public.registrar_evolucao_compartilhada(integer,text,numeric,text,text) from public,anon;
grant execute on function public.listar_acessos_obra(integer),public.conceder_acesso_obra(integer,text,text),public.revogar_acesso_obra(integer,uuid),public.minhas_obras_compartilhadas(),public.detalhe_obra_compartilhada(integer),public.registrar_evolucao_compartilhada(integer,text,numeric,text,text) to authenticated;
