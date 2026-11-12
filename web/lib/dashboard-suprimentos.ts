export type SupplyData = {
  materiais: { id: number; nome: string; unidade_estoque: string; unidade_compra: string; quantidade_por_embalagem: number }[];
  almoxarifados: { id: number; nome: string }[];
  estoque_saldos: { material_id: number; almoxarifado_id: number; fisico: number; reservado: number }[];
  solicitacoes_materiais: { id: number; material_id: number; almoxarifado_id: number; quantidade: number; quantidade_entregue: number; necessario_em: string; estado: string }[];
  fornecedores_materiais: { id: number; nome: string }[];
  cotacoes_materiais: { id: number; material_id: number; estado: string; oferta_escolhida_id: number | null }[];
  ofertas_materiais: { id: number; cotacao_id: number; custo_entregue: number }[];
  pedidos_compra: { id: number; material_id: number; almoxarifado_id: number; fornecedor_id: number; quantidade: number; quantidade_recebida: number; custo_contratado: number; entrega_prevista: string; estado: string }[];
  recebimentos_compra: { id: string; pedido_id: number; quantidade: number; documento: string | null; recebido_em: string; estornado_em: string | null }[];
};
export type SupplyRisk = {
  material_id: number; almoxarifado_id: number; material: string; almoxarifado: string;
  unidade: string; fisico: number; reservado: number; demanda_aberta: number;
  pedidos_pendentes: number; primeira_falta: string; falta_maxima: number;
};
export type SupplyModel = {
  riscos: SupplyRisk[];
  indicadores: {
    contratados: number; recebido_estimado: number; a_receber_estimado: number;
    pedidos_atrasados: number; solicitacoes_aprovadas_abertas: number; solicitacoes_pendentes: number;
    cotacoes_abertas: number; combinacoes_em_risco: number;
  };
  fornecedores: { fornecedor_id: number; nome: string; contratado: number; pedidos: number }[];
  diferenca_cotacoes: number;
};
const value = (v: unknown) => Number(v) || 0;
export function makeSupplyDashboard(data: SupplyData, today: string): SupplyModel {
  const materialById = new Map(data.materiais.map((m) => [m.id, m]));
  const warehouseById = new Map(data.almoxarifados.map((a) => [a.id, a]));
  const supplierById = new Map(data.fornecedores_materiais.map((f) => [f.id, f]));
  const groups = new Map<string, { material_id: number; almoxarifado_id: number; fisico: number; reservado: number; demanda: number; entrada: number; events: { date: string; amount: number; kind: "entrada" | "demanda" }[] }>();
  function group(material_id: number, almoxarifado_id: number) {
    const key = material_id + ":" + almoxarifado_id;
    let row = groups.get(key);
    if (!row) {
      row = { material_id, almoxarifado_id, fisico: 0, reservado: 0, demanda: 0, entrada: 0, events: [] };
      groups.set(key, row);
    }
    return row;
  }
  for (const s of data.estoque_saldos) {
    const g = group(s.material_id, s.almoxarifado_id);
    g.fisico += value(s.fisico); g.reservado += value(s.reservado);
  }
  for (const s of data.solicitacoes_materiais) {
    if (s.estado !== "aprovada") continue;
    const remaining = Math.max(0, value(s.quantidade) - value(s.quantidade_entregue));
    if (!remaining) continue;
    const g = group(s.material_id, s.almoxarifado_id);
    g.demanda += remaining;
    g.events.push({ date: s.necessario_em < today ? today : s.necessario_em, amount: remaining, kind: "demanda" });
  }
  for (const p of data.pedidos_compra) {
    if (p.estado === "cancelado" || p.estado === "concluido") continue;
    const remaining = Math.max(0, value(p.quantidade) - value(p.quantidade_recebida));
    if (!remaining || p.entrega_prevista < today) continue;
    const g = group(p.material_id, p.almoxarifado_id);
    g.entrada += remaining;
    g.events.push({ date: p.entrega_prevista, amount: remaining, kind: "entrada" });
  }
  const riscos: SupplyRisk[] = [];
  for (const g of Array.from(groups.values())) {
    let saldo = g.fisico;
    let shortage = 0;
    let first = "";
    g.events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "entrada" ? -1 : 1));
    for (const e of g.events) {
      saldo += e.kind === "entrada" ? e.amount : -e.amount;
      if (e.kind === "demanda" && saldo < 0) {
        if (!first) first = e.date;
        shortage = Math.max(shortage, -saldo);
      }
    }
    if (!first) continue;
    riscos.push({
      material_id: g.material_id, almoxarifado_id: g.almoxarifado_id,
      material: materialById.get(g.material_id)?.nome || "#" + g.material_id,
      almoxarifado: warehouseById.get(g.almoxarifado_id)?.nome || "#" + g.almoxarifado_id,
      unidade: materialById.get(g.material_id)?.unidade_estoque || "",
      fisico: g.fisico, reservado: g.reservado, demanda_aberta: g.demanda,
      pedidos_pendentes: g.entrada, primeira_falta: first, falta_maxima: shortage,
    });
  }
  riscos.sort((a, b) => a.primeira_falta.localeCompare(b.primeira_falta) || b.falta_maxima-a.falta_maxima);
  const validOrders = data.pedidos_compra.filter((p) => p.estado !== "cancelado");
  const contratados = validOrders.reduce((n, p) => n + value(p.custo_contratado), 0);
  const recebido_estimado = validOrders.reduce((n, p) =>
    n + value(p.custo_contratado) * Math.min(1, value(p.quantidade_recebida) / value(p.quantidade)), 0);
  const supplierTotals = new Map<number, { fornecedor_id: number; nome: string; contratado: number; pedidos: number }>();
  for (const p of validOrders) {
    const current = supplierTotals.get(p.fornecedor_id) || { fornecedor_id: p.fornecedor_id, nome: supplierById.get(p.fornecedor_id)?.nome || "#" + p.fornecedor_id, contratado: 0, pedidos: 0 };
    current.contratado += value(p.custo_contratado); current.pedidos++;
    supplierTotals.set(p.fornecedor_id, current);
  }
  let diferenca_cotacoes = 0;
  for (const c of data.cotacoes_materiais) {
    if (!c.oferta_escolhida_id) continue;
    const options = data.ofertas_materiais.filter((o) => o.cotacao_id === c.id);
    const chosen = options.find((o) => o.id === c.oferta_escolhida_id);
    if (chosen && options.length) diferenca_cotacoes += Math.max(0, value(chosen.custo_entregue) - Math.min(...options.map((o) => value(o.custo_entregue))));
  }
  return {
    riscos,
    indicadores: {
      contratados, recebido_estimado, a_receber_estimado: Math.max(0, contratados - recebido_estimado),
      pedidos_atrasados: validOrders.filter((p) => p.estado !== "concluido" && p.entrega_prevista < today).length,
      solicitacoes_aprovadas_abertas: data.solicitacoes_materiais.filter((s) => s.estado === "aprovada" && value(s.quantidade) > value(s.quantidade_entregue)).length,
      solicitacoes_pendentes: data.solicitacoes_materiais.filter((s) => s.estado === "pendente").length,
      cotacoes_abertas: data.cotacoes_materiais.filter((c) => c.estado === "aberta").length,
      combinacoes_em_risco: riscos.length,
    },
    fornecedores: Array.from(supplierTotals.values()).sort((a, b) => b.contratado-a.contratado),
    diferenca_cotacoes,
  };
}
export async function exportSupplyDashboard(data: SupplyData, model: SupplyModel, obraId: number, obraNome: string, today: string) {
  const x = await import("xlsx");
  const wb = x.utils.book_new();
  function add(name: string, rows: object[]) {
    x.utils.book_append_sheet(wb, x.utils.json_to_sheet(rows.length ? rows : [{ sem_registros: true }]));
  }
  add("Resumo_suprimentos", [{ obra_id: obraId, obra: obraNome, data_referencia: today, ...model.indicadores, diferenca_vs_menor_cotacao: model.diferenca_cotacoes }]);
  add("Projecao_faltas", model.riscos);
  add("Fornecedores_custo", model.fornecedores);
  add("Materiais", data.materiais);
  add("Almoxarifados", data.almoxarifados);
  add("Saldos_estoque", data.estoque_saldos);
  add("Solicitacoes", data.solicitacoes_materiais);
  add("Fornecedores", data.fornecedores_materiais);
  add("Cotacoes", data.cotacoes_materiais);
  add("Ofertas", data.ofertas_materiais);
  add("Pedidos", data.pedidos_compra);
  add("Recebimentos", data.recebimentos_compra);
  add("Metodologia", [
    { indicador: "Falta prevista", regra: "Saldo físico atual + entregas futuras ainda não recebidas - demanda aprovada ainda não entregue, por material e almoxarifado, em ordem de data. Pedido atrasado não é presumido disponível." },
    { indicador: "Recebido estimado", regra: "Custo contratado multiplicado pela fração física recebida. Não representa valor da nota fiscal." },
    { indicador: "Diferença vs menor cotação", regra: "Diferença positiva entre oferta escolhida e menor preço registrado na mesma cotação, sem ajustar prazo ou validade." },
    { indicador: "Relacionamentos", regra: "Use IDs de material, almoxarifado, fornecedor, cotação e pedido para ligar as abas no Power BI." },
  ]);
  x.writeFile(wb, "obras-suprimentos-" + obraId + "-" + today + ".xlsx");
}
