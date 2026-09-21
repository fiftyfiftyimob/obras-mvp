-- Uma unica conta de WhatsApp atende todas as obras da empresa.
create table public.whatsapp_integracao (
  id smallint primary key default 1 check (id = 1),
  ativo boolean not null default false,
  status text not null default 'desconectado' check (
    status in ('desconectado','iniciando','aguardando_qr','conectado','desconectando','erro')
  ),
  qr_code text,
  telefone_e164 text,
  nome_conta text,
  ultimo_erro text,
  conectado_em timestamptz,
  solicitado_por uuid references auth.users(id),
  solicitado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

insert into public.whatsapp_integracao(id) values (1) on conflict do nothing;
alter table public.whatsapp_integracao enable row level security;
revoke all on public.whatsapp_integracao from anon, authenticated;
grant select on public.whatsapp_integracao to authenticated;

create policy gestor_visualiza_integracao on public.whatsapp_integracao
for select to authenticated using (
  exists (select 1 from public.obras o where o.dono_id = auth.uid())
);

create function public.solicitar_conexao_whatsapp() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.obras o where o.dono_id = auth.uid()) then
    raise exception 'Voce nao possui acesso a nenhuma obra.';
  end if;
  update public.whatsapp_integracao set
    ativo = true,
    status = case when status = 'conectado' then status else 'iniciando' end,
    qr_code = case when status = 'conectado' then qr_code else null end,
    ultimo_erro = null,
    solicitado_por = auth.uid(),
    solicitado_em = now(),
    atualizado_em = now()
  where id = 1;
end $$;

create function public.solicitar_desconexao_whatsapp() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.obras o where o.dono_id = auth.uid()) then
    raise exception 'Voce nao possui acesso a nenhuma obra.';
  end if;
  update public.whatsapp_integracao set
    ativo = false,
    status = 'desconectando',
    qr_code = null,
    solicitado_por = auth.uid(),
    solicitado_em = now(),
    atualizado_em = now()
  where id = 1;
end $$;

revoke all on function public.solicitar_conexao_whatsapp() from public, anon;
revoke all on function public.solicitar_desconexao_whatsapp() from public, anon;
grant execute on function public.solicitar_conexao_whatsapp() to authenticated;
grant execute on function public.solicitar_desconexao_whatsapp() to authenticated;

-- Descarta mensagens antigas de ativacao e libera os telefones ja cadastrados.
update public.whatsapp_outbox set
  status = 'erro',
  ultimo_erro = 'Mensagem substituida pelo novo fluxo centralizado.'
where status in ('pendente','processando');

update public.canais_operario set
  status = 'ativo',
  codigo_ativacao_hash = null,
  codigo_expira_em = null,
  tentativas_ativacao = 0,
  ativado_em = coalesce(ativado_em,now()),
  atualizado_em = now()
where tipo = 'whatsapp' and status = 'pendente';

-- A sessao do WhatsApp fica em armazenamento privado, pois o disco do Render Free e temporario.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-sessao', 'whatsapp-sessao', false, 52428800, array['application/zip'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- O numero cadastrado pelo gestor ja identifica o operario. Nao existe codigo de ativacao.
create or replace function private.emitir_acesso_operario(p_colaborador integer)
returns table(canal_id bigint, codigo text, telefone_e164 text, expira_em timestamptz)
language plpgsql security definer set search_path = '' as $$
declare c public.colaboradores; v_canal bigint; v_telefone text;
begin
  select col.* into c
  from public.colaboradores col
  join public.obras o on o.id = col.obra_id
  where col.id = p_colaborador and col.ativo and o.ativo and o.dono_id = auth.uid();
  if not found then raise exception 'Colaborador nao encontrado.'; end if;

  v_telefone := private.normalizar_telefone(c.telefone);
  insert into public.canais_operario(
    obra_id,colaborador_id,tipo,telefone_e164,status,codigo_ativacao_hash,
    codigo_expira_em,tentativas_ativacao,ativado_em,criado_por,atualizado_em
  ) values (
    c.obra_id,c.id,'whatsapp',v_telefone,'ativo',null,null,0,now(),auth.uid(),now()
  )
  on conflict (colaborador_id,tipo) do update set
    telefone_e164 = excluded.telefone_e164,
    status = 'ativo',
    codigo_ativacao_hash = null,
    codigo_expira_em = null,
    tentativas_ativacao = 0,
    ativado_em = coalesce(public.canais_operario.ativado_em, now()),
    criado_por = auth.uid(),
    atualizado_em = now()
  returning id into v_canal;

  insert into public.sessoes_operario(canal_id,estado,dados)
  values(v_canal,'menu','{}'::jsonb)
  on conflict (canal_id) do update set estado='menu',dados='{}'::jsonb,atualizado_em=now();

  insert into public.whatsapp_outbox(canal_id,telefone_e164,corpo)
  values(v_canal,v_telefone,format(
    'Ola, %s! Este e o canal da obra para receber tarefas e registrar o andamento. Responda *1* para ver suas tarefas.',
    c.nome
  ));

  return query select v_canal,null::text,v_telefone,null::timestamptz;
end $$;

-- O envio acontece somente quando o gestor clicar em Enviar pelo WhatsApp.
drop trigger if exists enfileirar_tarefa_whatsapp on public.tarefas;

create function public.enviar_tarefa_whatsapp(p_tarefa integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.tarefas; v_total integer;
begin
  select ta.* into t
  from public.tarefas ta
  join public.obras o on o.id = ta.obra_id
  where ta.id = p_tarefa and o.dono_id = auth.uid() and o.ativo;
  if not found then raise exception 'Tarefa nao encontrada.'; end if;

  with destinatarios as (
    select distinct c.id canal_id, c.telefone_e164
    from public.canais_operario c
    where c.obra_id = t.obra_id and c.tipo = 'whatsapp' and c.status = 'ativo'
      and (
        c.colaborador_id = t.colaborador_id
        or exists (
          select 1 from public.equipe_colaboradores ec
          where ec.equipe_id = t.equipe_id
            and ec.colaborador_id = c.colaborador_id
            and ec.ativo
            and t.data >= ec.data_inicio
            and (ec.data_fim is null or t.data <= ec.data_fim)
        )
      )
  ), inseridos as (
    insert into public.whatsapp_outbox(canal_id,telefone_e164,corpo,metadados)
    select d.canal_id,d.telefone_e164,
      format(
        'Nova tarefa #%s\nData: %s\nServico: %s\nFrente: %s\nMeta: %s %s\n\nResponda *1* para abrir suas tarefas.',
        t.id,to_char(t.data,'DD/MM/YYYY'),s.nome,f.nome,t.quantidade_meta,t.unidade
      ),
      jsonb_build_object('tarefa_id',t.id,'tipo','atribuicao')
    from destinatarios d
    join public.servicos s on s.id = t.servico_id
    join public.frentes f on f.id = t.frente_id
    returning 1
  ) select count(*)::integer into v_total from inseridos;

  if v_total = 0 then
    raise exception 'Nenhum operario desta tarefa esta ativo no WhatsApp.';
  end if;
  return v_total;
end $$;

revoke all on function public.enviar_tarefa_whatsapp(integer) from public, anon;
grant execute on function public.enviar_tarefa_whatsapp(integer) to authenticated;

create or replace function public.obter_sessao_whatsapp(p_canal bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'canal_id',c.id,'obra_id',c.obra_id,'colaborador_id',c.colaborador_id,
    'status',c.status,'tarefa_ativa_id',s.tarefa_ativa_id,
    'estado',coalesce(s.estado,'menu'),'dados',coalesce(s.dados,'{}'::jsonb)
  )
  from public.canais_operario c
  left join public.sessoes_operario s on s.canal_id = c.id
  where c.id = p_canal and c.tipo = 'whatsapp';
$$;

revoke all on function public.obter_sessao_whatsapp(bigint) from public,anon,authenticated;
grant execute on function public.obter_sessao_whatsapp(bigint) to service_role;

create function public.resumo_fila_whatsapp() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if not exists (select 1 from public.obras o where o.dono_id = auth.uid()) then
    raise exception 'Voce nao possui acesso a nenhuma obra.';
  end if;
  select jsonb_build_object(
    'pendentes',count(*) filter (where w.status in ('pendente','processando')),
    'enviadas',count(*) filter (where w.status = 'enviado'),
    'erros',count(*) filter (where w.status = 'erro'),
    'ultimo_erro',(
      select w2.ultimo_erro
      from public.whatsapp_outbox w2
      join public.canais_operario c2 on c2.id = w2.canal_id
      join public.obras o2 on o2.id = c2.obra_id
      where o2.dono_id = auth.uid() and w2.status = 'erro'
      order by w2.id desc limit 1
    )
  ) into resultado
  from public.whatsapp_outbox w
  join public.canais_operario c on c.id = w.canal_id
  join public.obras o on o.id = c.obra_id
  where o.dono_id = auth.uid();
  return resultado;
end $$;

revoke all on function public.resumo_fila_whatsapp() from public,anon;
grant execute on function public.resumo_fila_whatsapp() to authenticated;

grant select,update on public.whatsapp_integracao to service_role;
