"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase, mensagemErro } from "../lib/supabase";
import { allRows } from "../lib/operacional";
import { localDay } from "../lib/dashboard-obra";
import { exportSupplyDashboard, makeSupplyDashboard, type SupplyData } from "../lib/dashboard-suprimentos";

const money = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const date = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR");
const keys: (keyof SupplyData)[] = [
  "materiais", "almoxarifados", "estoque_saldos", "solicitacoes_materiais",
  "fornecedores_materiais", "cotacoes_materiais", "ofertas_materiais",
  "pedidos_compra", "recebimentos_compra",
];
export default function DashboardSuprimentos({ obraId, obraNome, accessRole }: {
  obraId: number; obraNome: string; accessRole: string;
}) {
  const canView = ["administrador", "engenheiro", "supervisor", "estagiario", "encarregado"].includes(accessRole);
  const [data, setData] = useState<SupplyData | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [today] = useState(() => localDay(Date.now()));
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const pairs = await Promise.all(keys.map(async (key) => {
        const rows = await allRows(() => supabase.from(key).select("*").eq("obra_id", obraId).order("id"));
        return [key, rows] as const;
      }));
      setData(Object.fromEntries(pairs) as SupplyData);
    } catch (e) { setError(mensagemErro(e)); }
    finally { setBusy(false); }
  }, [obraId]);
  useEffect(() => { if (canView) void refresh(); }, [canView, refresh]);
  const model = useMemo(() => data ? makeSupplyDashboard(data, today) : null, [data, today]);
  async function exportFile() {
    if (!data || !model) return;
    setExporting(true); setError("");
    try { await exportSupplyDashboard(data, model, obraId, obraNome, today); }
    catch (e) { setError(mensagemErro(e)); }
    finally { setExporting(false); }
  }
  if (!canView) return null;
  const i = model?.indicadores;
  const biggest = Math.max(1, ...(model?.fornecedores.map((f) => f.contratado) || []));
  return <section className="panel editor" aria-labelledby="dashboard-suprimentos-title">
    <div className="section-heading"><div>
      <h2 id="dashboard-suprimentos-title">Suprimentos e custos</h2>
      <p className="muted">Estoque, solicitações, pedidos e cotações da obra, com projeção por data de necessidade.</p>
    </div><div className="row-actions">
      <button className="secondary" onClick={() => void refresh()} disabled={busy}>Atualizar</button>
      <button className="secondary" onClick={() => void exportFile()} disabled={!model || exporting}>
        <Download size={16} aria-hidden="true" /> {exporting ? "Exportando..." : "Exportar para Power BI"}
      </button>
    </div></div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {busy && !model && <p className="muted">Carregando suprimentos...</p>}
    {model && i && <>
      <div className="stats">
        <div className="stat"><span>Materiais com falta prevista</span><strong>{i.combinacoes_em_risco}</strong><small>Por material e almoxarifado</small></div>
        <div className="stat"><span>Solicitações aprovadas em aberto</span><strong>{i.solicitacoes_aprovadas_abertas}</strong><small>{i.solicitacoes_pendentes} aguardando aprovação</small></div>
        <div className="stat"><span>Cotações abertas</span><strong>{i.cotacoes_abertas}</strong><small>Buscando propostas</small></div>
        <div className="stat"><span>Pedidos atrasados</span><strong>{i.pedidos_atrasados}</strong><small>Entrega prevista já passou</small></div>
      </div>
      <div className="stats">
        <div className="stat"><span>Valor contratado</span><strong>{money(i.contratados)}</strong><small>Pedidos emitidos</small></div>
        <div className="stat"><span>Recebido estimado</span><strong>{money(i.recebido_estimado)}</strong><small>Proporcional à quantidade recebida</small></div>
        <div className="stat"><span>Valor a receber estimado</span><strong>{money(i.a_receber_estimado)}</strong><small>Saldo dos pedidos</small></div>
        <div className="stat"><span>Diferença para menor cotação</span><strong>{money(model.diferenca_cotacoes)}</strong><small>Sem ajuste por prazo ou validade</small></div>
      </div>
      <h3>Previsão de falta</h3>
      <p className="muted">Saldo físico atual mais pedidos futuros ainda não recebidos, menos solicitações aprovadas ainda não entregues. Pedidos atrasados não são presumidos disponíveis. Entregas previstas no mesmo dia entram antes do consumo.</p>
      {!model.riscos.length ? <p className="muted">Nenhuma falta prevista com a demanda aprovada e as entregas programadas atuais.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr>
          <th>Material / almoxarifado</th><th>Falta em</th><th>Maior déficit</th><th>Saldo físico</th><th>Reservado</th><th>Demanda aberta</th><th>Pedidos futuros</th>
        </tr></thead><tbody>{model.riscos.map((r) => <tr key={r.material_id + ":" + r.almoxarifado_id}>
          <td>{r.material}<p className="muted">{r.almoxarifado}</p></td><td>{date(r.primeira_falta)}</td>
          <td><strong>{num(r.falta_maxima)} {r.unidade}</strong></td><td>{num(r.fisico)} {r.unidade}</td>
          <td>{num(r.reservado)} {r.unidade}</td><td>{num(r.demanda_aberta)} {r.unidade}</td>
          <td>{num(r.pedidos_pendentes)} {r.unidade}</td>
        </tr>)}</tbody></table></div>}
      <h3>Valor contratado por fornecedor</h3>
      {!model.fornecedores.length ? <p className="muted">Ainda não há pedidos emitidos.</p> :
        <div>{model.fornecedores.slice(0, 10).map((f) => <div key={f.fornecedor_id} style={{ marginBottom: 12 }}>
          <div className="row-actions" style={{ justifyContent: "space-between" }}><span>{f.nome} · {f.pedidos} pedido(s)</span><strong>{money(f.contratado)}</strong></div>
          <div style={{ height: 8, background: "#e6ebe6", borderRadius: 8 }}><div style={{ width: Math.max(2, 100*f.contratado/biggest) + "%", height: "100%", background: "#245d4b", borderRadius: 8 }} /></div>
        </div>)}</div>}
      <p className="muted">A exportação inclui tabelas relacionáveis por IDs e a metodologia de cálculo. “Recebido estimado” não é o valor fiscal da nota.</p>
    </>}
  </section>;
}
