create view public.bim_quantidades_alocadas
with (security_invoker = true) as
select f.quantidade_id,p.obra_id,sum(f.valor) as valor_alocado
from public.bim_pacote_fontes f
join public.bim_pacotes p on p.id=f.pacote_id
where p.cancelado_em is null
group by f.quantidade_id,p.obra_id;
grant select on public.bim_quantidades_alocadas to authenticated;
