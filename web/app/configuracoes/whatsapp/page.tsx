"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RefreshCw, Unplug } from "lucide-react";
import Shell from "../../../components/shell";
import { mensagemErro, supabase } from "../../../lib/supabase";

type Integration = {
  ativo: boolean;
  status: string;
  qr_code: string | null;
  telefone_e164: string | null;
  nome_conta: string | null;
  ultimo_erro: string | null;
  conectado_em: string | null;
};

type Queue = {
  pendentes: number;
  enviadas: number;
  erros: number;
  ultimo_erro: string | null;
};

const statusLabels: Record<string, string> = {
  desconectado: "Desconectado",
  iniciando: "Iniciando",
  aguardando_qr: "Aguardando leitura do QR Code",
  conectado: "Conectado",
  desconectando: "Desconectando",
  erro: "Atenção necessária",
};

export default function WhatsAppSettings() {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [connection, queueResult] = await Promise.all([
      supabase.from("whatsapp_integracao").select("*").eq("id", 1).single(),
      supabase.rpc("resumo_fila_whatsapp"),
    ]);
    if (connection.error) throw connection.error;
    if (queueResult.error) throw queueResult.error;
    setIntegration(connection.data as Integration);
    setQueue(queueResult.data as Queue);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await load();
        if (active) setError("");
      } catch (cause) {
        if (active) setError(mensagemErro(cause));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load]);

  async function wakeBridge() {
    const url = process.env.NEXT_PUBLIC_WHATSAPP_BRIDGE_URL;
    if (!url) return;
    try {
      await fetch(url, { mode: "no-cors", cache: "no-store" });
    } catch {
      // O status do serviço será exibido pelo banco assim que o Render iniciar.
    }
  }

  async function request(action: "conexao" | "desconexao") {
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc(
        action === "conexao"
          ? "solicitar_conexao_whatsapp"
          : "solicitar_desconexao_whatsapp",
      );
      if (rpcError) throw rpcError;
      if (action === "conexao") await wakeBridge();
      await load();
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURAÇÕES</p>
          <h1>WhatsApp da empresa</h1>
          <p className="muted">
            Uma única conta envia tarefas e recebe as respostas dos operários.
          </p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {error && <p className="alert error">{error}</p>}

      <section className="whatsapp-layout">
        <div className="panel editor">
          <div className="connection-title">
            <MessageCircle size={28} />
            <div>
              <h2>{statusLabels[integration?.status || ""] || "Carregando"}</h2>
              <p className="muted">
                {integration?.telefone_e164 || "Nenhum número conectado"}
                {integration?.nome_conta ? ` · ${integration.nome_conta}` : ""}
              </p>
            </div>
          </div>

          {integration?.qr_code && (
            <div className="qr-box">
              <img src={integration.qr_code} alt="QR Code para conectar o WhatsApp" />
              <div>
                <h2>Leia com o celular da empresa</h2>
                <p className="muted">
                  No WhatsApp, abra Aparelhos conectados, escolha Conectar aparelho
                  e aponte a câmera para este código.
                </p>
              </div>
            </div>
          )}

          {integration?.ultimo_erro && (
            <p className="alert error">{integration.ultimo_erro}</p>
          )}

          <div className="task-actions">
            {integration?.status === "conectado" || integration?.ativo ? (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => request("desconexao")}
              >
                <Unplug size={16} /> Desconectar conta
              </button>
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() => request("conexao")}
              >
                <MessageCircle size={16} /> Conectar WhatsApp
              </button>
            )}
          </div>
        </div>

        <aside className="panel editor">
          <h2>Fila de mensagens</h2>
          <div className="queue-stats">
            <span><strong>{queue?.pendentes ?? 0}</strong> pendentes</span>
            <span><strong>{queue?.enviadas ?? 0}</strong> enviadas</span>
            <span><strong>{queue?.erros ?? 0}</strong> com erro</span>
          </div>
          {queue?.ultimo_erro && (
            <p className="muted">Último erro: {queue.ultimo_erro}</p>
          )}
        </aside>
      </section>
    </Shell>
  );
}
