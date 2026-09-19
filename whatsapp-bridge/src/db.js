import { createClient } from "@supabase/supabase-js";

export function createDatabase(url, serviceRoleKey) {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function rpc(name, params) {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
  }

  return {
    receive: (message) =>
      rpc("registrar_whatsapp_inbox", {
        p_provider_id: message.id,
        p_telefone: message.phone,
        p_tipo: message.type,
        p_corpo: message.body || null,
        p_possui_midia: message.hasMedia,
        p_metadados: message.metadata || {},
      }),
    activate: async (phone, code) => {
      const result = await rpc("ativar_canal_whatsapp", {
        p_telefone: phone,
        p_codigo: code,
      });
      if (!result?.ativado) throw new Error(result?.erro || "Não foi possível ativar o acesso.");
      return result;
    },
    listTasks: (channelId) =>
      rpc("listar_tarefas_whatsapp", { p_canal: channelId }),
    execute: (channelId, command) =>
      rpc("registrar_evolucao_operario", {
        p_canal: channelId,
        p_tarefa: command.taskId,
        p_tipo: command.action,
        p_quantidade: command.amount || 0,
        p_motivo: command.motive,
        p_observacao: command.note,
      }),
    session: (channelId) =>
      rpc("obter_sessao_whatsapp", { p_canal: channelId }),
    saveEvidence: (channelId, taskId, providerId, path, mimeType, caption) =>
      rpc("registrar_evidencia_whatsapp", {
        p_canal: channelId,
        p_tarefa: taskId,
        p_provider_id: providerId,
        p_storage_path: path,
        p_mime_type: mimeType,
        p_legenda: caption || null,
      }),
    uploadEvidence: async (path, bytes, contentType) => {
      const { error } = await supabase.storage
        .from("evidencias-tarefa")
        .upload(path, bytes, { contentType, upsert: false });
      if (error) throw error;
    },
    finishInbox: (id, status, error = null) =>
      rpc("finalizar_whatsapp_inbox", {
        p_provider_id: id,
        p_status: status,
        p_erro: error,
      }),
    claimOutbox: (limit = 20) =>
      rpc("claim_whatsapp_outbox", { p_limite: limit }),
    finishOutbox: (id, sent, providerId = null, error = null) =>
      rpc("finalizar_whatsapp_outbox", {
        p_id: id,
        p_enviado: sent,
        p_provider_id: providerId,
        p_erro: error,
      }),
  };
}
