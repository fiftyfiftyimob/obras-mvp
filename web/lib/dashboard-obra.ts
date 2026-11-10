import type { Row } from "../components/editor";
import { formatUnit, isSimulationTask, isSimulationRdo, isSimulationCollaborator, type Data } from "./operacional";

export type DashboardFilter = { ate: string; origem: "todos" | "operacao" | "simulacao"; frente: string; servico: string; equipe: string };
const num = (v: unknown) => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
const iso = (v: unknown) => String(v || "").slice(0, 10);
const time = (v: unknown) => {
  const s = String(v || "");
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(s) ? s : s + "Z");
};
const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (n: number, d: number) => d > 0 ? 100 * n / d : null;
const unit = (r: Row) => formatUnit(r.unidade) || "—";
const marker = (r: Row) => r.simulacao === true || isSimulationTask(r);

type Scope = { row: Row; tasks: Row[]; meta: number; unidade: string; prazo: string; realizado: number };
function group<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!result.has(k)) result.set(k, []);
    result.get(k)!.push(row);
  }
  return result;
}
function index(rows: Row[] = []) {
  return new Map(rows.map(row => [String(row.id), row]));
}
function inPeriod(start: unknown, end: unknown, ate: string) {
  return !!start && iso(start) <= ate && (!end || iso(end) >= ate);
}

function taskState(task: Row, all: Row[], cutoff: number, snapshot: string, today: string) {
  let status = all.length ? "nao_iniciada" : snapshot >= today && iso(task.data) <= snapshot ? String(task.status || "nao_iniciada") : "nao_iniciada";
  let start: number | null = null;
  let elapsed = 0;
  let quantity = 0;
  for (const e of all) {
    const at = time(e.timestamp);
    if (!Number.isFinite(at) || at > cutoff) continue;
    quantity += num(e.quantidade_realizada);
    const next = ({ inicio: "em_execucao", retomada: "em_execucao", pausa: "pausada", impedimento: "bloqueada", solicitacao_conclusao: "aguardando_validacao", conclusao: "concluida" } as Record<string, string>)[e.tipo];
    if (!next) continue;
    status = next;
    if (status === "em_execucao") start ??= at;
    else if (start !== null) { elapsed += at - start; start = null; }
  }
  if (start !== null) elapsed += cutoff - start;
  return { status, horas: elapsed / 3600000, quantity };
}

export function makeDashboard(data: Data, f: DashboardFilter, today: string, now: number) {
  // Operational timestamps without a zone are stored in UTC. Use São Paulo's day for the cut.
  const dayEnd = Date.parse(f.ate + "T23:59:59.999-03:00");
  const cutoff = f.ate === today ? Math.min(now, dayEnd) : dayEnd;
  const names = {
    frente: index(data.frentes), servico: index(data.servicos), equipe: index(data.equipes),
  };
  const label = (kind: keyof typeof names, id: unknown) => String(names[kind].get(String(id))?.nome || "Não informado");
  const source = (sim: boolean) => f.origem === "todos" || sim === (f.origem === "simulacao");
  const dimension = (r: Row) => (!f.frente || same(r.frente_id, f.frente)) &&
    (!f.servico || same(r.servico_id, f.servico)) && (!f.equipe || same(r.equipe_id, f.equipe));
  const allTasks = data.tarefas || [];
  const allCommitments = data.compromissos_semanais || [];
  const linked = group(allTasks.filter(t => t.compromisso_semanal_id != null), t => String(t.compromisso_semanal_id));
  const commitmentIsSim = (c: Row) => marker(c) || ((linked.get(String(c.id)) || []).length > 0 &&
    (linked.get(String(c.id)) || []).every(marker));
  const commitments = allCommitments.filter(c => dimension(c) && source(commitmentIsSim(c)));
  const tasks = allTasks.filter(t => dimension(t) && source(marker(t)));
  const taskIds = index(tasks);
  const events = (data.evolucoes_tarefa || []).filter(e => taskIds.has(String(e.tarefa_id)) && Number.isFinite(time(e.timestamp)))
    .slice().sort((a,b) => time(a.timestamp) - time(b.timestamp) || Number(a.id) - Number(b.id));
  const until = events.filter(e => time(e.timestamp) <= cutoff);
  const eventsByTask = group(events, e => String(e.tarefa_id));
  const states = new Map(tasks.map(t => [String(t.id), taskState(t, eventsByTask.get(String(t.id)) || [], cutoff, f.ate, today)]));
  const scopedByCommitment = group(tasks.filter(t => t.compromisso_semanal_id != null), t => String(t.compromisso_semanal_id));
  const inCommitment = new Set<string>();
  const scopes: Scope[] = commitments.map(c => {
    const own = (scopedByCommitment.get(String(c.id)) || []).filter(t =>
      same(t.frente_id, c.frente_id) && same(t.servico_id, c.servico_id) && same(t.equipe_id, c.equipe_id) && unit(t) === unit(c));
    own.forEach(t => inCommitment.add(String(t.id)));
    return { row: c, tasks: own, meta: num(c.quantidade_meta), unidade: unit(c), prazo: iso(c.semana_fim),
      realizado: sum(own.map(t => states.get(String(t.id))!.quantity)) };
  });
  for (const t of tasks) {
    if (!inCommitment.has(String(t.id))) scopes.push({
      row: t, tasks: [t], meta: num(t.quantidade_meta), unidade: unit(t), prazo: iso(t.data),
      realizado: states.get(String(t.id))!.quantity,
    });
  }
  const keyUnit = (s: Scope) => String(s.row.servico_id) + "|" + s.unidade;
  const base = group(scopes.filter(s => s.meta > 0), keyUnit);
  const totalByUnit = new Map(Array.from(base, ([k, rows]) => [k, sum(rows.map(s => s.meta))]));
  const credited = (s: Scope) => Math.min(s.realizado, s.meta);
  const overall = (rows: Scope[], take = credited) => {
    const groups = group(rows.filter(s => s.meta > 0), keyUnit);
    if (!groups.size) return null;
    return sum(Array.from(groups.values(), rows => 100 * sum(rows.map(take)) / sum(rows.map(s => s.meta)))) / groups.size;
  };

  const rdosAll = (data.rdos || []).filter(r => iso(r.data) <= f.ate && source(r.simulacao === true || isSimulationRdo(data, r)));
  const rdoIds = index(rdosAll);
  const items = (data.rdos_itens || []).filter(i => rdoIds.has(String(i.rdo_id)) && dimension(i));
  const itemRdos = new Set(items.map(i => String(i.rdo_id)));
  const rdos = rdosAll.filter(r => (!f.frente && !f.servico && !f.equipe) || itemRdos.has(String(r.id)));
  const evidence = (data.evidencias_tarefa || []).filter(e => taskIds.has(String(e.tarefa_id)) && iso(e.criado_em) <= f.ate);
  const people = (data.colaboradores || []).filter(p => source(p.simulacao === true || isSimulationCollaborator(data, Number(p.id))));
  const periods = group(data.colaborador_periodos || [], p => String(p.colaborador_id));
  const active = new Set(people.filter(p => {
    const ps = periods.get(String(p.id));
    return ps?.length ? ps.some(x => inPeriod(x.data_admissao, x.data_desligamento, f.ate)) :
      !!p.ativo && (!p.data_admissao || iso(p.data_admissao) <= f.ate);
  }).map(p => String(p.id)));
  const members = group((data.equipe_colaboradores || []).filter(m =>
    active.has(String(m.colaborador_id)) && inPeriod(m.data_inicio, m.data_fim, f.ate)), m => String(m.equipe_id));
  const activeInTeam = (id: unknown) => new Set((members.get(String(id)) || []).map(m => String(m.colaborador_id))).size;
  const activeCount = f.equipe ? activeInTeam(f.equipe) : active.size;

  const relevantTasks = tasks.filter(t => iso(t.data) <= f.ate || (eventsByTask.get(String(t.id)) || []).some(e => time(e.timestamp) <= cutoff));
  const relevantIds = new Set(relevantTasks.map(t => String(t.id)));
  const taskRows = tasks.map(t => {
    const state = states.get(String(t.id))!;
    return { id: Number(t.id), data: iso(t.data), compromisso_id: t.compromisso_semanal_id ?? null,
      frente_id: t.frente_id ?? null, servico_id: t.servico_id ?? null, equipe_id: t.equipe_id ?? null,
      frente: label("frente", t.frente_id), servico: label("servico", t.servico_id), equipe: label("equipe", t.equipe_id),
      unidade: unit(t), meta: num(t.quantidade_meta), executado: state.quantity, horas_previstas: num(t.horas_previstas),
      horas_registradas: state.horas, ate_referencia: relevantIds.has(String(t.id)), situacao: relevantIds.has(String(t.id)) ? state.status : "futura", origem: marker(t) ? "Simulação anual" : "Operação" };
  });
  const observedTasks = taskRows.filter(t => t.ate_referencia);
  const count = (rs: Row[], key: (r: Row) => string) => Array.from(group(rs, key), ([nome, rows]) => ({ nome, total: rows.length }))
    .sort((a,b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  const due = (s: Scope) => s.prazo && s.prazo <= f.ate ? s.meta : 0;
  const overdue = (s: Scope) => s.meta > 0 && !!s.prazo && s.prazo < f.ate && s.realizado < s.meta;
  function breakdown(kind: "frente" | "servico" | "equipe" | "combinado") {
    const combined = kind === "combinado";
    const groupKey = (s: Scope) => combined ? [s.row.frente_id, keyUnit(s)].join("|") :
      kind === "servico" ? keyUnit(s) : String(s.row[kind + "_id"] ?? "");
    const groups = group(scopes, groupKey);
    if (kind === "equipe") for (const team of data.equipes || []) {
      if ((!f.equipe || same(team.id, f.equipe)) && !f.frente && !f.servico && !groups.has(String(team.id))) groups.set(String(team.id), []);
    }
    return Array.from(groups, ([id, rs]) => {
      const row = rs[0]?.row;
      const name = combined ? label("frente", row?.frente_id) + " · " + label("servico", row?.servico_id) :
        label(kind, row?.[kind + "_id"] ?? id);
      const single = combined || kind === "servico";
      return { id, nome: name, unidade: single ? rs[0]?.unidade ?? null : null, meta: single ? sum(rs.map(s => s.meta)) : null,
        executado: single ? sum(rs.map(s => s.realizado)) : null, percentual: overall(rs), previsto_pct: overall(rs, due),
        metas_vencidas: rs.filter(overdue).length, ativos: kind === "equipe" ? activeInTeam(row?.equipe_id ?? id) : null };
    }).sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
  }

  // Work scope is fixed for the curve. Each month credits work only up to each target.
  const weight = (s: Scope) => base.size && s.meta > 0 ? 100 / base.size / totalByUnit.get(keyUnit(s))! : 0;
  const months = new Map<string, { previsto: number; executado: number; eventos: number; impedimentos: number; diarios: number }>();
  function month(key: string) {
    if (!months.has(key)) months.set(key, { previsto: 0, executado: 0, eventos: 0, impedimentos: 0, diarios: 0 });
    return months.get(key)!;
  }
  for (const s of scopes) {
    const w = weight(s);
    if (s.prazo) month(s.prazo.slice(0, 7)).previsto += s.meta * w;
    const ev = s.tasks.flatMap(t => eventsByTask.get(String(t.id)) || [])
      .filter(e => time(e.timestamp) <= cutoff).sort((a,b) => time(a.timestamp) - time(b.timestamp));
    let done = 0;
    for (const e of ev) {
      const key = localDay(time(e.timestamp)).slice(0, 7);
      const next = Math.min(s.meta, done + num(e.quantidade_realizada));
      month(key).executado += (next - done) * w;
      done = next;
    }
  }
  for (const e of until) {
    const b = month(localDay(time(e.timestamp)).slice(0, 7));
    b.eventos++;
    if (e.tipo === "impedimento") b.impedimentos++;
  }
  for (const r of rdos) month(iso(r.data).slice(0, 7)).diarios++;
  if (months.size) {
    month(f.ate.slice(0, 7));
    const keys = Array.from(months.keys()).sort();
    let d = new Date(keys[0] + "-01T12:00:00Z");
    const last = keys[keys.length - 1];
    for (let i = 0; i < 600 && d.toISOString().slice(0, 7) <= last; i++) {
      month(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }
  let planned = 0, actual = 0;
  const series = Array.from(months.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([mes, r]) => {
    planned += r.previsto; actual += r.executado;
    return { mes, previsto_pct: base.size ? Math.min(100, planned) : null,
      executado_pct: base.size && mes <= f.ate.slice(0,7) ? Math.min(100, actual) : null,
      apontamentos: r.eventos, impedimentos: r.impedimentos, diarios: r.diarios };
  });
  const planRows = commitments.map(c => {
    const s = scopes.find(s => s.row === c)!;
    return { id: Number(c.id), inicio: iso(c.semana_inicio), fim: s.prazo, frente_id: c.frente_id ?? null,
      servico_id: c.servico_id ?? null, equipe_id: c.equipe_id ?? null, unidade: s.unidade,
      meta: s.meta, executado: s.realizado, percentual: pct(credited(s), s.meta), meta_vencida: overdue(s),
      origem: commitmentIsSim(c) ? "Simulação anual" : "Operação" };
  });

  return {
    percentual: overall(scopes), previsto: overall(scopes, due), series, taskRows, planRows,
    metas: scopes.map(s => ({ tipo: s.row.semana_fim ? "Compromisso" : "Tarefa avulsa", id: Number(s.row.id), prazo: s.prazo,
      frente_id: s.row.frente_id ?? null, servico_id: s.row.servico_id ?? null, equipe_id: s.row.equipe_id ?? null,
      unidade: s.unidade, meta: s.meta, executado: s.realizado, executado_creditado: credited(s),
      percentual: pct(credited(s), s.meta), meta_vencida: overdue(s) })),
    frentes: breakdown("frente"), servicos: breakdown("servico"), equipes: breakdown("equipe"), etapas: breakdown("combinado"),
    status: count(observedTasks, r => r.situacao),
    impedimentos: count(until.filter(e => e.tipo === "impedimento"), e => String(e.motivo_impedimento || "outro")),
    clima: count(rdos, r => String(r.clima || "Não informado")),
    metadados: { metas: scopes.filter(s => s.meta > 0).length, compromissos: commitments.length,
      vencidas: scopes.filter(overdue).length, tarefas: relevantTasks.length, concluidas: observedTasks.filter(t => t.situacao === "concluida").length,
      bloqueadas: observedTasks.filter(t => t.situacao === "bloqueada").length, pessoas: activeCount,
      horas_previstas: sum(observedTasks.map(t => t.horas_previstas)), horas_registradas: sum(observedTasks.map(t => t.horas_registradas)),
      diarios: rdos.length, itens_diario: items.length, evidencias: evidence.length, apontamentos: until.length },
    eventos: until.map(e => ({ id: Number(e.id), tarefa_id: Number(e.tarefa_id), timestamp: String(e.timestamp), tipo: String(e.tipo),
      quantidade: num(e.quantidade_realizada), unidade: unit(taskIds.get(String(e.tarefa_id))!), motivo: e.motivo_impedimento ?? null })),
    diarios: rdos.map(r => ({ id: Number(r.id), data: iso(r.data), clima: r.clima ?? null,
      origem: r.simulacao === true || isSimulationRdo(data, r) ? "Simulação anual" : "Operação" })),
    itens: items.map(i => ({ id: Number(i.id), diario_id: Number(i.rdo_id), tarefa_id: i.tarefa_id ?? null,
      frente_id: i.frente_id ?? null, servico_id: i.servico_id ?? null, equipe_id: i.equipe_id ?? null,
      unidade: unit(i), quantidade: num(i.quantidade_realizada) })),
    evidencias: evidence.map(e => ({ id: Number(e.id), tarefa_id: Number(e.tarefa_id), data: iso(e.criado_em) })),
  };
}
const brDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export function localDay(at: number) {
  const p = brDay.formatToParts(at);
  return ["year", "month", "day"].map(k => p.find(x => x.type === k)?.value).join("-");
}
export const METHODOLOGY = "Cada serviço e unidade tem o mesmo peso no indicador geral. Dentro de cada serviço, o peso vem da quantidade planejada. A produção é limitada à meta de cada compromisso ou tarefa avulsa. O diário é analisado à parte. O previsto entra na data de término da meta.";
export type DashboardModel = ReturnType<typeof makeDashboard>;
