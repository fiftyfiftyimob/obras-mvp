alter table public.recebimentos_compra
  alter constraint recebimentos_compra_estorno_id_fkey deferrable initially deferred;
