"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, X } from "lucide-react";
import type { Row } from "./editor";
import type { Data } from "../lib/operacional";
import { date, lookup } from "../lib/operacional";

function whatsappPhone(value?: string | null) {
  const original = String(value || "").trim();
  let digits = original.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!original.startsWith("+") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return digits.length >= 12 && digits.length <= 15 ? digits : "";
}

function recipientsFor(data: Data, task: Row) {
  const ids = new Set<number>();
  if (task.colaborador_id) ids.add(Number(task.colaborador_id));
  if (task.equipe_id) {
    data.equipe_colaboradores
      .filter(
        (membership) =>
          membership.equipe_id === task.equipe_id &&
          membership.ativo !== false &&
          membership.data_inicio <= task.data &&
          (!membership.data_fim || membership.data_fim >= task.data),
      )
      .forEach((membership) => ids.add(Number(membership.colaborador_id)));
  }
  return data.colaboradores.filter(
    (collaborator) => ids.has(Number(collaborator.id)) && collaborator.ativo !== false,
  );
}

function messageTemplateFor(task: Row, data: Data, obraNome: string) {
  const lines = [
    "Olá, {{nome}}!",
    "",
    "Sua programação para " + date(task.data) + " na obra " + obraNome + ":",
    "Frente: " + lookup(data, "frentes", task.frente_id),
    "Serviço: " + lookup(data, "servicos", task.servico_id),
  ];
  if (task.equipe_id) lines.push("Equipe: " + lookup(data, "equipes", task.equipe_id));
  if (task.turno) lines.push("Turno: " + task.turno);
  lines.push("Meta do dia: " + task.quantidade_meta + " " + task.unidade);
  if (task.observacao) lines.push("Orientações: " + task.observacao);
  lines.push("", "Por favor, confirme o recebimento desta programação.");
  return lines.join("\n");
}

function messageFor(worker: Row, task: Row, data: Data, obraNome: string) {
  const lines = [
    `Olá, ${worker.nome}!`,
    "",
    `Sua programação para ${date(task.data)} na obra ${obraNome}:`,
    `Frente: ${lookup(data, "frentes", task.frente_id)}`,
    `Serviço: ${lookup(data, "servicos", task.servico_id)}`,
  ];
  if (task.equipe_id) lines.push(`Equipe: ${lookup(data, "equipes", task.equipe_id)}`);
  if (task.turno) lines.push(`Turno: ${task.turno}`);
  lines.push(`Meta do dia: ${task.quantidade_meta} ${task.unidade}`);
  if (task.observacao) lines.push(`Orientações: ${task.observacao}`);
  lines.push("", "Por favor, confirme o recebimento desta programação.");
  return lines.join("\n");
}

export default function WhatsAppDispatch({ task, data, obraNome, onClose }: {
  task: Row;
  data: Data;
  obraNome: string;
  onClose: () => void;
}) {
  const [opened, setOpened] = useState<number[]>([]);
  const [popupNotice, setPopupNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewWorkerId, setPreviewWorkerId] = useState<number | null>(null);
  const [messageTemplate, setMessageTemplate] = useState("");
  const recipients = useMemo(() => recipientsFor(data, task), [data, task]);
  useEffect(() => {
    setMessageTemplate(messageTemplateFor(task, data, obraNome));
    setPreviewWorkerId(null);
    setCopied(false);
  }, [task.id, obraNome]);

  const previewWorker = recipients.find((worker) => Number(worker.id) === previewWorkerId) || recipients[0];
  const previewMessage = messageTemplate.replace(/\\{\\{nome\\}\\}/g, previewWorker?.nome || "Nome");
  const prepared = recipients.map((worker) => {
    const phone = whatsappPhone(worker.telefone);
    const message = messageTemplate
      ? messageTemplate.replace(/\\{\\{nome\\}\\}/g, worker.nome)
      : messageFor(worker, task, data, obraNome);
    return {
      worker,
      url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "",
    };
  });
  const available = prepared.filter((item) => item.url);
  const pending = available.filter((item) => !opened.includes(Number(item.worker.id)));
  const nextRecipient = pending[0];

  function markOpened(id: number) {
    setOpened((current) => current.includes(id) ? current : [...current, id]);
  }

  async function copyPreview() {
    if (!previewMessage) return;
    try {
      await navigator.clipboard.writeText(previewMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setPopupNotice(true);
    }
  }

  function openNext() {
    if (!nextRecipient) return;
    window.open(nextRecipient.url, "_blank", "noopener,noreferrer");
    markOpened(Number(nextRecipient.worker.id));
  }

  function openAll() {
    available.forEach((item) => {
      window.open(item.url, "_blank", "noopener,noreferrer");
      markOpened(Number(item.worker.id));
    });
    setPopupNotice(true);
  }

  return (
    <section className="panel whatsapp-dispatch" aria-label="Rascunhos do WhatsApp">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ENVIO MANUAL</p>
          <h2>{lookup(data, "servicos", task.servico_id)} · {lookup(data, "frentes", task.frente_id)}</h2>
          <p className="muted">
            {date(task.data)} · {available.length} de {recipients.length} com telefone válido
          </p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar envios">
          <X size={20} />
        </button>
      </div>

      <p className="notice">
        Cada botão abre uma conversa com a mensagem preenchida. Confira o texto e
        toque em Enviar no WhatsApp; o sistema não envia nada automaticamente.
      </p>

      {recipients.length > 0 && (
        <div className="panel editor">
          <div className="section-heading">
            <div>
              <h3>Mensagem editável</h3>
              <p className="muted">Use <code>&#123;&#123;nome&#125;&#125;</code> para personalizar automaticamente o nome de cada funcionário.</p>
            </div>
            <button className="secondary" type="button" onClick={copyPreview}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copiada" : "Copiar mensagem"}
            </button>
          </div>
          <label>
            Funcionário para visualizar
            <select value={previewWorker?.id || ""} onChange={(event) => setPreviewWorkerId(Number(event.target.value))}>
              {recipients.map((worker) => <option key={worker.id} value={worker.id}>{worker.nome}</option>)}
            </select>
          </label>
          <label>
            Texto dos rascunhos
            <textarea value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} rows={12} />
          </label>
          <p className="muted">Prévia para {previewWorker?.nome || "funcionário selecionado"}:</p>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{previewMessage}</pre>
        </div>
      )}

      {available.length > 0 && (
        <div className="task-actions whatsapp-bulk-action">
          <button className="primary" onClick={openNext} disabled={!nextRecipient}>
            <MessageCircle size={17} />
            {nextRecipient
              ? "Abrir próximo: " + nextRecipient.worker.nome
              : "Todos os rascunhos foram abertos"}
          </button>
          <small className="muted">
            {opened.filter((id) => available.some((item) => Number(item.worker.id) === id)).length}
            {" de " + available.length + " rascunhos abertos. Envie cada mensagem manualmente no WhatsApp."}
          </small>
          {available.length > 1 && (
            <button className="secondary" onClick={openAll}>
              Abrir todos no computador
            </button>
          )}
        </div>
      )}

      {popupNotice && (
        <p className="alert success" role="status">
          Rascunhos solicitados. Se alguma aba não abriu, use o botão individual.
        </p>
      )}

      <div className="whatsapp-recipient-list">
        {prepared.map(({ worker, url }) => {
          const wasOpened = opened.includes(Number(worker.id));
          return (
            <div className="whatsapp-recipient" key={worker.id}>
              <div>
                <strong>{worker.nome}</strong>
                <small>{worker.funcao || "Colaborador"} · {worker.telefone || "Telefone não cadastrado"}</small>
              </div>
              {url ? (
                <a
                  className={wasOpened ? "secondary" : "primary"}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markOpened(Number(worker.id))}
                >
                  <ExternalLink size={16} />
                  {wasOpened ? "Abrir novamente" : "Abrir WhatsApp"}
                </a>
              ) : (
                <span className="status">Corrija o telefone</span>
              )}
            </div>
          );
        })}
      </div>

      {recipients.length === 0 && (
        <div className="empty compact-empty">
          <h3>Nenhum integrante encontrado</h3>
          <p>Vincule colaboradores ativos à equipe com início anterior à data da tarefa.</p>
        </div>
      )}
    </section>
  );
}
