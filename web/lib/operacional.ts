import { supabase } from "./supabase";
import type { Row, Field } from "../components/editor";
export const labels: Record<string, string> = {
  nao_iniciada: "Não iniciada",
  em_execucao: "Em execução",
  pausada: "Pausada",
  bloqueada: "Bloqueada",
  concluida: "Concluída",
  inicio: "Início",
  pausa: "Pausa",
  retomada: "Retomada",
  conclusao: "Conclusão",
  impedimento: "Impedimento",
  falta_material: "Falta de material",
  falta_ferramenta: "Falta de ferramenta",
  frente_ocupada: "Frente ocupada",
  projeto_pendente: "Projeto pendente",
  chuva: "Chuva",
  espera_equipe: "Espera de equipe",
  seguranca: "Segurança",
  outro: "Outro",
};
export type Data = Record<string, Row[]>;
export const names: Record<string, string> = {
  frentes: "Frentes de serviço",
  colaboradores: "Colaboradores",
  equipes: "Equipes",
  servicos: "Serviços",
  compromissos_semanais: "Planejamento semanal",
  tarefas: "Tarefas diárias",
  rdos: "Diário de obra",
  equipe_colaboradores: "Composição das equipes",
  rdos_itens: "Itens do diário",
};
export function options(data: Data, table: string) {
  return (data[table] || [])
    .filter((r) => r.ativo !== false)
    .map((r) => ({
      value: r.id,
      label:
        r.nome ||
        `${r.semana_inicio} · ${lookup(data, "servicos", r.servico_id)} · ${lookup(data, "frentes", r.frente_id)}`,
    }));
}
export function lookup(data: Data, t: string, id: number | null) {
  return data[t]?.find((r) => r.id === id)?.nome || "—";
}
export function date(value: string) {
  return value
    ? new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR")
    : "—";
}
export function fieldsFor(table: string, data: Data): Field[] {
  const text = (name: string, label: string, required = false): Field => ({
    name,
    label,
    required,
  });
  const rel = (
    name: string,
    label: string,
    t: string,
    required = false,
  ): Field => ({ name, label, options: options(data, t), required });
  const qty: Field = {
    name: "quantidade_meta",
    label: "Quantidade meta",
    type: "number",
    min: "0.01",
    step: "any",
    required: true,
  };
  const obs: Field = {
    name: "observacao",
    label: "Observação",
    type: "textarea",
  };
  switch (table) {
    case "frentes":
      return [
        text("nome", "Nome da frente", true),
        {
          name: "nivel",
          label: "Ordem / nível",
          type: "number",
          min: "0",
          required: true,
        },
        { name: "descricao", label: "Descrição", type: "textarea" },
      ];
    case "colaboradores":
      return [
        text("nome", "Nome completo", true),
        text("funcao", "Função", true),
        { name: "telefone", label: "Telefone", type: "tel" },
        text("cpf", "CPF (opcional)"),
        rel("equipe_principal_id", "Equipe principal", "equipes"),
      ];
    case "equipes":
      return [
        text("nome", "Nome da equipe", true),
        { name: "descricao", label: "Descrição", type: "textarea" },
      ];
    case "equipe_colaboradores":
      return [
        rel("equipe_id", "Equipe", "equipes", true),
        rel("colaborador_id", "Colaborador", "colaboradores", true),
        { name: "data_inicio", label: "Início", type: "date", required: true },
      ];
    case "servicos":
      return [
        text("nome", "Nome do serviço", true),
        {
          name: "unidade",
          label: "Unidade",
          required: true,
          options: ["m²", "m³", "m", "un", "kg", "h", "%"].map((x) => ({
            value: x,
            label: x,
          })),
        },
        {
          name: "produtividade_referencia",
          label: "Produtividade de referência (unidade/hora)",
          type: "number",
          min: "0",
          step: "any",
        },
        { name: "descricao", label: "Descrição", type: "textarea" },
      ];
    case "compromissos_semanais":
      return [
        {
          name: "semana_inicio",
          label: "Início da semana",
          type: "date",
          required: true,
        },
        {
          name: "semana_fim",
          label: "Fim da semana",
          type: "date",
          required: true,
        },
        rel("servico_id", "Serviço", "servicos", true),
        rel("frente_id", "Frente", "frentes", true),
        rel("equipe_id", "Equipe", "equipes", true),
        qty,
        text("dias_previstos", "Dias previstos"),
        obs,
      ];
    case "tarefas":
      return [
        { name: "data", label: "Data", type: "date", required: true },
        text("turno", "Turno"),
        rel(
          "compromisso_semanal_id",
          "Compromisso semanal (opcional)",
          "compromissos_semanais",
        ),
        rel("servico_id", "Serviço", "servicos", true),
        rel("frente_id", "Frente", "frentes", true),
        rel("equipe_id", "Equipe", "equipes"),
        rel("colaborador_id", "Colaborador", "colaboradores"),
        qty,
        {
          name: "horas_previstas",
          label: "Horas previstas",
          type: "number",
          min: "0",
          step: "0.25",
        },
        obs,
      ];
    case "rdos":
      return [
        { name: "data", label: "Data do diário", type: "date", required: true },
        {
          name: "clima",
          label: "Clima",
          options: ["Ensolarado", "Nublado", "Chuvoso", "Instável"].map(
            (x) => ({ value: x, label: x }),
          ),
        },
        {
          name: "observacao_geral",
          label: "Observação geral",
          type: "textarea",
        },
      ];
    case "rdos_itens":
      return [
        rel("frente_id", "Frente", "frentes", true),
        rel("servico_id", "Serviço", "servicos", true),
        rel("equipe_id", "Equipe", "equipes"),
        {
          name: "quantidade_realizada",
          label: "Quantidade executada",
          type: "number",
          min: "0",
          step: "any",
          required: true,
        },
        obs,
      ];
    default:
      return [];
  }
}
export async function allRows(query: () => any): Promise<Row[]> {
  let rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function loadData(obra: number): Promise<Data> {
  const tables = [
    "frentes",
    "colaboradores",
    "equipes",
    "compromissos_semanais",
    "tarefas",
    "rdos",
  ];
  const entries = await Promise.all(
    tables.map(async (t) => [
      t,
      await allRows(() =>
        supabase.from(t).select("*").eq("obra_id", obra).order("id"),
      ),
    ]),
  );
  const data = Object.fromEntries(entries) as Data;
  const extra = await Promise.all([
    allRows(() =>
      supabase.from("servicos").select("*").order("nome").order("id"),
    ),
    allRows(() =>
      supabase
        .from("equipe_colaboradores")
        .select("*,equipes!inner(obra_id)")
        .eq("equipes.obra_id", obra)
        .order("id"),
    ),
    allRows(() =>
      supabase
        .from("evolucoes_tarefa")
        .select("*,tarefas!inner(obra_id)")
        .eq("tarefas.obra_id", obra)
        .order("timestamp")
        .order("id"),
    ),
    allRows(() =>
      supabase
        .from("rdos_itens")
        .select("*,rdos!inner(obra_id)")
        .eq("rdos.obra_id", obra)
        .order("id"),
    ),
  ]);
  [
    "servicos",
    "equipe_colaboradores",
    "evolucoes_tarefa",
    "rdos_itens",
  ].forEach((t, i) => (data[t] = extra[i]));
  return data;
}
export function progress(data: Data, task: Row) {
  return (data.evolucoes_tarefa || [])
    .filter((e) => e.tarefa_id === task.id)
    .reduce((n, e) => n + Number(e.quantidade_realizada || 0), 0);
}
export function hours(data: Data, task: Row) {
  let start: number | null = null;
  let ms = 0;
  for (const e of data.evolucoes_tarefa.filter(
    (e) => e.tarefa_id === task.id,
  )) {
    const at = Date.parse(
      e.timestamp.endsWith("Z") || /[+-]\d\d:\d\d$/.test(e.timestamp)
        ? e.timestamp
        : e.timestamp + "Z",
    );
    if (e.tipo === "inicio" || e.tipo === "retomada") start = at;
    else if (start !== null) {
      ms += at - start;
      start = null;
    }
  }
  if (start !== null) ms += Date.now() - start;
  return Math.max(0, ms / 3600000);
}
