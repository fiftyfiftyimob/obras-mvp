import "dotenv/config";
import http from "node:http";
import path from "node:path";
import whatsapp from "whatsapp-web.js";
import QRCode from "qrcode";
import { createDatabase } from "./db.js";
import { createSessionStore } from "./session-store.js";

const { Client, RemoteAuth } = whatsapp;
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[name]) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const db = createDatabase(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const authPath = path.resolve(process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth");
const store = createSessionStore(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  authPath,
);
const outboxInterval = Math.max(2000, Number(process.env.OUTBOX_INTERVAL_MS || 5000));
const controlInterval = Math.max(2000, Number(process.env.CONTROL_INTERVAL_MS || 4000));

let client = null;
let ready = false;
let starting = false;
let stopping = false;
let pumping = false;
let reconnectTimer = null;
let shuttingDown = false;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function messageId(message) {
  return message.id?._serialized || message.id?.id || String(message.timestamp);
}

async function phoneFromMessage(message) {
  const contact = await message.getContact();
  const number = contact.number || message.from.split("@")[0];
  return `+${String(number).replace(/\D/g, "")}`;
}

const mainMenu = [
  "*Menu da obra*",
  "1 - Ver minhas tarefas",
  "2 - Ver tarefa em andamento",
  "0 - Mostrar este menu",
].join("\n");

function taskMenu(task) {
  return [
    `*${task.servico}* · ${task.frente}`,
    `Meta: ${task.quantidade_meta} ${task.unidade}`,
    `Status: ${task.status.replaceAll("_", " ")}`,
    "",
    "1 - Iniciar ou retomar",
    "2 - Informar produção",
    "3 - Informar impedimento",
    "4 - Solicitar conclusão",
    "5 - Enviar foto",
    "9 - Voltar às tarefas",
    "0 - Menu principal",
  ].join("\n");
}

async function listTaskChoices(channelId) {
  const tasks = await db.listTasks(channelId);
  if (!tasks.length) {
    await db.updateSession(channelId, "menu");
    return "Você não possui tarefas abertas no momento.\n\n" + mainMenu;
  }
  await db.updateSession(channelId, "escolher_tarefa", {
    tarefas: tasks.map((task) => task.id),
  });
  return [
    "*Suas tarefas*",
    ...tasks.map(
      (task, index) =>
        `${index + 1} - ${task.servico} · ${task.frente} · ${task.status.replaceAll("_", " ")}`,
    ),
    "",
    "Responda com o número da tarefa.",
    "0 - Menu principal",
  ].join("\n");
}

async function guidedReply(channelId, body) {
  const answer = String(body || "").trim().toLowerCase();
  const session = (await db.session(channelId)) || {};
  if (["0", "menu", "oi", "olá", "ola"].includes(answer)) {
    await db.updateSession(channelId, "menu");
    return mainMenu;
  }
  if (session.estado === "escolher_tarefa") {
    const taskId = session.dados?.tarefas?.[Number(answer) - 1];
    const task = (await db.listTasks(channelId)).find((item) => item.id === taskId);
    if (!task) return listTaskChoices(channelId);
    await db.updateSession(channelId, "tarefa", {}, task.id);
    return taskMenu(task);
  }
  if (session.estado === "quantidade") {
    const amount = Number(answer.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0)
      return "Informe apenas a quantidade produzida. Exemplo: *12,5*.";
    await db.execute(channelId, {
      taskId: session.tarefa_ativa_id,
      action: "producao",
      amount,
    });
    const task = (await db.listTasks(channelId)).find(
      (item) => item.id === session.tarefa_ativa_id,
    );
    await db.updateSession(channelId, "tarefa", {}, session.tarefa_ativa_id);
    return `Produção de ${amount} registrada.\n\n${taskMenu(task)}`;
  }
  if (session.estado === "impedimento") {
    const reasons = [
      "falta_material",
      "falta_ferramenta",
      "frente_ocupada",
      "projeto_pendente",
      "chuva",
      "espera_equipe",
      "seguranca",
      "outro",
    ];
    const motive = reasons[Number(answer) - 1];
    if (!motive) return "Escolha um número de 1 a 8 para registrar o impedimento.";
    await db.execute(channelId, {
      taskId: session.tarefa_ativa_id,
      action: "impedimento",
      amount: 0,
      motive,
    });
    await db.updateSession(channelId, "menu");
    return "Impedimento registrado e enviado ao gestor.\n\n" + mainMenu;
  }
  if (session.estado === "tarefa" && session.tarefa_ativa_id) {
    const task = (await db.listTasks(channelId)).find(
      (item) => item.id === session.tarefa_ativa_id,
    );
    if (!task) return listTaskChoices(channelId);
    if (answer === "1") {
      if (!["nao_iniciada", "pausada", "bloqueada"].includes(task.status))
        return "Esta tarefa já está em execução.\n\n" + taskMenu(task);
      await db.execute(channelId, {
        taskId: task.id,
        action: task.status === "nao_iniciada" ? "inicio" : "retomada",
        amount: 0,
      });
      await db.updateSession(channelId, "tarefa", {}, task.id);
      return `Tarefa atualizada.\n\n${taskMenu({ ...task, status: "em_execucao" })}`;
    }
    if (answer === "2") {
      if (task.status !== "em_execucao")
        return "Inicie ou retome a tarefa antes de informar a produção.";
      await db.updateSession(channelId, "quantidade", {}, task.id);
      return `Qual quantidade foi produzida em ${task.unidade}?`;
    }
    if (answer === "3") {
      await db.updateSession(channelId, "impedimento", {}, task.id);
      return [
        "*Qual é o impedimento?*",
        "1 - Falta de material",
        "2 - Falta de ferramenta",
        "3 - Frente ocupada",
        "4 - Projeto pendente",
        "5 - Chuva",
        "6 - Espera de equipe",
        "7 - Segurança",
        "8 - Outro",
      ].join("\n");
    }
    if (answer === "4") {
      if (task.status !== "em_execucao")
        return "Inicie ou retome a tarefa antes de solicitar a conclusão.";
      await db.execute(channelId, { taskId: task.id, action: "conclusao", amount: 0 });
      await db.updateSession(channelId, "menu");
      return "Conclusão enviada para validação do gestor.\n\n" + mainMenu;
    }
    if (answer === "5") return "Envie a foto agora. Ela será anexada a esta tarefa.";
    if (answer === "9") return listTaskChoices(channelId);
    return taskMenu(task);
  }
  if (answer === "1") return listTaskChoices(channelId);
  if (answer === "2") {
    if (!session.tarefa_ativa_id) return "Nenhuma tarefa está em andamento.\n\n" + mainMenu;
    const task = (await db.listTasks(channelId)).find(
      (item) => item.id === session.tarefa_ativa_id,
    );
    return task ? taskMenu(task) : listTaskChoices(channelId);
  }
  return mainMenu;
}

async function savePhoto(message, inbox) {
  const session = await db.session(inbox.canal_id);
  if (!session?.tarefa_ativa_id)
    return "Escolha uma tarefa antes de enviar a foto. Responda *1* para ver as tarefas.";
  const media = await message.downloadMedia();
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!media || !allowed.includes(media.mimetype))
    return "Envie uma foto em JPEG, PNG ou WebP.";
  const extension = media.mimetype === "image/png" ? "png" : media.mimetype === "image/webp" ? "webp" : "jpg";
  const safeId = messageId(message).replace(/[^a-zA-Z0-9_-]/g, "_");
  const storagePath = `${session.obra_id}/${session.tarefa_ativa_id}/${safeId}.${extension}`;
  await db.uploadEvidence(
    storagePath,
    Uint8Array.from(Buffer.from(media.data, "base64")),
    media.mimetype,
  );
  await db.saveEvidence(
    inbox.canal_id,
    session.tarefa_ativa_id,
    messageId(message),
    storagePath,
    media.mimetype,
    message.body,
  );
  return "Foto anexada à tarefa e enviada ao gestor.";
}

async function handleMessage(message) {
  if (message.fromMe || message.from.endsWith("@g.us") || message.from === "status@broadcast") return;
  const id = messageId(message);
  try {
    const phone = await phoneFromMessage(message);
    const inbox = await db.receive({
      id,
      phone,
      type: message.type || "chat",
      body: message.body,
      hasMedia: message.hasMedia,
      metadata: { from: message.from, timestamp: message.timestamp },
    });
    if (!inbox?.aceita) return;
    const response = !inbox.canal_id || inbox.status !== "ativo"
      ? "Seu telefone ainda não está cadastrado. Peça ao gestor para conferir seu número."
      : message.hasMedia
        ? await savePhoto(message, inbox)
        : await guidedReply(inbox.canal_id, message.body);
    await message.reply(response);
    await db.finishInbox(id, "processado");
  } catch (error) {
    console.error("[entrada]", errorMessage(error));
    try {
      await message.reply("Não consegui registrar agora. Tente novamente em alguns instantes.");
      await db.finishInbox(id, "erro", errorMessage(error));
    } catch (finishError) {
      console.error("[entrada] falha ao finalizar", errorMessage(finishError));
    }
  }
}

async function pumpOutbox() {
  if (!ready || pumping || !client) return;
  pumping = true;
  try {
    const rows = await db.claimOutbox();
    for (const row of rows || []) {
      try {
        const whatsappId = await client.getNumberId(row.telefone_e164.replace(/\D/g, ""));
        if (!whatsappId) throw new Error("Número não registrado no WhatsApp.");
        const sent = await client.sendMessage(whatsappId._serialized, row.corpo);
        await db.finishOutbox(row.id, true, sent.id?._serialized || null);
      } catch (error) {
        await db.finishOutbox(row.id, false, null, errorMessage(error));
      }
    }
  } catch (error) {
    console.error("[saida]", errorMessage(error));
  } finally {
    pumping = false;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || stopping) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void controlConnection();
  }, 10000);
}

async function startClient() {
  if (client || starting || stopping) return;
  starting = true;
  await db.updateIntegration({ status: "iniciando", qr_code: null, ultimo_erro: null });
  const current = new Client({
    authStrategy: new RemoteAuth({
      store,
      clientId: "obras",
      dataPath: authPath,
      backupSyncIntervalMs: 300000,
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
  });
  client = current;
  current.on("qr", async (code) => {
    const dataUrl = await QRCode.toDataURL(code, { width: 360, margin: 2 });
    await db.updateIntegration({ status: "aguardando_qr", qr_code: dataUrl, ultimo_erro: null });
  });
  current.on("authenticated", () =>
    void db.updateIntegration({ status: "iniciando", qr_code: null, ultimo_erro: null }),
  );
  current.on("ready", () => {
    ready = true;
    void db.updateIntegration({
      status: "conectado",
      qr_code: null,
      telefone_e164: current.info?.wid?.user ? `+${current.info.wid.user}` : null,
      nome_conta: current.info?.pushname || null,
      conectado_em: new Date().toISOString(),
      ultimo_erro: null,
    });
    void pumpOutbox();
  });
  current.on("message", (message) => void handleMessage(message));
  current.on("auth_failure", (reason) =>
    void db.updateIntegration({ status: "erro", qr_code: null, ultimo_erro: String(reason) }),
  );
  current.on("disconnected", (reason) => {
    ready = false;
    if (client === current) client = null;
    if (shuttingDown) return;
    void db.updateIntegration({
      status: stopping ? "desconectado" : "erro",
      qr_code: null,
      ultimo_erro: stopping ? null : `WhatsApp desconectado: ${reason}`,
    });
    if (!stopping) scheduleReconnect();
  });
  try {
    await current.initialize();
  } catch (error) {
    if (client === current) client = null;
    await db.updateIntegration({ status: "erro", qr_code: null, ultimo_erro: errorMessage(error) });
    scheduleReconnect();
  } finally {
    starting = false;
  }
}

async function stopClient() {
  if (stopping) return;
  stopping = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const current = client;
  client = null;
  ready = false;
  try {
    if (current) await current.logout();
  } catch (error) {
    console.error("[whatsapp] logout", errorMessage(error));
  }
  try {
    if (current) await current.destroy();
  } catch (error) {
    console.error("[whatsapp] destroy", errorMessage(error));
  }
  await db.updateIntegration({
    status: "desconectado",
    qr_code: null,
    telefone_e164: null,
    nome_conta: null,
    conectado_em: null,
    ultimo_erro: null,
  });
  stopping = false;
}

async function controlConnection() {
  try {
    const integration = await db.integration();
    if (integration.ativo && !client && !starting) await startClient();
    if (!integration.ativo && (client || starting) && !stopping) await stopClient();
  } catch (error) {
    console.error("[controle]", errorMessage(error));
  }
}

const server = http.createServer((_request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ ok: true, whatsapp: ready ? "conectado" : "desconectado" }));
});
server.listen(Number(process.env.PORT || 3000), "0.0.0.0");

setInterval(() => void pumpOutbox(), outboxInterval).unref();
setInterval(() => void controlConnection(), controlInterval).unref();
await controlConnection();

async function shutdown() {
  shuttingDown = true;
  ready = false;
  if (client) {
    try {
      await client.destroy();
    } catch (error) {
      console.error("[whatsapp] encerramento", errorMessage(error));
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
