"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import Shell from "../../components/shell";
import type { Row } from "../../components/editor";
import { allRows, date, labels } from "../../lib/operacional";
import { supabase, mensagemErro, hoje } from "../../lib/supabase";

function shiftDay(day: string, days: number) {
  const value = new Date(`${day}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
type AgendaData = { obras: Row[]; tarefas: Row[]; frentes: Row[]; equipes: Row[]; servicos: Row[]; colaboradores: Row[] };
function Agenda() {
  const [day, setDay] = useState(hoje);
  const [data, setData] = useState<AgendaData>({ obras: [], tarefas: [], frentes: [], equipes: [], servicos: [], colaboradores: [] });
  const [workId, setWorkId] = useState("");
  const [frontId, setFrontId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [copyTask, setCopyTask] = useState<Row | null>(null);
  const [copyDate, setCopyDate] = useState("");
  const [extraWeeks, setExtraWeeks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [obras, tarefas, frentes, equipes, servicos, colaboradores] = await Promise.all([
        allRows(() => supabase.from("obras").select("id,nome,ativo").order("id")),
        allRows(() => supabase.from("tarefas").select("id,obra_id,data,turno,status,servico_id,frente_id,equipe_id,colaborador_id,compromisso_semanal_id,quantidade_meta,unidade,horas_previstas,observacao").eq("data", day).order("id")),
        allRows(() => supabase.from("frentes").select("id,obra_id,nome").order("id")),
        allRows(() => supabase.from("equipes").select("id,obra_id,nome").order("id")),
        allRows(() => supabase.from("servicos").select("id,nome").order("id")),
        allRows(() => supabase.from("colaboradores").select("id,obra_id,nome").order("id")),
      ]);
      setData({ obras, tarefas, frentes, equipes, servicos, colaboradores });
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally {
      setLoading(false);
    }
  }, [day]);
  useEffect(() => { void load(); }, [load]);
  const works = data.obras.filter((obra) => obra.ativo);
  const workIds = new Set(works.map((obra) => Number(obra.id)));
  const visible = data.tarefas.filter((task) =>
    workIds.has(Number(task.obra_id)) &&
    (!workId || task.obra_id === Number(workId)) &&
    (!frontId || task.frente_id === Number(frontId)) &&
    (!teamId || task.equipe_id === Number(teamId))
  );
  const name = (table: keyof AgendaData, id: number | null) =>
    data[table].find((row) => row.id === id)?.nome || "—";
  function startCopy(task: Row) {
    setCopyTask(task);
    setCopyDate(shiftDay(day, 1));
    setExtraWeeks(0);
    setError("");
    setNotice("");
  }
  async function duplicate() {
    if (!copyTask || !copyDate) return;
    const dates = Array.from({ length: extraWeeks + 1 }, (_, index) => shiftDay(copyDate, index * 7));
    setSaving(true);
    setError("");
    try {
      const existing = await allRows(() => supabase.from("tarefas")
        .select("id,data,servico_id,frente_id,equipe_id,colaborador_id,turno")
        .eq("obra_id", copyTask.obra_id).in("data", dates).order("id"));
      const collision = existing.find((task) =>
        dates.includes(task.data) &&
        task.servico_id === copyTask.servico_id &&
        task.frente_id === copyTask.frente_id &&
        task.equipe_id === copyTask.equipe_id &&
        task.colaborador_id === copyTask.colaborador_id &&
        task.turno === copyTask.turno
      );
      if (collision) throw new Error(`Já existe uma tarefa igual em ${date(collision.data)}. Escolha outra data.`);
      const rows = dates.map((target) => ({
        obra_id: copyTask.obra_id, data: target, turno: copyTask.turno || null,
        servico_id: copyTask.servico_id, frente_id: copyTask.frente_id,
        equipe_id: copyTask.equipe_id || null, colaborador_id: copyTask.colaborador_id || null,
        compromisso_semanal_id: null, quantidade_meta: copyTask.quantidade_meta,
        unidade: copyTask.unidade, horas_previstas: copyTask.horas_previstas || null,
        observacao: copyTask.observacao || null,
      }));
      const { error: saveError } = await supabase.from("tarefas").insert(rows);
      if (saveError) throw saveError;
      setCopyTask(null);
      setDay(copyDate);
      setNotice(`${rows.length} ${rows.length === 1 ? "tarefa criada" : "tarefas criadas"} como não iniciada${rows.length === 1 ? "" : "s"}. O vínculo com o planejamento semanal não foi copiado.`);
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link className="back" href="/obras"><ArrowLeft size={16} /> Minhas obras</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ROTINA DE PRODUÇÃO</p>
          <h1>Agenda diária</h1>
          <p className="muted">Tarefas por dia, obra, frente e equipe.</p>
        </div>
        <button className="secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> Atualizar</button>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert success" role="status">{notice}</p>}
      <div className="filters agenda-controls">
        <button className="secondary" aria-label="Dia anterior" onClick={() => setDay(shiftDay(day, -1))}><ChevronLeft size={18} /></button>
        <label>Data <input type="date" value={day} onChange={(event) => setDay(event.target.value || hoje())} /></label>
        <button className="secondary" aria-label="Dia seguinte" onClick={() => setDay(shiftDay(day, 1))}><ChevronRight size={18} /></button>
        <button className="secondary" onClick={() => setDay(hoje())}>Hoje</button>
      </div>
      <div className="filters agenda-controls">
        <label>Obra
          <select value={workId} onChange={(event) => { setWorkId(event.target.value); setFrontId(""); setTeamId(""); }}>
            <option value="">Todas as obras</option>
            {works.map((obra) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
          </select>
        </label>
        <label>Frente
          <select value={frontId} onChange={(event) => setFrontId(event.target.value)}>
            <option value="">Todas as frentes</option>
            {data.frentes.filter((front) => !workId || front.obra_id === Number(workId)).map((front) =>
              <option key={front.id} value={front.id}>{front.nome}</option>)}
          </select>
        </label>
        <label>Equipe
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="">Todas as equipes</option>
            {data.equipes.filter((team) => !workId || team.obra_id === Number(workId)).map((team) =>
              <option key={team.id} value={team.id}>{team.nome}</option>)}
          </select>
        </label>
      </div>
      {copyTask && <section className="panel editor agenda-copy">
        <div className="section-heading"><h2>Duplicar tarefa</h2><button className="secondary" onClick={() => setCopyTask(null)} disabled={saving}>Cancelar</button></div>
        <p className="muted">{name("servicos", copyTask.servico_id)} · {name("obras", copyTask.obra_id)}. Cada cópia começa como não iniciada e fica fora do planejamento semanal.</p>
        <div className="filters agenda-controls">
          <label>Primeira data <input type="date" value={copyDate} onChange={(event) => setCopyDate(event.target.value)} required /></label>
          <label>Repetição semanal
            <select value={extraWeeks} onChange={(event) => setExtraWeeks(Number(event.target.value))}>
              <option value={0}>Somente esta data</option>
              {[1, 2, 3, 4].map((count) => <option key={count} value={count}>Mais {count} {count === 1 ? "semana" : "semanas"}</option>)}
            </select>
          </label>
          <button className="primary" onClick={duplicate} disabled={saving || !copyDate}>{saving ? "Criando…" : "Criar cópias"}</button>
        </div>
      </section>}
      {loading ? <p>Carregando agenda…</p> : visible.length === 0 ? (
        <div className="empty"><CalendarDays size={40} /><h2>Nenhuma tarefa em {date(day)}</h2><p>Escolha outra data ou ajuste os filtros. As tarefas são cadastradas dentro de cada obra.</p></div>
      ) : (
        <div className="agenda-list">
          <p className="muted">{visible.length} {visible.length === 1 ? "tarefa" : "tarefas"} em {date(day)}</p>
          {visible.map((task) => <article className="panel agenda-item" key={task.id}>
            <div className="agenda-head">
              <div>
                <small>{name("obras", task.obra_id)} · {task.turno || "Dia inteiro"}</small>
                <h2>{name("servicos", task.servico_id)}</h2>
                <p className="muted">{name("frentes", task.frente_id)} · {task.equipe_id ? name("equipes", task.equipe_id) : name("colaboradores", task.colaborador_id)}</p>
              </div>
              <span className={`status ${task.status === "concluida" ? "green" : ""}`}>{labels[task.status] || task.status}</span>
            </div>
            <p className="muted">Meta: {task.quantidade_meta} {task.unidade}{task.observacao ? ` · ${task.observacao}` : ""}</p>
            <div className="task-actions">
              <Link className="secondary" href={`/obras/${task.obra_id}?tarefa=${task.id}`}>Abrir tarefa</Link>
              <button className="secondary" onClick={() => startCopy(task)}>Duplicar</button>
            </div>
          </article>)}
        </div>
      )}
    </>
  );
}
export default function Page() {
  return <Shell><Agenda /></Shell>;
}
