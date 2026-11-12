alter table public.materiais
  add constraint materiais_embalagem_finita check (quantidade_por_embalagem::text not in ('NaN','Infinity','-Infinity'));
alter table public.solicitacoes_materiais
  add constraint solicitacoes_quantidade_finita check (
    quantidade::text not in ('NaN','Infinity','-Infinity')
    and quantidade_reservada::text not in ('NaN','Infinity','-Infinity')
    and quantidade_entregue::text not in ('NaN','Infinity','-Infinity')
  );
alter table public.estoque_saldos
  add constraint estoque_saldos_finitos check (
    fisico::text not in ('NaN','Infinity','-Infinity')
    and reservado::text not in ('NaN','Infinity','-Infinity')
  );
alter table public.estoque_operacoes
  add constraint estoque_operacoes_quantidade_finita check (quantidade::text not in ('NaN','Infinity','-Infinity'));
alter table public.estoque_movimentos
  add constraint estoque_movimentos_finitos check (
    delta_fisico::text not in ('NaN','Infinity','-Infinity')
    and delta_reservado::text not in ('NaN','Infinity','-Infinity')
    and delta_solicitacao_reservada::text not in ('NaN','Infinity','-Infinity')
    and delta_solicitacao_entregue::text not in ('NaN','Infinity','-Infinity')
  );
