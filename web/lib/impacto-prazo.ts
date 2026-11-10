import { labels, lookup, type Data } from "./operacional";

const DAY_MS = 24 * 60 * 60 * 1000;

type DelayInterval = {
  start: number;
  end: number;
  startAt: string;
  endAt: string;
  open: boolean;
  tarefaId: number;
  eventoId: number;
  motivo: string;
  atividade: string;
  observacao: string | null;
};

type FrontAggregate = {
  frenteId: number;
  frente: string;
  baselineEnd: string | null;
  intervals: DelayInterval[];
  reasons: string[];
  activities: string[];
  observations: string[];
  taskIds: number[];
};

export type DelayIncident = {
  id: string;
  tarefaId: number;
  eventoId: number;
  motivo: string;
  atividade: string;
  inicio: string;
  fim: string;
  duracaoHoras: number;
  emAberto: boolean;
  observacao: string | null;
};

export type FrontDelayEstimate = {
  frenteId: number;
  frente: string;
  prazoBase: string | null;
  previsaoAtualizada: string | null;
  horasImpedidas: number;
  diasAdicionados: number;
  impedimentosAbertos: number;
  eventos: number;
  motivos: string[];
  atividades: string[];
  tarefaIds: number[];
};

function timestampMs(value: string) {
  const normalized =
    value.endsWith("Z") || /[+-]\\d\\d:\\d\\d$/.test(value) ? value : value + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function endOfDate(value: string) {
  const parsed = Date.parse(value + "T23:59:59.999Z");
  return Number.isFinite(parsed) ? parsed : null;
}

function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mergeDuration(intervals: DelayInterval[]) {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  let total = 0;
  let start: number | null = null;
  let end = 0;
  sorted.forEach((interval) => {
    if (start === null) {
      start = interval.start;
      end = interval.end;
    } else if (interval.start <= end) {
      end = Math.max(end, interval.end);
    } else {
      total += end - start;
      start = interval.start;
      end = interval.end;
    }
  });
  if (start !== null) total += end - start;
  return Math.max(0, total);
}

/** Relaciona chuva/falta de material aos serviços e estima o impacto no prazo semanal final da frente. */
export function estimarImpactoImpedimentos(
  data: Data,
  asOf: string,
  today: string,
): FrontDelayEstimate[] {
  const cutoff = asOf === today ? Date.now() : endOfDate(asOf);
  if (cutoff === null) return [];

  const events = data.evolucoes_tarefa || [];
  const tasks = data.tarefas || [];
  const aggregates: Record<string, FrontAggregate> = {};

  tasks.forEach((task) => {
    const taskEvents = events
      .filter((event) => Number(event.tarefa_id) === Number(task.id))
      .slice()
      .sort((a, b) => {
        const timeOrder = String(a.timestamp).localeCompare(String(b.timestamp));
        return timeOrder || Number(a.id) - Number(b.id);
      });

    let pending: { event: (typeof taskEvents)[number]; start: number } | null = null;
    taskEvents.forEach((event) => {
      const eventTime = timestampMs(String(event.timestamp || ""));
      if (eventTime === null || eventTime > cutoff) return;

      if (
        event.tipo === "impedimento" &&
        ["chuva", "falta_material"].includes(String(event.motivo_impedimento))
      ) {
        if (pending === null) pending = { event, start: eventTime };
        return;
      }

      if (!pending) return;
      const resumed =
        event.tipo === "retomada" ||
        event.tipo === "conclusao" ||
        event.tipo === "solicitacao_conclusao" ||
        (event.tipo === "producao" && Number(event.quantidade_realizada || 0) > 0);
      if (!resumed || eventTime < pending.start) return;

      addInterval(task, pending, eventTime, false, String(event.timestamp));
      pending = null;
    });

    if (pending) addInterval(task, pending, cutoff, true, new Date(cutoff).toISOString());

    function addInterval(
      currentTask: (typeof tasks)[number],
      blocked: { event: (typeof taskEvents)[number]; start: number },
      end: number,
      open: boolean,
      endAt: string,
    ) {
      if (end < blocked.start || currentTask.frente_id == null) return;
      const frontId = Number(currentTask.frente_id);
      const key = String(frontId);
      if (!aggregates[key]) {
        const plannedEnd = (data.compromissos_semanais || [])
          .filter((commitment) => Number(commitment.frente_id) === frontId)
          .reduce<string | null>(
            (latest, commitment) =>
              !latest || commitment.semana_fim > latest
                ? commitment.semana_fim
                : latest,
            null,
          );
        aggregates[key] = {
          frenteId: frontId,
          frente: lookup(data, "frentes", frontId),
          baselineEnd: plannedEnd,
          intervals: [],
          reasons: [],
          activities: [],
          taskIds: [],
        };
      }
      const group = aggregates[key];
      const reason = labels[blocked.event.motivo_impedimento] || String(blocked.event.motivo_impedimento);
      const service = lookup(data, "servicos", currentTask.servico_id);
      const team = currentTask.equipe_id
        ? lookup(data, "equipes", currentTask.equipe_id)
        : "";
      const activity = [
        service,
        currentTask.data ? currentTask.data.split("-").reverse().join("/") : "sem data",
        team,
      ].filter(Boolean).join(" · ");
      group.intervals.push({
        start: blocked.start,
        end,
        startAt: String(blocked.event.timestamp),
        endAt,
        open,
        tarefaId: Number(currentTask.id),
        eventoId: Number(blocked.event.id),
        motivo: reason,
        atividade: activity,
        observacao: blocked.event.observacao || null,
      });
      if (!group.reasons.includes(reason)) group.reasons.push(reason);
      if (!group.activities.includes(activity)) group.activities.push(activity);
      if (!group.taskIds.includes(Number(currentTask.id))) group.taskIds.push(Number(currentTask.id));
    }
  });

  return Object.values(aggregates)
    .map((group) => {
      const duration = mergeDuration(group.intervals);
      const addedDays = duration > 0 ? Math.ceil(duration / DAY_MS) : 0;
      return {
        frenteId: group.frenteId,
        frente: group.frente,
        prazoBase: group.baselineEnd,
        previsaoAtualizada: group.baselineEnd
          ? addCalendarDays(group.baselineEnd, addedDays)
          : null,
        horasImpedidas: duration / (60 * 60 * 1000),
        diasAdicionados: addedDays,
        impedimentosAbertos: group.intervals.filter((interval) => interval.open).length,
        eventos: group.intervals.length,
        motivos: group.reasons,
        atividades: group.activities,
        incidentes: group.intervals.map((interval) => ({
          id: `${interval.tarefaId}-${interval.eventoId}`,
          tarefaId: interval.tarefaId,
          eventoId: interval.eventoId,
          motivo: interval.motivo,
          atividade: interval.atividade,
          inicio: interval.startAt,
          fim: interval.endAt,
          duracaoHoras: Math.max(0, interval.end - interval.start) / (60 * 60 * 1000),
          emAberto: interval.open,
          observacao: interval.observacao,
        })),
        tarefaIds: group.taskIds,
      };
    })
    .sort((a, b) => b.diasAdicionados - a.diasAdicionados || a.frente.localeCompare(b.frente, "pt-BR"));
}
