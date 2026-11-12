-- Atomic, idempotent CSV catalogue import for each work.
create function public.importar_catalogo_compras(
  p_obra_id integer, p_tipo text, p_linhas jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_nome text;
  v_unidade text;
  v_compra text;
  v_fator numeric;
  v_documento text;
  v_inseridos integer := 0;
  v_ignorados integer := 0;
begin
  if auth.uid() is null
     or not coalesce(private.papel_obra(p_obra_id) in ('administrador','engenheiro','supervisor'), false) then
    raise exception 'Acesso negado';
  end if;
  if p_tipo not in ('materiais','fornecedores')
     or jsonb_typeof(p_linhas) is distinct from 'array'
     or jsonb_array_length(p_linhas) < 1 or jsonb_array_length(p_linhas) > 500 then
    raise exception 'Envie de 1 a 500 linhas de materiais ou fornecedores';
  end if;
  perform 1 from public.obras where id = p_obra_id and ativo for update;
  if not found then raise exception 'Obra inativa ou não encontrada'; end if;
  for v_item in select value from jsonb_array_elements(p_linhas) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Cada linha deve conter colunas identificadas'; end if;
    v_nome := trim(coalesce(v_item->>'nome',''));
    if length(v_nome) < 2 or length(v_nome) > (case when p_tipo = 'materiais' then 120 else 160 end) then
      raise exception 'Nome inválido em uma das linhas'; end if;
    if p_tipo = 'materiais' then
      v_unidade := trim(coalesce(v_item->>'unidade_estoque',''));
      v_compra := trim(coalesce(v_item->>'unidade_compra',''));
      if v_unidade not in ('un','m','m²','m³','kg','l')
        or length(v_compra) not between 1 and 30
        or length(coalesce(v_item->>'especificacao','')) > 1000 then
        raise exception 'Unidade ou especificação inválida para %', v_nome;
      end if;
      begin
        v_fator := (v_item->>'quantidade_por_embalagem')::numeric;
      exception when invalid_text_representation then
        raise exception 'Quantidade por embalagem inválida para %', v_nome;
      end;
      if v_fator is null or v_fator <= 0 or v_fator::text = 'NaN' then
        raise exception 'Quantidade por embalagem inválida para %', v_nome; end if;
      if exists (select 1 from public.materiais
          where obra_id=p_obra_id and lower(trim(nome))=lower(v_nome)) then
        v_ignorados := v_ignorados + 1;
      else
        insert into public.materiais
          (obra_id,nome,especificacao,unidade_estoque,unidade_compra,quantidade_por_embalagem)
        values (p_obra_id,v_nome,trim(coalesce(v_item->>'especificacao','')),
          v_unidade,v_compra,v_fator);
        v_inseridos := v_inseridos + 1;
      end if;
    else
      v_documento := nullif(trim(coalesce(v_item->>'documento','')),'');
      if length(coalesce(v_documento,'')) > 30
         or length(coalesce(v_item->>'contato','')) > 160
         or length(coalesce(v_item->>'telefone','')) > 30
         or length(coalesce(v_item->>'email','')) > 160 then
        raise exception 'Contato inválido para %', v_nome;
      end if;
      if exists (select 1 from public.fornecedores_materiais
          where obra_id=p_obra_id and
            ((v_documento is not null and documento=v_documento)
              or lower(trim(nome))=lower(v_nome))) then
        v_ignorados := v_ignorados + 1;
      else
        insert into public.fornecedores_materiais
          (obra_id,nome,documento,contato,telefone,email,criado_por)
        values (p_obra_id,v_nome,v_documento,
          nullif(trim(coalesce(v_item->>'contato','')),''),
          nullif(trim(coalesce(v_item->>'telefone','')),''),
          nullif(trim(coalesce(v_item->>'email','')),''),
          auth.uid());
        v_inseridos := v_inseridos + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('inseridos',v_inseridos,'ignorados',v_ignorados);
end;
$$;
revoke all on function public.importar_catalogo_compras(integer,text,jsonb) from public, anon;
grant execute on function public.importar_catalogo_compras(integer,text,jsonb) to authenticated;
