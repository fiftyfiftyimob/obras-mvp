import type { Data } from "./operacional";
import { METHODOLOGY, type DashboardFilter, type DashboardModel } from "./dashboard-obra";

export async function exportDashboard(m: DashboardModel, data: Data, f: DashboardFilter, obraId: number, obraNome: string) {
  const x = await import("xlsx");
  const wb = x.utils.book_new();
  function add(name: string, rows: object[]) {
    if (!rows.length) return;
    x.utils.book_append_sheet(wb, x.utils.json_to_sheet(rows));
  }
  const used = [...m.taskRows, ...m.planRows, ...m.itens];
  const catalog = (table: string, key: "servico_id" | "frente_id" | "equipe_id") => {
    const ids = new Set(used.map(r => String(r[key])));
    if (table === "equipes") for (const row of m.equipes) ids.add(row.id);
    return (data[table] || []).filter(r => ids.has(String(r.id))).map(r => ({
      id: Number(r.id), nome: String(r.nome),
      ...(table === "servicos" ? { unidade: r.unidade ?? null, produtividade_referencia: r.produtividade_referencia == null ? null : Number(r.produtividade_referencia) } : {}),
      ...(table === "frentes" ? { ordem: r.nivel ?? null } : {}),
    }));
  };
  add("Resumo", [{ obra_id: obraId, obra: obraNome, data_referencia: f.ate,
    origem: f.origem, filtro_frente_id: f.frente || null, filtro_servico_id: f.servico || null, filtro_equipe_id: f.equipe || null,
    executado_pct: m.percentual, previsto_pct: m.previsto, ...m.metadados }]);
  add("Metodologia", [
    { item: "Avanço físico estimado", regra: METHODOLOGY },
    { item: "Escopo", regra: "O filtro de data limita a execução. O planejamento cadastrado, inclusive futuro, compõe o denominador e a curva prevista." },
    { item: "Percentuais", regra: "Os valores das colunas com sufixo _pct e percentual estão na escala de 0 a 100." },
    { item: "Pessoas", regra: "Somente contagens de pessoas e equipes. A contagem na obra é independente dos filtros de frente e serviço." },
    { item: "Relacionamentos", regra: "Relacione as planilhas de fatos às dimensões Dim_Frentes, Dim_Servicos e Dim_Equipes pelos respectivos IDs. Eventos e itens referenciam Tarefas; itens também referenciam Diarios." },
    { item: "Produção", regra: "Os itens do diário não são somados aos apontamentos das tarefas. O campo executado nas tabelas pode exceder a meta." },
  ]);
  add("Evolucao_mensal", m.series);
  add("Avanco_frentes", m.frentes);
  add("Avanco_servicos", m.servicos);
  add("Avanco_etapa_servico", m.etapas);
  add("Avanco_equipes", m.equipes);
  add("Status_tarefas", m.status);
  add("Impedimentos", m.impedimentos);
  add("Clima", m.clima);
  add("Dim_Frentes", catalog("frentes", "frente_id"));
  add("Dim_Servicos", catalog("servicos", "servico_id"));
  add("Dim_Equipes", catalog("equipes", "equipe_id"));
  add("Metas_base", m.metas);
  add("Planejamento", m.planRows);
  add("Tarefas", m.taskRows);
  add("Apontamentos", m.eventos);
  add("Diarios", m.diarios);
  add("Itens_diario", m.itens);
  add("Evidencias", m.evidencias);
  x.writeFile(wb, "obras-dashboard-" + obraId + "-" + f.ate + ".xlsx", { compression: true });
}
