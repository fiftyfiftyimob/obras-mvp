-- Minimize profile privileges and retain audit integrity.
revoke update on public.perfis from authenticated;
grant update(nome,telefone) on public.perfis to authenticated;
create or replace function private.validar_registro() returns trigger language plpgsql security invoker set search_path='' as $$
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
 if j->>'servico_id' is not null and not exists(select 1 from public.servicos where id=(j->>'servico_id')::integer and (dono_id is null or dono_id=auth.uid()) and unidade=j->>'unidade') then raise exception 'Serviço ou unidade inválidos.'; end if;
 if TG_TABLE_NAME='tarefas' and j->>'compromisso_semanal_id' is not null and not exists(select 1 from public.compromissos_semanais c where c.id=(j->>'compromisso_semanal_id')::integer and c.servico_id=(j->>'servico_id')::integer and c.frente_id=(j->>'frente_id')::integer and c.equipe_id=(j->>'equipe_id')::integer and (j->>'data')::date between c.semana_inicio and c.semana_fim) then raise exception 'A tarefa deve respeitar serviço, frente, equipe e período do compromisso.'; end if;
 return new;
end $$;
