-- Execute em conexao administrativa. Todo dado de QA e revertido ao final.
begin;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',(select id::text from auth.users order by created_at limit 1),
    'role','authenticated'
  )::text,
  true
);

do $test$
declare
  v_user uuid := auth.uid();
  v_obra integer;
  v_outra_obra integer;
  v_frente integer;
  v_outra_frente integer;
  v_servico integer;
  v_colaborador integer;
  v_outro_colaborador integer;
  v_canal bigint;
  v_codigo text;
  v_tarefa integer;
  v_tarefa_alheia integer;
  v_result jsonb;
  v_i integer;
  v_negado boolean := false;
begin
  if v_user is null then raise exception 'Usuario de teste ausente'; end if;
  insert into public.obras(nome,dono_id) values('QA WhatsApp rollback',v_user) returning id into v_obra;
  insert into public.obras(nome,dono_id) values('QA outra obra rollback',v_user) returning id into v_outra_obra;
  insert into public.frentes(obra_id,nome) values(v_obra,'Frente QA') returning id into v_frente;
  insert into public.frentes(obra_id,nome) values(v_outra_obra,'Outra frente QA') returning id into v_outra_frente;
  insert into public.servicos(nome,unidade,dono_id) values('Servico QA '||gen_random_uuid(),'m2',v_user) returning id into v_servico;
  insert into public.colaboradores(nome,funcao,telefone,obra_id) values('Operario QA','Pedreiro','(11) 99999-0000',v_obra) returning id into v_colaborador;
  insert into public.colaboradores(nome,funcao,telefone,obra_id) values('Outro QA','Pedreiro','(11) 98888-0000',v_outra_obra) returning id into v_outro_colaborador;

  select e.canal_id,e.codigo into v_canal,v_codigo from public.emitir_acesso_operario(v_colaborador) e;
  if not exists(select 1 from public.whatsapp_outbox where whatsapp_outbox.canal_id=v_canal and status='pendente') then raise exception 'Fila de ativacao nao criada'; end if;
  for v_i in 1..5 loop
    v_result := public.ativar_canal_whatsapp('+5511999990000','999999');
    if (v_result->>'ativado')::boolean then raise exception 'Codigo invalido aceito'; end if;
  end loop;
  if (select status from public.canais_operario where id=v_canal) <> 'bloqueado' then raise exception 'Canal nao bloqueado'; end if;

  select e.canal_id,e.codigo into v_canal,v_codigo from public.emitir_acesso_operario(v_colaborador) e;
  v_result := public.ativar_canal_whatsapp('+5511999990000',v_codigo);
  if not (v_result->>'ativado')::boolean then raise exception 'Ativacao valida falhou'; end if;

  insert into public.tarefas(obra_id,servico_id,frente_id,colaborador_id,data,quantidade_meta,unidade,autor_id)
  values(v_obra,v_servico,v_frente,v_colaborador,current_date,10,'m2',v_user) returning id into v_tarefa;
  if not exists(select 1 from public.whatsapp_outbox where whatsapp_outbox.canal_id=v_canal and metadados->>'evento'='nova_tarefa') then raise exception 'Tarefa nao enfileirada'; end if;
  perform public.registrar_evolucao_operario(v_canal,v_tarefa,'inicio',0,null,null);
  perform public.registrar_evolucao_operario(v_canal,v_tarefa,'producao',2.5,null,'QA');
  perform public.registrar_evolucao_operario(v_canal,v_tarefa,'conclusao',1.5,null,'Validar');
  if (select status from public.tarefas where id=v_tarefa) <> 'aguardando_validacao' then raise exception 'Status de validacao incorreto'; end if;
  if (select sum(quantidade_realizada) from public.evolucoes_tarefa where tarefa_id=v_tarefa) <> 4 then raise exception 'Producao incorreta'; end if;
  perform public.registrar_evolucao(v_tarefa,'conclusao',0,null,'Aprovada');
  if (select status from public.tarefas where id=v_tarefa) <> 'concluida' then raise exception 'Aprovacao falhou'; end if;

  insert into public.tarefas(obra_id,servico_id,frente_id,colaborador_id,data,quantidade_meta,unidade,autor_id)
  values(v_outra_obra,v_servico,v_outra_frente,v_outro_colaborador,current_date,5,'m2',v_user) returning id into v_tarefa_alheia;
  begin
    perform public.registrar_evolucao_operario(v_canal,v_tarefa_alheia,'inicio',0,null,null);
  exception when others then
    v_negado := sqlerrm like '%nao atribuida%';
  end;
  if not v_negado then raise exception 'Isolamento entre obras falhou'; end if;
end
$test$;

rollback;
