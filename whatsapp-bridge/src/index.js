import "dotenv/config";
import path from "node:path";
import whatsapp from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { createDatabase } from "./db.js";
import { menu, parseCommand, taskList } from "./commands.js";

const { Client, LocalAuth } = whatsapp;

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const db = createDatabase(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const intervalMs = Math.max(2000, Number(process.env.OUTBOX_INTERVAL_MS || 5000));
const authPath = path.resolve(process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth");
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: authPath, clientId: "obras" }),
  puppeteer: {
    headless: process.env.HEADLESS !== "false",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});
let ready = false;
let pumping = false;

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

async function savePhoto(message, inbox, phone) {
  const session = await db.session(inbox.canal_id);
  if (!session?.tarefa_ativa_id)
    return "Inicie ou retome uma tarefa antes de enviar a foto.";
  const media = await message.downloadMedia();
  if (!media || !media.mimetype?.startsWith("image/"))
    return "Neste momento, envie apenas fotos em JPEG, PNG ou WebP.";
  const extension = media.mimetype === "image/png" ? "png" : media.mimetype === "image/webp" ? "webp" : "jpg";
  const safeId = messageId(message).replace(/[^a-zA-Z0-9_-]/g, "_");
  const storagePath = `${session.obra_id}/${session.tarefa_ativa_id}/${safeId}.${extension}`;
  const bytes = Uint8Array.from(Buffer.from(media.data, "base64"));
  await db.uploadEvidence(storagePath, bytes, media.mimetype);
  await db.saveEvidence(
    inbox.canal_id,
    session.tarefa_ativa_id,
    messageId(message),
    storagePath,
    media.mimetype,
    message.body,
  );
  console.log(`[entrada] Foto salva para ${phone}, tarefa #${session.tarefa_ativa_id}`);
  return `Foto anexada à tarefa #${session.tarefa_ativa_id}.`;
}

async function handleMessage(message) {
  if (message.fromMe || message.from.endsWith("@g.us") || message.from === "status@broadcast") return;
  const id = messageId(message);
  let phone = "";
  try {
    phone = await phoneFromMessage(message);
    const inbox = await db.receive({
      id,
      phone,
      type: message.type || "chat",
      body: message.body,
      hasMedia: message.hasMedia,
      metadata: { from: message.from, timestamp: message.timestamp },
    });
    if (!inbox?.aceita) return;

    const command = parseCommand(message.body);
    let response;
    if (!inbox.canal_id) {
      response = "Seu telefone ainda não foi liberado. Peça ao gestor para gerar o acesso.";
    } else if (command.kind === "activate") {
      await db.activate(phone, command.code);
      response = `Acesso ativado com sucesso.\n\n${menu}`;
    } else if (inbox.status !== "ativo") {
      response = "Acesso pendente. Envie ATIVAR seguido do código recebido.";
    } else if (message.hasMedia) {
      response = await savePhoto(message, inbox, phone);
    } else if (command.kind === "menu") {
      response = menu;
    } else if (command.kind === "list") {
      response = taskList(await db.listTasks(inbox.canal_id));
    } else if (command.kind === "invalid") {
      response = command.message;
    } else {
      const result = await db.execute(inbox.canal_id, command);
      response = `Tarefa #${result.tarefa_id} atualizada: ${result.status}.`;
    }
    await message.reply(response);
    await db.finishInbox(id, "processado");
  } catch (error) {
    const detail = errorMessage(error);
    console.error(`[entrada] ${phone || message.from}: ${detail}`);
    try {
      await message.reply(`Não consegui registrar: ${detail}`);
      await db.finishInbox(id, "erro", detail);
    } catch (finishError) {
      console.error("[entrada] Falha ao registrar o erro:", errorMessage(finishError));
    }
  }
}

async function pumpOutbox() {
  if (!ready || pumping) return;
  pumping = true;
  try {
    const rows = await db.claimOutbox();
    for (const row of rows || []) {
      try {
        const number = row.telefone_e164.replace(/\D/g, "");
        const whatsappId = await client.getNumberId(number);
        if (!whatsappId) throw new Error("Número não registrado no WhatsApp.");
        const sent = await client.sendMessage(whatsappId._serialized, row.corpo);
        await db.finishOutbox(row.id, true, sent.id?._serialized || null);
        console.log(`[saida] Mensagem #${row.id} enviada para ${row.telefone_e164}`);
      } catch (error) {
        const detail = errorMessage(error);
        await db.finishOutbox(row.id, false, null, detail);
        console.error(`[saida] Mensagem #${row.id}: ${detail}`);
      }
    }
  } catch (error) {
    console.error("[saida] Falha ao consultar fila:", errorMessage(error));
  } finally {
    pumping = false;
  }
}

client.on("qr", (code) => {
  console.log("Escaneie o QR Code com o número exclusivo da obra:");
  qrcode.generate(code, { small: true });
});
client.on("ready", () => {
  ready = true;
  console.log("WhatsApp conectado. O conector está pronto.");
  void pumpOutbox();
});
client.on("disconnected", (reason) => {
  ready = false;
  console.error("WhatsApp desconectado:", reason);
});
client.on("auth_failure", (reason) => console.error("Falha de autenticação:", reason));
client.on("message", (message) => void handleMessage(message));

setInterval(() => void pumpOutbox(), intervalMs).unref();
await client.initialize();
