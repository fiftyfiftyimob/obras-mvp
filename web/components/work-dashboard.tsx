"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { date, labels, type Data } from "../lib/operacional";
import { localDay, makeDashboard, METHODOLOGY, type DashboardFilter, type DashboardModel } from "../lib/dashboard-obra";
import { exportDashboard } from "../lib/dashboard-export";
import styles from "./work-dashboard.module.css";
import DashboardSuprimentos from "./dashboard-suprimentos";

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmt = (v: number | null) => v === null ? "—" : number.format(v);
const percent = (v: number | null) => v === null ? "—" : number.format(v) + "%";
const statusLabel = (s: string) => labels[s] || s;
type Breakdown = DashboardModel["frentes"];

function Curve({ series }: { series: DashboardModel["series"] }) {
  const points = series.filter(r => r.previsto_pct !== null);
  if (!series.length) return <p className="muted">Sem planejamento ou lançamentos neste recorte.</p>;
  const left = 54, top = 16, width = 650, height = 190;
  const x = (i: number) => left + width * i / Math.max(points.length - 1, 1);
  const y = (value: number) => top + height * (1 - value / 100);
  const lines = [
    { key: "previsto_pct", label: "Previsto", color: "#536988", dash: "6 5" },
    { key: "executado_pct", label: "Executado", color: "#17644c", dash: undefined },
  ] as const;
  const tickStep = Math.max(1, Math.ceil(points.length / 7));
  return <>
    {!points.length ? <p className="muted">Cadastre metas para gerar a curva de avanço.</p> : <>
    <div className={styles.legend}>{lines.map(line => <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>)}</div>
    <div className={styles.curve}>
      <svg viewBox="0 0 720 250" role="img" aria-label="Curva mensal de avanço previsto e executado. Os valores estão na tabela abaixo.">
        {[0, 25, 50, 75, 100].map(value => <g key={value}>
          <line x1={left} y1={y(value)} x2={left + width} y2={y(value)} stroke="#dce5df" />
          <text x={left - 8} y={y(value) + 4} textAnchor="end">{value}%</text>
        </g>)}
        {points.map((p, i) => i % tickStep === 0 && <text key={p.mes} x={x(i)} y={231} textAnchor="middle">{p.mes.slice(5)}/{p.mes.slice(2,4)}</text>)}
        {lines.map(line => {
          const values = points.flatMap((p, i) => { const value = p[line.key]; return value === null ? [] : [{ i, month: p.mes, value }]; });
          return <g key={line.key}>
            <polyline points={values.map(v => x(v.i) + "," + y(v.value)).join(" ")} fill="none" stroke={line.color} strokeWidth="3" strokeDasharray={line.dash} />
            {values.map(v => <circle key={v.month} cx={x(v.i)} cy={y(v.value)} r={points.length < 31 ? 4 : 2} fill={line.color}>
              <title>{line.label} · {v.month}: {percent(v.value)}</title>
            </circle>)}
          </g>;
        })}
      </svg>
    </div>
    </>}
    <details className={styles.details}><summary>Ver série mensal em tabela</summary>
      <div className={styles.scroll}><table><thead><tr><th>Mês</th><th>Previsto acumulado</th><th>Executado acumulado</th><th>Apontamentos</th><th>Impedimentos</th><th>Diários</th></tr></thead>
        <tbody>{series.map(r => <tr key={r.mes}><th scope="row">{r.mes}</th><td>{percent(r.previsto_pct)}</td><td>{percent(r.executado_pct)}</td>
          <td>{r.apontamentos}</td>
          <td>{r.impedimentos}</td><td>{r.diarios}</td></tr>)}</tbody>
      </table></div>
    </details>
  </>;
}

function BreakdownCard({ title, rows, quantities = false, people = false }: { title: string; rows: Breakdown; quantities?: boolean; people?: boolean }) {
  const sample = rows.filter(r => r.percentual !== null).slice().sort((a,b) => (b.percentual ?? 0) - (a.percentual ?? 0)).slice(0, 10);
  return <section className="panel editor">
    <h3>{title}</h3>
    {sample.length > 0 ? <div className={styles.bars}>{sample.map(r => <div key={r.id}>
      <div><span>{r.nome}{r.unidade && " · " + r.unidade}</span><strong>{percent(r.percentual)}</strong></div>
      <progress aria-label={r.nome} max={100} value={r.percentual ?? 0} />
    </div>)}</div> : <p className="muted">Sem metas com quantidade neste recorte.</p>}
    {rows.length > 0 && <details className={styles.details}><summary>Ver tabela completa ({rows.length})</summary>
      <div className={styles.scroll}><table><thead><tr><th>Área</th>{quantities && <><th>Unidade</th><th>Meta total</th><th>Executado</th></>}
        <th>Avanço</th><th>Previsto até a data</th><th>Metas vencidas</th>{people && <th>Pessoas na data</th>}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><th scope="row">{r.nome}</th>
          {quantities && <><td>{r.unidade}</td><td>{fmt(r.meta)}</td><td>{fmt(r.executado)}</td></>}
          <td>{percent(r.percentual)}</td><td>{percent(r.previsto_pct)}</td><td>{r.metas_vencidas}</td>{people && <td>{r.ativos}</td>}
        </tr>)}</tbody>
      </table></div>
    </details>}
  </section>;
}

function Distribution({ title, rows, translate = false, warm = false }: { title: string; rows: { nome: string; total: number }[]; translate?: boolean; warm?: boolean }) {
  const total = rows.reduce((acc, row) => acc + row.total, 0);
  return <section className={"panel editor " + (warm ? styles.warm : "")}>
    <h3>{title}</h3>
    {total ? <div className={styles.bars}>{rows.map(r => <div key={r.nome}>
      <div><span>{translate ? statusLabel(r.nome) : r.nome}</span><strong>{r.total}</strong></div>
      <progress aria-label={translate ? statusLabel(r.nome) : r.nome} max={total} value={r.total} />
    </div>)}</div> : <p className="muted">Sem registros neste recorte.</p>}
  </section>;
}

export default function WorkDashboard({ data, obraId, obraNome, accessRole }: { data: Data; obraId: number; obraNome: string; accessRole: string }) {
  const [now] = useState(() => Date.now());
  const today = localDay(now);
  const [filter, setFilter] = useState<DashboardFilter>({ ate: today, origem: "todos", frente: "", servico: "", equipe: "" });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const model = useMemo(() => makeDashboard(data, filter, today, now), [data, filter, today, now]);
  const counts = model.metadados;
  const usedServices = useMemo(() => new Set(
    [...(data.tarefas || []), ...(data.compromissos_semanais || []), ...(data.rdos_itens || [])].map(r => String(r.servico_id)),
  ), [data]);
  const lastSimulatedDate = useMemo(() => (data.tarefas || []).reduce((latest, r) =>
    (r.simulacao || String(r.observacao || "").startsWith("SIMULACAO ANUAL 2026-2027")) && r.data > latest ? String(r.data) : latest, ""), [data]);
  const delta = model.percentual === null || model.previsto === null ? null : model.percentual - model.previsto;
  const pick = (key: "frente" | "servico" | "equipe", title: string, options: Data[string]) =>
    <label>{title}<select value={filter[key]} onChange={e => setFilter(f => ({ ...f, [key]: e.target.value }))}>
      <option value="">Todos</option>
      {options.slice().sort((a,b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
    </select></label>;
  async function download() {
    setExporting(true); setError("");
    try { await exportDashboard(model, data, filter, obraId, obraNome); }
    catch { setError("Não foi possível gerar a planilha. Tente novamente."); }
    finally { setExporting(false); }
  }
  return <div className={styles.dashboard}>
    <section className={"panel editor " + styles.intro}>
      <div className="section-heading"><div><p className="eyebrow">EVOLUÇÃO DA OBRA</p><h2>Dashboard</h2>
        <p className="muted">{obraNome} · Posição em {date(filter.ate)}</p></div>
        <button className="secondary" type="button" onClick={download} disabled={exporting}><Download size={17} aria-hidden="true" />{exporting ? "Gerando planilha…" : "Exportar Excel / Power BI"}</button>
      </div>
      {error && <p role="alert" className="alert error">{error}</p>}
      <div className={styles.filters}>
        <label>Data de referência<input type="date" min="1900-01-01" max="9999-12-31" value={filter.ate} onChange={e => {
          const next = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(next)) setFilter(f => ({ ...f, ate: next }));
        }} /></label>
        <label>Origem<select value={filter.origem} onChange={e => setFilter(f => ({ ...f, origem: e.target.value as DashboardFilter["origem"] }))}>
          <option value="todos">Todas as origens</option><option value="operacao">Operação</option><option value="simulacao">Simulação anual</option>
        </select></label>
        {pick("frente", "Frente / etapa", data.frentes || [])}
        {pick("servico", "Serviço", (data.servicos || []).filter(r => usedServices.has(String(r.id))))}
        {pick("equipe", "Equipe", data.equipes || [])}
      </div>
      {lastSimulatedDate && filter.origem !== "operacao" && <p className={styles.simulation}>
        Este recorte inclui dados de teste. <button type="button" className="inline-link" onClick={() =>
          setFilter({ ate: lastSimulatedDate, origem: "simulacao", frente: "", servico: "", equipe: "" })}>Ver simulação completa</button>
      </p>}
      {filter.ate > today && <p className="notice">Data futura. O executado usa apenas lançamentos que já existem até essa data.</p>}
    </section>

    <div className={styles.kpis}>
      <div className={"panel " + styles.mainKpi}><span>Avanço físico estimado</span><strong>{percent(model.percentual)}</strong>
        {model.percentual !== null && <progress aria-label="Avanço físico estimado" max={100} value={model.percentual} />}
        <small>{counts.metas ? counts.metas + " metas no escopo" : "Sem metas cadastradas neste recorte"}</small></div>
      <div className="panel stat"><span>Previsto até a data</span><strong>{percent(model.previsto)}</strong>
        <small>{delta === null ? "Sem base de comparação" : (delta > 0 ? "+" : "") + fmt(delta) + " p.p. de diferença"}</small></div>
      <div className="panel stat"><span>Tarefas concluídas</span><strong>{counts.concluidas} / {counts.tarefas}</strong><small>{counts.bloqueadas} bloqueadas na data</small></div>
      <div className="panel stat"><span>Metas vencidas</span><strong>{counts.vencidas}</strong><small>{counts.compromissos} compromissos no escopo total</small></div>
      <div className="panel stat"><span>Horas registradas</span><strong>{fmt(counts.horas_registradas)} h</strong><small>{fmt(counts.horas_previstas)} h previstas nas tarefas até a data</small></div>
      <div className="panel stat"><span>Pessoas na data</span><strong>{counts.pessoas}</strong><small>{filter.equipe ? "Vínculos vigentes na equipe selecionada" : "Na obra, no recorte de origem"}</small></div>
      <div className="panel stat"><span>Diários de obra</span><strong>{counts.diarios}</strong><small>{counts.itens_diario} itens · {counts.evidencias} evidências de tarefa</small></div>
      <div className="panel stat"><span>Apontamentos</span><strong>{counts.apontamentos}</strong><small>{model.impedimentos.reduce((n,r) => n + r.total, 0)} impedimentos no histórico</small></div>
    </div>

    <section className="panel editor"><h3>Curva de avanço mensal</h3>
      <p className="muted">O executado vai até a data de referência. A linha prevista inclui as metas futuras já cadastradas.</p>
      <Curve series={model.series} />
    </section>
    <div className={styles.grid}>
      <BreakdownCard title="Avanço por frente / etapa" rows={model.frentes} />
      <BreakdownCard title="Avanço por serviço" rows={model.servicos} quantities />
      <BreakdownCard title="Serviços dentro de cada etapa" rows={model.etapas} quantities />
      <BreakdownCard title="Avanço e composição por equipe" rows={model.equipes} people />
    </div>
    {counts.vencidas > 0 && <section className="panel editor">
      <h3>Metas vencidas abaixo do planejado</h3>
      <p className="muted">Inclui compromissos e tarefas avulsas com prazo anterior à data de referência.</p>
      <div className={styles.scroll}><table><thead><tr><th>Prazo</th><th>Frente</th><th>Serviço</th><th>Meta</th><th>Executado</th><th>Avanço</th></tr></thead>
        <tbody>{model.metas.filter(r => r.meta_vencida).sort((a,b) => a.prazo.localeCompare(b.prazo)).map(r => <tr key={r.tipo + r.id}>
          <td>{date(r.prazo)}</td><td>{data.frentes?.find(f => f.id === r.frente_id)?.nome || "—"}</td>
          <td>{data.servicos?.find(s => s.id === r.servico_id)?.nome || "—"}</td>
          <td>{fmt(r.meta)} {r.unidade}</td><td>{fmt(r.executado)} {r.unidade}</td><td>{percent(r.percentual)}</td>
        </tr>)}</tbody></table></div>
    </section>}
    <div className={styles.distributions}>
      <Distribution title="Situação das tarefas" rows={model.status} translate />
      <Distribution title="Motivos de impedimento" rows={model.impedimentos} translate warm />
      <Distribution title="Clima nos diários" rows={model.clima} />
    </div>
    <DashboardSuprimentos obraId={obraId} obraNome={obraNome} accessRole={accessRole} />
    <details className={"panel editor " + styles.details}><summary>Como o avanço é calculado</summary>
      <p>{METHODOLOGY}</p>
      <p className="muted">O percentual é uma estimativa do escopo cadastrado, sem pesos por orçamento. Alterações no planejamento recalculam o histórico. A situação e as horas usam o histórico de apontamentos disponível; a quantidade executada pode exceder a meta na tabela.</p>
    </details>
  </div>;
}
