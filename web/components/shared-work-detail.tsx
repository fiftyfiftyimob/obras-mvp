"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Shell from "./shell";
import { WorkManagement, type AccessRole } from "./work-detail";
import WorkDashboard from "./work-dashboard";
import { date, labels, formatUnit, type Data } from "../lib/operacional";
import { supabase, mensagemErro } from "../lib/supabase";
import { PendingReport, pendingReports, queueReport, discardReport, syncReports, isNetworkFailure } from "../lib/offline-reports";
type Task = { id: number; data: string; turno: string | null; status: string; servico: string; frente: string; equipe: string | null; quantidade_meta: number; quantidade_realizada: number; unidade: string; observacao: string | null };
type Item = { id: number; frente: string; servico: string; equipe: string | null; quantidade_realizada: number; unidade: string; observacao: string | null };
type Rdo = { id: number; data: string; clima: string | null; observacao_geral: string | null; itens: Item[] };
type Detail = { obra: { id: number; nome: string; endereco: string | null; cidade: string | null; estado: string | null; papel: AccessRole }; tarefas: Task[]; rdos: Rdo[] };
const MANAGEMENT_ROLES: AccessRole[] = ["administrador", "engenheiro", "supervisor", "estagiario"];
const actions: Record<string, [string, string][]> = {
  nao_iniciada: [["inicio","Iniciar"],["impedimento","Registrar impedimento"]],
  em_execucao: [["producao","Apontar produção"],["pausa","Pausar"],["impedimento","Registrar impedimento"],["solicitacao_conclusao","Solicitar conclusão"]],
  pausada: [["retomada","Retomar"],["impedimento","Registrar impedimento"]],
  bloqueada: [["retomada","Retomar"]],
};
const motives = [["falta_material","Falta de material"],["falta_ferramenta","Falta de ferramenta"],["frente_ocupada","Frente ocupada"],["projeto_pendente","Projeto pendente"],["chuva","Chuva"],["espera_equipe","Espera de equipe"],["seguranca","Segurança"],["outro","Outro"]];
function SharedDashboard({ id, nome }: { id: number; nome: string }) {
  const [dashboard, setDashboard] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setDashboard(null);
    void supabase.rpc("dashboard_obra_cliente", { p_obra: id }).then(result => {
      if (!active) return;
      if (result.error) setError(mensagemErro(result.error));
      else setDashboard(result.data as Data);
    });
    return () => { active = false; };
  }, [id, attempt]);
  if (error) return <p className="alert error" role="alert">{error} <button type="button" onClick={() => retry(n => n + 1)}>Tentar novamente</button></p>;
  return dashboard ? <WorkDashboard data={dashboard} obraId={id} obraNome={nome} accessRole="cliente" /> : <p role="status">Carregando dashboard…</p>;
}
type SharedTab = "tarefas" | "rdos" | "dashboard";
function SharedDetail({ id }: { id: number }) {
  const [data, setData] = useState<Detail | null>(null);
  const [accessRole, setAccessRole] = useState<AccessRole | null>(null);
  const [uid, setUid] = useState("");
  const [pending, setPending] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<SharedTab>("tarefas");
  const [action, setAction] = useState<{ task: Task; tipo: string } | null>(null);
  const [quantity, setQuantity] = useState("0");
  const [motive, setMotive] = useState("");
  const [observation, setObservation] = useState("");
  const load = useCallback(async () => {
    setError("");
    const access = await supabase.rpc("minhas_obras_compartilhadas");
    if (access.error) {
      setError(mensagemErro(access.error));
      setLoading(false);
      return;
    }
    const assignment = (access.data || []).find((row: { id: number }) => Number(row.id) === id);
    if (!assignment) {
      setError("Você não tem acesso a esta obra.");
      setLoading(false);
      return;
    }
    const role = assignment.papel as AccessRole;
    setAccessRole(role);
    if (MANAGEMENT_ROLES.includes(role)) {
      setLoading(false);
      return;
    }
    const result = await supabase.rpc("detalhe_obra_compartilhada", { p_obra: id });
    if (result.error) setError(mensagemErro(result.error));
    else setData(result.data as Detail);
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUid(data.user.id); });
  }, []);
  useEffect(() => {
    if (!uid) return;
    const refresh = () => setPending(pendingReports(uid).filter(row => row.obraId === id));
    refresh(); window.addEventListener("obras-pending-change", refresh);
    return () => window.removeEventListener("obras-pending-change", refresh);
  }, [uid, id]);
  function open(task: Task, tipo: string) {
    setAction({ task, tipo }); setQuantity("0"); setMotive(""); setObservation(""); setNotice("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    if (!uid) { setError("Entre novamente para guardar o apontamento."); return; }
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount < 0 || (action.tipo === "producao" && amount <= 0)) { setError("Informe uma quantidade válida."); return; }
    if (action.tipo === "impedimento" && !motive) { setError("Informe o motivo do impedimento."); return; }
    const report: PendingReport = {
      id: crypto.randomUUID(), obraId: id, tarefaId: action.task.id, tipo: action.tipo,
      quantidade: amount, motivo: action.tipo === "impedimento" ? motive : null,
      observacao: observation.trim() || null, criadoEm: new Date().toISOString(),
    };
    setBusy(true); setError(""); setNotice("");
    try {
      if (!navigator.onLine) {
        queueReport(uid, report);
        setAction(null); setNotice("Apontamento guardado neste dispositivo. Será enviado quando houver conexão.");
      } else {
        const result = await supabase.rpc("registrar_apontamento_sincronizado", {
          p_tarefa: report.tarefaId, p_tipo: report.tipo, p_quantidade: report.quantidade,
          p_motivo: report.motivo, p_observacao: report.observacao, p_chave: report.id,
        });
        if (result.error) {
          if (!isNetworkFailure(result.error)) throw result.error;
          queueReport(uid, report);
          setAction(null); setNotice("A conexão falhou. O apontamento ficou pendente neste dispositivo.");
        } else {
          setAction(null); setNotice("Apontamento registrado."); await load();
        }
      }
    } catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }
  async function retry() {
    if (!uid) return;
    setBusy(true); setError("");
    try { await syncReports(uid); await load(); }
    catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }
  if (!loading && !error && accessRole && MANAGEMENT_ROLES.includes(accessRole)) return <WorkManagement key={id} id={id} accessRole={accessRole} />;
  const sections: SharedTab[] = data?.obra.papel === "cliente" ? ["tarefas", "rdos", "dashboard"] : ["tarefas", "rdos"];
  return <>
    <Link className="back" href="/compartilhadas"><ArrowLeft size={16} /> Obras compartilhadas</Link>
    <div className="page-heading"><div><p className="eyebrow">OBRA COMPARTILHADA</p><h1>{data?.obra.nome || "Carregando obra…"}</h1><p className="muted">{[data?.obra.endereco,data?.obra.cidade,data?.obra.estado].filter(Boolean).join(" · ")}</p></div><button className="secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> Atualizar</button></div>
    {error && <p className="alert error" role="alert">{error} <button onClick={load}>Tentar novamente</button></p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {pending.length > 0 && <section className="panel editor offline-pending"><h2>Apontamentos neste dispositivo ({pending.length})</h2><p className="muted">São enviados quando a conexão voltar. Mantenha este navegador até confirmar a sincronização.</p><button className="secondary" disabled={busy || (typeof navigator !== "undefined" && !navigator.onLine)} onClick={retry}>Sincronizar agora</button><ul>{pending.map(row => <li key={row.id}><div><strong>{labels[row.tipo] || row.tipo}</strong><small>{new Date(row.criadoEm).toLocaleString("pt-BR")} · tarefa # {row.tarefaId}</small>{row.erro && <span className="alert error">{row.erro}</span>}</div><button className="secondary" disabled={busy} onClick={() => { if (window.confirm("Descartar este apontamento ainda não sincronizado?")) discardReport(uid, row.id); }}>Descartar</button></li>)}</ul></section>}
    {loading ? <p>Carregando…</p> : data && <>
      <p className="notice">{data.obra.papel === "cliente" ? "Acesso de consulta: acompanhe tarefas, diários e o dashboard desta obra." : "Acesso de encarregado: consulte as tarefas atribuídas, registre a execução e informe impedimentos."}</p>
      <div role="tablist" className="tabs shared-tabs" aria-label="Áreas compartilhadas"
        onKeyDown={(event) => {
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const at = sections.indexOf(tab);
          const next = sections[event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 :
            (at + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length];
          setTab(next);
          document.getElementById("shared-tab-" + next)?.focus();
        }}>
        <button id="shared-tab-tarefas" role="tab" aria-selected={tab === "tarefas"} aria-controls="shared-tabpanel" tabIndex={tab === "tarefas" ? 0 : -1} className={tab === "tarefas" ? "active" : ""} onClick={() => setTab("tarefas")}>Tarefas</button>
        <button id="shared-tab-rdos" role="tab" aria-selected={tab === "rdos"} aria-controls="shared-tabpanel" tabIndex={tab === "rdos" ? 0 : -1} className={tab === "rdos" ? "active" : ""} onClick={() => setTab("rdos")}>Diário de obra</button>
        {data.obra.papel === "cliente" && <button id="shared-tab-dashboard" role="tab" aria-selected={tab === "dashboard"} aria-controls="shared-tabpanel" tabIndex={tab === "dashboard" ? 0 : -1} className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>Dashboard</button>}
      </div>
      <div id="shared-tabpanel" role="tabpanel" aria-labelledby={"shared-tab-" + tab} tabIndex={0}>
      {tab === "dashboard" && data.obra.papel === "cliente" && <SharedDashboard id={id} nome={data.obra.nome} />}
      {tab === "tarefas" && <div className="shared-list">{data.tarefas.length === 0 ? <div className="empty"><h2>Nenhuma tarefa</h2></div> : data.tarefas.map(task => <article className="panel editor" key={task.id}>
        <div className="section-heading"><div><small>{date(task.data)} · {task.turno || "Dia inteiro"}</small><h2>{task.servico}</h2><p className="muted">{task.frente}{task.equipe ? ` · ${task.equipe}` : ""}</p></div><span className={`status ${task.status === "concluida" ? "green" : ""}`}>{labels[task.status] || task.status}</span></div>
        <p>{task.quantidade_realizada} / {task.quantidade_meta} {formatUnit(task.unidade)} executados</p>{task.observacao && <p className="muted">{task.observacao}</p>}
        {data.obra.papel === "encarregado" && <div className="task-actions">{(actions[task.status] || []).map(([tipo,label]) => <button className={tipo === "inicio" || tipo === "retomada" ? "primary" : "secondary"} key={tipo} onClick={() => open(task,tipo)}>{label}</button>)}</div>}
      </article>)}</div>}
      {tab === "rdos" && <div className="shared-list">{data.rdos.length === 0 ? <div className="empty"><h2>Nenhum diário registrado</h2></div> : data.rdos.map(rdo => <article className="panel editor" key={rdo.id}><h2>RDO · {date(rdo.data)}</h2><p className="muted">Clima: {rdo.clima || "Não informado"}</p>{rdo.observacao_geral && <p>{rdo.observacao_geral}</p>}<ul className="shared-items">{rdo.itens.map(item => <li key={item.id}><strong>{item.servico}</strong> · {item.frente}{item.equipe ? ` · ${item.equipe}` : ""} · {item.quantidade_realizada} {formatUnit(item.unidade)}{item.observacao ? ` · ${item.observacao}` : ""}</li>)}</ul>{rdo.itens.length === 0 && <p className="muted">Sem itens registrados.</p>}</article>)}</div>}
      </div>
    </>}
    {action && <form className="panel editor shared-action" onSubmit={submit}><h2>{actions[action.task.status]?.find(([tipo]) => tipo === action.tipo)?.[1]} · {action.task.servico}</h2>
      {["pausa","impedimento","producao","solicitacao_conclusao"].includes(action.tipo) && <label>Quantidade executada neste apontamento ({formatUnit(action.task.unidade)})<input type="number" min="0" step="any" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>}
      {action.tipo === "impedimento" && <label>Motivo<select required value={motive} onChange={e => setMotive(e.target.value)}><option value="">Selecione</option>{motives.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <label>Observação<textarea value={observation} onChange={e => setObservation(e.target.value)} /></label>
      <div className="task-actions"><button className="primary" disabled={busy}>Registrar</button><button className="secondary" type="button" disabled={busy} onClick={() => setAction(null)}>Cancelar</button></div>
    </form>}
  </>;
}
export default function SharedWorkDetail({ id }: { id: number }) { return <Shell><SharedDetail id={id} /></Shell>; }
