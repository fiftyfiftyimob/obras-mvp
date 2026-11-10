-- Perfis de acesso por obra para administradores, engenheiros, supervisores,
-- estagiários, encarregados e clientes.
alter table private.obra_acessos
  drop constraint if exists obra_acessos_papel_check;
alter table private.obra_acessos
  add constraint obra_acessos_papel_check
  check (papel in ('administrador','engenheiro','supervisor','estagiario','encarregado','cliente'));

create or replace function private.papel_obra(p_obra integer)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when exists (
      select 1 from public.obras o
      where o.id = p_obra and o.dono_id = auth.uid()
    ) then 'administrador'
    else (
      select a.papel
      from private.obra_acessos a
      join public.obras o on o.id = a.obra_id
      where a.obra_id = p_obra
        and a.usuario_id = auth.uid()
        and o.ativo
    )
  end;
$$;

revoke all on function private.papel_obra(integer) from public, anon;
grant execute on function private.papel_obra(integer) to authenticated;

create or replace function private.possui_obra(obra integer)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.papel_obra(obra) in
    ('administrador','engenheiro','supervisor','estagiario'), false);
$$;

revoke all on function private.possui_obra(integer) from public, anon;
grant execute on function private.possui_obra(integer) to authenticated;

-- Gestores operacionais usam as telas completas; encarregados e clientes continuam
-- limitados aos RPCs compartilhados, sem acesso direto aos dados pessoais.
drop policy if exists obras_select_gestores on public.obras;
create policy obras_select_gestores on public.obras
  for select to authenticated
  using (private.papel_obra(id) in ('administrador','engenheiro','supervisor','estagiario'));

drop policy if exists obras_update_gestores on public.obras;
create policy obras_update_gestores on public.obras
  for update to authenticated
  using (private.papel_obra(id) in ('administrador','engenheiro'))
  with check (private.papel_obra(id) in ('administrador','engenheiro'));

-- Engenheiro pode atualizar dados da obra; apenas o administrador/dono pode
-- conceder e revogar acessos (as funções abaixo continuam sendo o último controle).
create or replace function public.listar_acessos_obra(p_obra integer)
returns table(usuario_id uuid, email text, papel text, criado_em timestamptz)
language plpgsql security definer set search_path to ''
as $$
begin
  if coalesce(private.papel_obra(p_obra),'') <> 'administrador' then
    raise exception 'Acesso negado.';
  end if;
  return query
    select a.usuario_id,a.email,a.papel,a.criado_em
    from private.obra_acessos a
    where a.obra_id=p_obra
    order by a.criado_em desc;
end $$;

create or replace function public.conceder_acesso_obra(p_obra integer,p_email text,p_papel text)
returns void language plpgsql security definer set search_path to ''
as $$
declare v_usuario uuid; v_email text;
begin
  if coalesce(private.papel_obra(p_obra),'') <> 'administrador' then
    raise exception 'Acesso negado.';
  end if;
  if p_papel is null
     or p_papel not in ('administrador','engenheiro','supervisor','estagiario','encarregado','cliente')
     or p_email is null or length(trim(p_email))=0 or length(trim(p_email))>320 then
    raise exception 'Informe um e-mail e perfil válidos.';
  end if;
  select u.id,lower(u.email) into v_usuario,v_email
  from auth.users u
  where lower(u.email)=lower(trim(p_email))
    and u.email_confirmed_at is not null;
  if v_usuario is null then
    raise exception 'Este e-mail ainda não possui conta confirmada no aplicativo.';
  end if;
  if v_usuario=auth.uid() then
    raise exception 'O gestor já possui acesso à obra.';
  end if;
  insert into private.obra_acessos(obra_id,usuario_id,email,papel)
  values(p_obra,v_usuario,v_email,p_papel)
  on conflict (obra_id,usuario_id) do update
    set email=excluded.email,papel=excluded.papel;
end $$;

create or replace function public.revogar_acesso_obra(p_obra integer,p_usuario uuid)
returns void language plpgsql security definer set search_path to ''
as $$
begin
  if coalesce(private.papel_obra(p_obra),'') <> 'administrador' then
    raise exception 'Acesso negado.';
  end if;
  if p_usuario=auth.uid() then
    raise exception 'O administrador atual não pode remover o próprio acesso.';
  end if;
  delete from private.obra_acessos a
  where a.obra_id=p_obra and a.usuario_id=p_usuario;
end $$;

-- Registros operacionais por gestores designados. A validação continua no banco,
-- inclusive quando uma chamada ignora os controles visuais do site.
create or replace function private.registrar_evolucao(
  p_tarefa integer,p_tipo text,p_quantidade numeric,p_motivo text,p_observacao text
) returns integer language plpgsql security definer set search_path=''
as $$
declare tarefa public.tarefas; novo_status text; evento integer;
begin
  select t.* into tarefa
  from public.tarefas t
  join public.obras o on o.id=t.obra_id
  where t.id=p_tarefa
    and o.ativo
    and private.papel_obra(t.obra_id) in ('administrador','engenheiro','supervisor','estagiario')
  for update of t;
  if not found then raise exception 'Tarefa não encontrada ou acesso negado.'; end if;
  if p_quantidade is null or p_quantidade<0 then raise exception 'Quantidade inválida.'; end if;
  if p_tipo='inicio' and tarefa.status='nao_iniciada' then novo_status:='em_execucao';
  elsif p_tipo='pausa' and tarefa.status='em_execucao' then novo_status:='pausada';
  elsif p_tipo='retomada' and tarefa.status in ('pausada','bloqueada','aguardando_validacao') then novo_status:='em_execucao';
  elsif p_tipo='conclusao' and tarefa.status in ('em_execucao','aguardando_validacao') then novo_status:='concluida';
  elsif p_tipo='impedimento' and tarefa.status in ('nao_iniciada','em_execucao','pausada') then novo_status:='bloqueada';
  elsif p_tipo='producao' and tarefa.status='em_execucao' then novo_status:=tarefa.status;
  else raise exception 'Esta ação não é permitida no estado atual da tarefa.'; end if;
  if p_tipo='impedimento' and (p_motivo is null or p_motivo not in
    ('falta_material','falta_ferramenta','frente_ocupada','projeto_pendente','chuva','espera_equipe','seguranca','outro')) then
    raise exception 'Informe o motivo do impedimento.';
  end if;
  if p_tipo in ('inicio','retomada') and p_quantidade<>0 then
    raise exception 'Registre produção ao pausar, concluir ou informar impedimento.';
  end if;
  if p_tipo='producao' and p_quantidade<=0 then
    raise exception 'Informe uma quantidade maior que zero.';
  end if;
  insert into public.evolucoes_tarefa(tarefa_id,autor_id,tipo,quantidade_realizada,motivo_impedimento,observacao)
  values(p_tarefa,auth.uid(),p_tipo,p_quantidade,
    case when p_tipo='impedimento' then p_motivo else null end,p_observacao)
  returning id into evento;
  update public.tarefas set status=novo_status,atualizado_em=now() where id=p_tarefa;
  return evento;
end $$;

-- Permissões compartilhadas por funções de administração de acesso.
revoke all on function public.listar_acessos_obra(integer) from public,anon;
revoke all on function public.conceder_acesso_obra(integer,text,text) from public,anon;
revoke all on function public.revogar_acesso_obra(integer,uuid) from public,anon;
grant execute on function public.listar_acessos_obra(integer),
  public.conceder_acesso_obra(integer,text,text),
  public.revogar_acesso_obra(integer,uuid) to authenticated;
