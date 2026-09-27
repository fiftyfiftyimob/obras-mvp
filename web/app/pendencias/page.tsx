"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, RefreshCw } from "lucide-react";
import Shell from "../../components/shell";
import { allRows, date } from "../../lib/operacional";
import { supabase, mensagemErro, hoje } from "../../lib/supabase";

type Item = {
  key: string;
  kind: "validacao" | "bloqueio" | "atraso" | "rdo";
  obraId: number;
  obra: string;
  data: string;
  title: string;
  detail: string;
  href: string;
};
const kinds = [
  ["todos", "Todas"],
  ["validacao", "Aguardando aprovação"],
  ["bloqueio", "Impedimentos"],
  ["atraso", "Atrasadas"],
  ["rdo", "RDOs pendentes"],
] as const;
const kindLabel: Record<Item["kind"], string> = {
  validacao: "Aguardando aprovação",
  bloqueio: "Impedimento",
  atraso: "Atrasada",
  rdo: "RDO pendente",
};

function Pending() {
  const [items, setItems] = useState<Item[]>([]);
  const [works, setWorks] = useState<{ id: number; nome: string }[]>([]);
  const [kind, setKind] = useState("todos");
  const [workId, setWorkId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [obras, tarefas, rdos, servicos, frentes] = await Promise.all([
        allRows(() => supabase.from("obras").select("id,nome,ativo").order("id")),
        allRows(() => supabase.from("tarefas").select("id,obra_id,data,status,servico_id,frente_id,observacao").order("id")),
        allRows(() => supabase.from("rdos").select("id,obra_id,data").order("id")),
        allRows(() => supabase.from("servicos").select("id,nome").order("id")),
        allRows(() => supabase.from("frentes").select("id,obra_id,nome").order("id")),
      ]);
      const active = obras.filter((obra) => obra.ativo);
      const byWork = new Map(active.map((obra) => [Number(obra.id), String(obra.nome)] as const));
      const byService = new Map(servicos.map((service) => [Number(service.id), String(service.nome)] as const));
      const byFront = new Map(frentes.map((front) => [Number(front.id), String(front.nome)] as const));
      const existingRdos = new Set(rdos.map((rdo) => `${rdo.obra_id}:${rdo.data}`));
      const pendingDates = new Set<string>();
      const today = hoje();
      const result: Item[] = [];
      for (const task of tarefas) {
        const obraId = Number(task.obra_id);
        const obra = byWork.get(obraId);
        if (!obra) continue;
        const day = String(task.data);
        if (day <= today) pendingDates.add(`${obraId}:${day}`);
        const taskKind: Item["kind"] | null =
          task.status === "aguardando_validacao" ? "validacao" :
          task.status === "bloqueada" ? "bloqueio" :
          day < today && task.status !== "concluida" ? "atraso" : null;
        if (!taskKind) continue;
        const front = byFront.get(Number(task.frente_id));
        result.push({
          key: `task:${task.id}`, kind: taskKind, obraId, obra, data: day,
          title: byService.get(Number(task.servico_id)) || "Serviço",
          detail: [front, task.observacao].filter(Boolean).join(" · "),
          href: `/obras/${obraId}?tarefa=${task.id}`,
        });
      }
      for (const key of pendingDates) {
        if (existingRdos.has(key)) continue;
        const [work, day] = key.split(":");
        const obraId = Number(work);
        result.push({
          key: `rdo:${key}`, kind: "rdo", obraId,
          obra: byWork.get(obraId) || "Obra", data: day,
          title: "Diário de obra não registrado",
          detail: "Há tarefas programadas para esta data.",
          href: `/obras/${obraId}?novo_rdo=${day}`,
        });
      }
      result.sort((a, b) => a.data.localeCompare(b.data) || a.obra.localeCompare(b.obra));
      setWorks(active.map((obra) => ({ id: Number(obra.id), nome: String(obra.nome) })));
      setItems(result);
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = items.filter((item) =>
    (kind === "todos" || item.kind === kind) &&
    (!workId || item.obraId === Number(workId))
  );
  return (
    <>
      <Link className="back" href="/obras"><ArrowLeft size={16} /> Minhas obras</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TODAS AS OBRAS</p>
          <h1>Pendências</h1>
          <p className="muted">Acompanhe o que precisa de ação e abra o registro correspondente.</p>
        </div>
        <button className="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {error && <p className="alert error" role="alert">{error} <button onClick={load}>Tentar novamente</button></p>}
      {!error && <>
        <div className="filters pending-filters">
          <label>Tipo
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {kinds.map(([value, label]) => <option key={value} value={value}>{label} ({value === "todos" ? items.length : items.filter((item) => item.kind === value).length})</option>)}
            </select>
          </label>
          <label>Obra
            <select value={workId} onChange={(event) => setWorkId(event.target.value)}>
              <option value="">Todas as obras</option>
              {works.map((obra) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
            </select>
          </label>
        </div>
        {loading ? <p>Carregando pendências…</p> :
          visible.length === 0 ? (
            <div className="empty">
              <ClipboardList size={40} />
              <h2>Nenhuma pendência encontrada</h2>
              <p>{items.length ? "Ajuste os filtros para ver outros registros." : "As tarefas e os diários que pedirem atenção aparecerão aqui."}</p>
            </div>
          ) : (
            <div className="pending-list">
              {visible.map((item) => (
                <article className="panel pending-item" key={item.key}>
                  <div>
                    <span className="status">{kindLabel[item.kind]}</span>
                    <h2>{item.title}</h2>
                    <p className="muted">{item.obra} · {date(item.data)}{item.detail ? ` · ${item.detail}` : ""}</p>
                  </div>
                  <Link className="secondary" href={item.href}>{item.kind === "rdo" ? "Abrir diário" : "Abrir tarefa"}</Link>
                </article>
              ))}
            </div>
          )}
      </>}
    </>
  );
}
export default function Page() {
  return <Shell><Pending /></Shell>;
}
