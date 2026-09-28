"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Shell from "./shell";
import { date, labels } from "../lib/operacional";
import { supabase, mensagemErro } from "../lib/supabase";
type Task = { id: number; data: string; turno: string | null; status: string; servico: string; frente: string; equipe: string | null; quantidade_meta: number; quantidade_realizada: number; unidade: string; observacao: string | null };
type Item = { id: number; frente: string; servico: string; equipe: string | null; quantidade_realizada: number; unidade: string; observacao: string | null };
type Rdo = { id: number; data: string; clima: string | null; observacao_geral: string | null; itens: Item[] };
type Detail = { obra: { id: number; nome: string; endereco: string | null; cidade: string | null; estado: string | null; papel: "cliente" | "encarregado" }; tarefas: Task[]; rdos: Rdo[] };
const actions: Record<string, [string, string][]> = {
  nao_iniciada: [["inicio","Iniciar"],["impedimento","Registrar impedimento"]],
  em_execucao: [["producao","Apontar produção"],["pausa","Pausar"],["impedimento","Registrar impedimento"],["solicitacao_conclusao","Solicitar conclusão"]],
  pausada: [["retomada","Retomar"],["impedimento","Registrar impedimento"]],
  bloqueada: [["retomada","Retomar"]],
};
const motives = [["falta_material","Falta de material"],["falta_ferramenta","Falta de ferramenta"],["frente_ocupada","Frente ocupada"],["projeto_pendente","Projeto pendente"],["chuva","Chuva"],["espera_equipe","Espera de equipe"],["seguranca","Segurança"],["outro","Outro"]];
function SharedDetail({ id }: { id: number }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"tarefas" | "rdos">("tarefas");
  const [action, setAction] = useState<{ task: Task; tipo: string } | null>(null);
  const [quantity, setQuantity] = useState("0");
  const [motive, setMotive] = useState("");
  const [observation, setObservation] = useState("");
  const load = useCallback(async () => {
    setError("");
    const result = await supabase.rpc("detalhe_obra_compartilhada", { p_obra: id });
    if (result.error) setError(mensagemErro(result.error));
    else setData(result.data as Detail);
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  function open(task: Task, tipo: string) {
    setAction({ task, tipo }); setQuantity("0"); setMotive(""); setObservation(""); setNotice("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount < 0 || (action.tipo === "producao" && amount <= 0)) { setError("Informe uma quantidade válida."); return; }
    if (action.tipo === "impedimento" && !motive) { setError("Informe o motivo do impedimento."); return; }
    setBusy(true); setError("");
    const result = await supabase.rpc("registrar_evolucao_compartilhada", {
      p_tarefa: action.task.id, p_tipo: action.tipo, p_quantidade: amount,
      p_motivo: action.tipo === "impedimento" ? motive : null, p_observacao: observation.trim() || null,
    });
    if (result.error) setError(mensagemErro(result.error));
    else { setAction(null); setNotice("Apontamento registrado."); await load(); }
    setBusy(false);
  }
  return <>
    <Link className="back" href="/compartilhadas"><ArrowLeft size={16} /> Obras compartilhadas</Link>
    <div className="page-heading"><div><p className="eyebrow">OBRA COMPARTILHADA</p><h1>{data?.obra.nome || "Carregando obra…"}</h1><p className="muted">{[data?.obra.endereco,data?.obra.cidade,data?.obra.estado].filter(Boolean).join(" · ")}</p></div><button className="secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> Atualizar</button></div>
    {error && <p className="alert error" role="alert">{error} <button onClick={load}>Tentar novamente</button></p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {loading ? <p>Carregando…</p> : data && <>
      <p className="notice">{data.obra.papel === "cliente" ? "Acesso de consulta: acompanhe tarefas e diários desta obra." : "Acesso de encarregado: registre a execução e solicite a validação ao gestor."}</p>
      <nav className="tabs" aria-label="Áreas compartilhadas"><button className={tab === "tarefas" ? "active" : ""} onClick={() => setTab("tarefas")}>Tarefas</button><button className={tab === "rdos" ? "active" : ""} onClick={() => setTab("rdos")}>Diário de obra</button></nav>
      {tab === "tarefas" && <div className="shared-list">{data.tarefas.length === 0 ? <div className="empty"><h2>Nenhuma tarefa</h2></div> : data.tarefas.map(task => <article className="panel editor" key={task.id}>
        <div className="section-heading"><div><small>{date(task.data)} · {task.turno || "Dia inteiro"}</small><h2>{task.servico}</h2><p className="muted">{task.frente}{task.equipe ? ` · ${task.equipe}` : ""}</p></div><span className={`status ${task.status === "concluida" ? "green" : ""}`}>{labels[task.status] || task.status}</span></div>
        <p>{task.quantidade_realizada} / {task.quantidade_meta} {task.unidade} executados</p>{task.observacao && <p className="muted">{task.observacao}</p>}
        {data.obra.papel === "encarregado" && <div className="task-actions">{(actions[task.status] || []).map(([tipo,label]) => <button className={tipo === "inicio" || tipo === "retomada" ? "primary" : "secondary"} key={tipo} onClick={() => open(task,tipo)}>{label}</button>)}</div>}
      </article>)}</div>}
      {tab === "rdos" && <div className="shared-list">{data.rdos.length === 0 ? <div className="empty"><h2>Nenhum diário registrado</h2></div> : data.rdos.map(rdo => <article className="panel editor" key={rdo.id}><h2>RDO · {date(rdo.data)}</h2><p className="muted">Clima: {rdo.clima || "Não informado"}</p>{rdo.observacao_geral && <p>{rdo.observacao_geral}</p>}<ul className="shared-items">{rdo.itens.map(item => <li key={item.id}><strong>{item.servico}</strong> · {item.frente}{item.equipe ? ` · ${item.equipe}` : ""} · {item.quantidade_realizada} {item.unidade}{item.observacao ? ` · ${item.observacao}` : ""}</li>)}</ul>{rdo.itens.length === 0 && <p className="muted">Sem itens registrados.</p>}</article>)}</div>}
    </>}
    {action && <form className="panel editor shared-action" onSubmit={submit}><h2>{actions[action.task.status]?.find(([tipo]) => tipo === action.tipo)?.[1]} · {action.task.servico}</h2>
      {["pausa","impedimento","producao","solicitacao_conclusao"].includes(action.tipo) && <label>Quantidade executada neste apontamento ({action.task.unidade})<input type="number" min="0" step="any" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>}
      {action.tipo === "impedimento" && <label>Motivo<select required value={motive} onChange={e => setMotive(e.target.value)}><option value="">Selecione</option>{motives.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <label>Observação<textarea value={observation} onChange={e => setObservation(e.target.value)} /></label>
      <div className="task-actions"><button className="primary" disabled={busy}>Registrar</button><button className="secondary" type="button" disabled={busy} onClick={() => setAction(null)}>Cancelar</button></div>
    </form>}
  </>;
}
export default function SharedWorkDetail({ id }: { id: number }) { return <Shell><SharedDetail id={id} /></Shell>; }
