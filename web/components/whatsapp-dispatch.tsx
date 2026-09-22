"use client";

import { useMemo, useState } from "react";
import { ExternalLink, MessageCircle, X } from "lucide-react";
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
  const recipients = useMemo(() => recipientsFor(data, task), [data, task]);
  const prepared = recipients.map((worker) => {
    const phone = whatsappPhone(worker.telefone);
    const message = messageFor(worker, task, data, obraNome);
    return {
      worker,
      url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "",
    };
  });
  const available = prepared.filter((item) => item.url);

  function markOpened(id: number) {
    setOpened((current) => current.includes(id) ? current : [...current, id]);
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

      {available.length > 1 && (
        <div className="task-actions whatsapp-bulk-action">
          <button className="primary" onClick={openAll}>
            <MessageCircle size={17} /> Abrir todos os rascunhos
          </button>
          <small className="muted">
            No celular, prefira abrir um por vez. No computador, permita pop-ups.
          </small>
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
