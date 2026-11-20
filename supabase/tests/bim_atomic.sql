begin;
set local role service_role;
set local request.jwt.claim.role = '';
do $$
declare
  v_id uuid;
  v_tentativa integer;
  v_antes integer;
  v_depois integer;
begin
  if current_user <> 'service_role' then raise exception 'Papel de servidor ausente'; end if;
  if has_function_privilege('authenticated',
       'public.bim_finalizar_importacao(uuid,integer,text,integer,integer)', 'EXECUTE') then
    raise exception 'Usuario autenticado nao pode finalizar IFC';
  end if;
  select id into v_antes from public.obras order by id limit 1;
  if v_antes is null then raise exception 'Nenhuma obra disponivel para teste'; end if;
  v_id := gen_random_uuid();
  v_tentativa := 1;
  insert into public.bim_importacoes (
    id, obra_id, revisao, nome_arquivo, caminho_arquivo,
    tamanho_bytes, estado, tentativas, lease_ate, criado_por
  ) values (
    v_id, v_antes, 'teste-atomico-' || v_id::text, 'teste.ifc',
    v_antes::text || '/' || v_id::text || '/modelo.ifc',
    1, 'processando', v_tentativa, now() + interval '10 minutes', gen_random_uuid()
  );
  v_antes := 0;
  begin
    perform public.bim_finalizar_importacao(v_id, v_tentativa, 'IFC4', 1, 0);
    raise exception 'A finalizacao sem lote deveria falhar';
  exception when others then
    if sqlerrm <> 'Lotes IFC incompletos' then raise; end if;
  end;
  select count(*) into v_depois from public.bim_elementos where importacao_id = v_id;
  if v_depois <> v_antes then raise exception 'A falha alterou elementos'; end if;
  insert into public.bim_extracao_lotes(importacao_id,tentativa,lote,elementos)
  values (v_id, v_tentativa, 0,
    '[{"global_id":"TESTE0000000000000001","classe":"IfcWall","nome":"Teste",
       "local":"Térreo","local_global_id":null,"pendencias":[],
       "quantidades":[{"conjunto":"Qto","nome":"Area","tipo":"IfcQuantityArea",
         "valor":1.5,"unidade":"m²","pendencia":null}]}]'::jsonb);
  begin
    perform public.bim_finalizar_importacao(v_id, v_tentativa, 'IFC4', 1, 1);
    raise exception 'Pendencias divergentes deveriam falhar';
  exception when others then
    if sqlerrm <> 'Total de pendencias IFC divergente' then raise; end if;
  end;
  select count(*) into v_depois from public.bim_elementos where importacao_id = v_id;
  if v_depois <> v_antes then raise exception 'A segunda falha alterou elementos'; end if;
  perform public.bim_finalizar_importacao(v_id, v_tentativa, 'IFC4', 1, 0);
  if not exists (select 1 from public.bim_importacoes
      where id = v_id and estado = 'concluida' and total_elementos = 1) then
    raise exception 'Estado final incorreto';
  end if;
  if (select count(*) from public.bim_elementos where importacao_id = v_id) <> 1
     or (select count(*) from public.bim_quantidades where importacao_id = v_id) <> 1 then
    raise exception 'Elementos ou quantidades finais incorretos';
  end if;
  if exists (select 1 from public.bim_extracao_lotes where importacao_id = v_id) then
    raise exception 'Lotes temporarios nao foram eliminados';
  end if;
  raise notice 'Teste atomico IFC passou; todas as alteracoes serao revertidas';
end;
$$;
rollback;