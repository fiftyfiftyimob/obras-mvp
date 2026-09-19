const motives = new Set([
  "falta_material",
  "falta_ferramenta",
  "frente_ocupada",
  "projeto_pendente",
  "chuva",
  "espera_equipe",
  "seguranca",
  "outro",
]);

const aliases = {
  INICIAR: "inicio",
  PAUSAR: "pausa",
  RETOMAR: "retomada",
  PRODUCAO: "producao",
  PRODUÇÃO: "producao",
  CONCLUIR: "conclusao",
  IMPEDIMENTO: "impedimento",
};

function quantity(value) {
  if (!value) return 0;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCommand(input) {
  const body = String(input || "").trim();
  if (!body) return { kind: "menu" };
  const parts = body.split(/\s+/);
  const name = parts.shift().toUpperCase();

  if (["OI", "OLA", "OLÁ", "MENU", "AJUDA", "0"].includes(name))
    return { kind: "menu" };
  if (["TAREFAS", "LISTAR", "1"].includes(name))
    return { kind: "list" };
  if (name === "ATIVAR")
    return /^\d{6}$/.test(parts[0] || "")
      ? { kind: "activate", code: parts[0] }
      : { kind: "invalid", message: "Use ATIVAR seguido do código de 6 números." };

  const action = aliases[name];
  if (!action)
    return { kind: "invalid", message: "Comando não reconhecido. Envie MENU." };

  const taskId = Number(parts.shift());
  if (!Number.isInteger(taskId) || taskId <= 0)
    return { kind: "invalid", message: `Use ${name} seguido do número da tarefa.` };

  if (action === "impedimento") {
    const motive = String(parts.shift() || "").toLowerCase();
    if (!motives.has(motive))
      return { kind: "invalid", message: "Motivo inválido. Envie MENU para ver as opções." };
    return { kind: "action", action, taskId, amount: 0, motive, note: parts.join(" ") || null };
  }

  const needsAmount = ["pausa", "producao", "conclusao"].includes(action);
  const amount = needsAmount ? quantity(parts.shift()) : 0;
  if (amount === null || (action === "producao" && amount <= 0))
    return { kind: "invalid", message: "Informe uma quantidade válida. Use ponto ou vírgula." };
  return { kind: "action", action, taskId, amount, motive: null, note: parts.join(" ") || null };
}

export const menu = `*Obras · Menu do operário*

TAREFAS — listar tarefas
INICIAR 12
PRODUCAO 12 4,5 observação
PAUSAR 12 2 observação
RETOMAR 12
IMPEDIMENTO 12 chuva observação
CONCLUIR 12 3 observação

Motivos: falta_material, falta_ferramenta, frente_ocupada, projeto_pendente, chuva, espera_equipe, seguranca ou outro.

Envie uma foto durante a execução para anexá-la à tarefa ativa.`;

export function taskList(tasks) {
  if (!tasks?.length) return "Você não tem tarefas abertas no período.";
  return [
    "*Suas tarefas*",
    ...tasks.map(
      (task) =>
        `#${task.id} · ${String(task.data).split("-").reverse().join("/")}\n${task.servico} · ${task.frente}\nMeta: ${task.quantidade_meta} ${task.unidade} · ${task.status}`,
    ),
    "",
    "Envie MENU para ver os comandos.",
  ].join("\n\n");
}
