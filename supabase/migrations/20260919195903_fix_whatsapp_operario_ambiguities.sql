create or replace function public.emitir_acesso_operario(p_colaborador integer)
returns table(canal_id bigint, codigo text, telefone_e164 text, expira_em timestamptz)
language plpgsql security definer set search_path = '' as $$
declare c public.colaboradores; v_codigo text; v_canal bigint; v_telefone text; v_expira timestamptz;
begin
  select col.* into c
  from public.colaboradores col
  join public.obras o on o.id=col.obra_id
  where col.id=p_colaborador and col.ativo and o.ativo and o.dono_id=auth.uid();
  if not found then raise exception 'Colaborador nao encontrado.'; end if;
  v_telefone := private.normalizar_telefone(c.telefone);
  v_codigo := lpad((floor(random()*1000000))::integer::text, 6, '0');
  v_expira := now() + interval '24 hours';

  insert into public.canais_operario(
    obra_id,colaborador_id,tipo,telefone_e164,status,codigo_ativacao_hash,
    codigo_expira_em,tentativas_ativacao,ativado_em,criado_por,atualizado_em
  ) values (
    c.obra_id,c.id,'whatsapp',v_telefone,'pendente',
    encode(extensions.digest(v_codigo,'sha256'),'hex'),v_expira,0,null,auth.uid(),now()
  )
  on conflict (colaborador_id,tipo) do update set
    telefone_e164=excluded.telefone_e164,status='pendente',
    codigo_ativacao_hash=excluded.codigo_ativacao_hash,codigo_expira_em=excluded.codigo_expira_em,
    tentativas_ativacao=0,ativado_em=null,criado_por=auth.uid(),atualizado_em=now()
  returning id into v_canal;

  insert into public.sessoes_operario(canal_id) values(v_canal)
  on conflict on constraint sessoes_operario_pkey do update set
    tarefa_ativa_id=null,estado='menu',dados='{}',atualizado_em=now();

  insert into public.whatsapp_outbox(canal_id,telefone_e164,corpo)
  values(
    v_canal,v_telefone,
    format('Ola, %s! Voce recebeu acesso ao acompanhamento da obra. Responda *ATIVAR %s* em ate 24 horas. Se nao reconhece esta mensagem, ignore.', c.nome, v_codigo)
  );
  return query select v_canal,v_codigo,v_telefone,v_expira;
end $$;

revoke all on function public.emitir_acesso_operario(integer) from public,anon;
grant execute on function public.emitir_acesso_operario(integer) to authenticated;
