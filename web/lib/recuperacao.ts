import { formatUnit, labels, lookup, type Data } from "./operacional";

export type RecoveryStatus = "atrasada" | "meta_nao_atingida" | "recuperada";
export type RecoveryItem = {
  id: number;
  semana_inicio: string;
  semana_fim: string;
  frente: string;
  servico: string;
  equipe: string;
  meta: number;
  executado: number;
  unidade: string;
  status: RecoveryStatus;
  dias_atraso: number;
  recuperada_em: string | null;
  motivo: string | null;
  observacao: string | null;
  retomada_em: string | null;
  novos_vinculos: number;
  tarefa_ids: number[];
};

function diasEntre(inicio: string, fim: string) {
  const [iy, im, id] = inicio.split("-").map(Number);
  const [fy, fm, fd] = fim.split("-").map(Number);
  return Math.max(
    0,
    Math.round((Date.UTC(fy, fm - 1, fd) - Date.UTC(iy, im - 1, id)) / 86400000),
  );
}

/** Compara metas semanais vencidas com a produção registrada até a data consultada. */
export function acompanharRecuperacao(data: Data, asOf: string): RecoveryItem[] {
  const items: RecoveryItem[] = [];
  const commitments = data.compromissos_semanais || [];
  const tasks = data.tarefas || [];
  const events = data.evolucoes_tarefa || [];
  const memberships = data.equipe_colaboradores || [];

  commitments.forEach((commitment) => {
    if (!commitment.semana_fim || commitment.semana_fim >= asOf) return;

    const relatedTasks = tasks.filter(
      (task) => Number(task.compromisso_semanal_id) === Number(commitment.id),
    );
    const taskIds = relatedTasks.map((task) => Number(task.id));
    const relatedEvents = events
      .filter(
        (event) =>
          taskIds.includes(Number(event.tarefa_id)) &&
          String(event.timestamp || "").slice(0, 10) <= asOf,
      )
      .slice()
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

    const meta = Number(commitment.quantidade_meta || 0);
    if (meta <= 0) return;

    let acumulado = 0;
    let executado = 0;
    let executadoNoPrazo = 0;
    let recuperadaEm: string | null = null;
    let recuperadaNoTimestamp: string | null = null;
    relatedEvents.forEach((event) => {
      const quantidade = Number(event.quantidade_realizada || 0);
      const dataEvento = String(event.timestamp || "").slice(0, 10);
      acumulado += quantidade;
      executado = acumulado;
      if (dataEvento <= commitment.semana_fim) executadoNoPrazo += quantidade;
      if (!recuperadaEm && acumulado >= meta) {
        recuperadaEm = dataEvento;
        recuperadaNoTimestamp = String(event.timestamp || "");
      }
    });

    if (executadoNoPrazo >= meta) return;
    const todasTarefasConcluidas =
      relatedTasks.length > 0 &&
      relatedTasks.every(
        (task) =>
          relatedEvents.some(
            (event) =>
              Number(event.tarefa_id) === Number(task.id) &&
              event.tipo === "conclusao",
          ) ||
          (task.status === "concluida" && task.data <= asOf),
      );
    const status: RecoveryStatus = recuperadaEm
      ? "recuperada"
      : todasTarefasConcluidas
        ? "meta_nao_atingida"
        : "atrasada";
    const dataResultado = recuperadaEm || asOf;
    const atrasoDesde = diasEntre(commitment.semana_fim, dataResultado);
    const causas = relatedEvents.filter(
      (event) =>
        event.tipo === "impedimento" &&
        (!recuperadaNoTimestamp || String(event.timestamp) <= recuperadaNoTimestamp),
    );
    const causa = causas[causas.length - 1];
    const retomada = causa
      ? relatedEvents.find(
          (event) =>
            String(event.timestamp) > String(causa.timestamp) &&
            (event.tipo === "retomada" || Number(event.quantidade_realizada || 0) > 0),
        )
      : null;

    const equipeId = Number(commitment.equipe_id);
    const membrosNoPrazo = memberships
      .filter(
        (membership) =>
          Number(membership.equipe_id) === equipeId &&
          membership.data_inicio <= commitment.semana_fim &&
          (!membership.data_fim || membership.data_fim >= commitment.semana_fim),
      )
      .map((membership) => Number(membership.colaborador_id));
    const membrosAdicionados = memberships
      .filter(
        (membership) =>
          Number(membership.equipe_id) === equipeId &&
          membership.data_inicio > commitment.semana_fim &&
          membership.data_inicio <= dataResultado &&
          !membrosNoPrazo.includes(Number(membership.colaborador_id)),
      )
      .map((membership) => Number(membership.colaborador_id))
      .filter((id, index, all) => all.indexOf(id) === index);

    items.push({
      id: Number(commitment.id),
      semana_inicio: commitment.semana_inicio,
      semana_fim: commitment.semana_fim,
      frente: lookup(data, "frentes", commitment.frente_id),
      servico: lookup(data, "servicos", commitment.servico_id),
      equipe: lookup(data, "equipes", commitment.equipe_id),
      meta,
      executado,
      unidade: formatUnit(commitment.unidade),
      status,
      dias_atraso: atrasoDesde,
      recuperada_em: recuperadaEm,
      motivo: causa
        ? labels[causa.motivo_impedimento] || causa.motivo_impedimento || null
        : null,
      observacao: causa?.observacao || null,
      retomada_em: retomada ? String(retomada.timestamp).slice(0, 10) : null,
      novos_vinculos: membrosAdicionados.length,
      tarefa_ids: taskIds,
    });
  });

  const prioridade: Record<RecoveryStatus, number> = {
    atrasada: 0,
    meta_nao_atingida: 1,
    recuperada: 2,
  };
  return items.sort((a, b) => {
    if (a.status !== b.status) return prioridade[a.status] - prioridade[b.status];
    if (a.status !== "recuperada") return a.semana_fim.localeCompare(b.semana_fim);
    return String(b.recuperada_em).localeCompare(String(a.recuperada_em));
  });
}
