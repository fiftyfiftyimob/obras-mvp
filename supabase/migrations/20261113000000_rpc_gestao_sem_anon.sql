do $$
declare v record;
begin
  for v in
    select p.oid::regprocedure as assinatura
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname = any(array[
        'alterar_proposta_bim','aprovar_pacote_bim','comparar_revisoes_bim',
        'criar_pacote_bim','criar_pedido_compra','criar_proposta_bim',
        'decidir_solicitacao_material','definir_capacidade_pacote_bim',
        'descartar_rascunho_pacote_bim','escolher_oferta_material',
        'estornar_recebimento_compra','publicar_proposta_bim',
        'registrar_operacao_estoque','registrar_recebimento_compra',
        'registrar_replanejamento_bim'
      ])
  loop
    execute pg_catalog.format('revoke all on function %s from anon',v.assinatura);
  end loop;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname = any(array[
        'alterar_proposta_bim','aprovar_pacote_bim','comparar_revisoes_bim',
        'criar_pacote_bim','criar_pedido_compra','criar_proposta_bim',
        'decidir_solicitacao_material','definir_capacidade_pacote_bim',
        'descartar_rascunho_pacote_bim','escolher_oferta_material',
        'estornar_recebimento_compra','publicar_proposta_bim',
        'registrar_operacao_estoque','registrar_recebimento_compra',
        'registrar_replanejamento_bim'
      ])
      and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  ) then raise exception 'Rotina de gestão ainda acessível à conta anônima'; end if;
end;
$$;
