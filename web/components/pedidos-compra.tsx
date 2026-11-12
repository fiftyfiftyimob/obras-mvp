"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { allRows } from "../lib/operacional";

type Material = { id: number; nome: string; unidade_estoque: string };
type Warehouse = { id: number; nome: string };
type Quote = { id: number; material_id: number; quantidade: number; estado: string; oferta_escolhida_id: number | null };
type Offer = { id: number; fornecedor_id: number; custo_entregue: number; entrega_em: string };
type Supplier = { id: number; nome: string };
type Order = { id: number; cotacao_id: number; fornecedor_id: number; material_id: number; almoxarifado_id: number; quantidade: number; quantidade_recebida: number; custo_contratado: number; entrega_prevista: string; estado: string };
type Receipt = { id: string; pedido_id: number; quantidade: number; documento: string | null; observacao: string | null; recebido_em: string; estornado_em: string | null; motivo_estorno: string | null };
const money = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string) => new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");

export default function PedidosCompra({ obraId, accessRole, ativo, materiais, almoxarifados, onChanged }: {
  obraId: number; accessRole: string; ativo: boolean; materiais: Material[]; almoxarifados: Warehouse[]; onChanged: () => Promise<void>;
}) {
  const canView = ["administrador", "engenheiro", "supervisor", "estagiario", "encarregado"].includes(accessRole);
  const canOrder = ativo && ["administrador", "engenheiro"].includes(accessRole);
  const canReceive = ativo && ["administrador", "engenheiro", "supervisor"].includes(accessRole);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [quoteId, setQuoteId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [documento, setDocumento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [motivoEstorno, setMotivoEstorno] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const receiptKey = useRef("");
  const reverseKeys = useRef<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const [q, o, f, p, r] = await Promise.all([
      allRows(() => supabase.from("cotacoes_materiais").select("id,material_id,quantidade,estado,oferta_escolhida_id").eq("obra_id", obraId).order("id")),
      allRows(() => supabase.from("ofertas_materiais").select("id,fornecedor_id,custo_entregue,entrega_em").eq("obra_id", obraId).order("id")),
      allRows(() => supabase.from("fornecedores_materiais").select("id,nome").eq("obra_id", obraId).order("id")),
      allRows(() => supabase.from("pedidos_compra").select("*").eq("obra_id", obraId).order("id")),
      allRows(() => supabase.from("recebimentos_compra").select("*").eq("obra_id", obraId).order("recebido_em").order("id")),
    ]);
    setQuotes(q as Quote[]); setOffers(o as Offer[]); setSuppliers(f as Supplier[]);
    setOrders(p as Order[]); setReceipts(r as Receipt[]);
  }, [obraId]);
  useEffect(() => { if (canView) void refresh().catch((e) => setError(mensagemErro(e))); }, [canView, refresh]);
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); setNotice(success); }
    catch (e) { setError(mensagemErro(e)); }
    finally { setBusy(false); }
  }
  function createOrder(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { data, error: err } = await supabase.rpc("criar_pedido_compra", {
        p_cotacao_id: Number(quoteId), p_almoxarifado_id: Number(warehouseId),
      });
      if (err) throw err;
      setOrderId(String(data.id)); setQuoteId("");
    }, "Pedido criado a partir da proposta escolhida.");
  }
  function receive(e: FormEvent) {
    e.preventDefault();
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) { setError("Informe uma quantidade positiva."); return; }
    const id = receiptKey.current || crypto.randomUUID();
    receiptKey.current = id;
    void run(async () => {
      const { error: err } = await supabase.rpc("registrar_recebimento_compra", {
        p_id: id, p_pedido_id: Number(orderId), p_quantidade: q,
        p_documento: documento.trim() || null, p_observacao: observacao.trim() || null,
      });
      if (err) throw err;
      receiptKey.current = ""; setQuantity(""); setDocumento(""); setObservacao("");
      await onChanged();
    }, "Recebimento registrado e estoque atualizado.");
  }
  function reverse(row: Receipt) {
    if (!motivoEstorno.trim()) { setError("Informe o motivo do estorno."); return; }
    const id = reverseKeys.current[row.id] || crypto.randomUUID();
    reverseKeys.current[row.id] = id;
    void run(async () => {
      const { error: err } = await supabase.rpc("estornar_recebimento_compra", {
        p_recebimento_id: row.id, p_estorno_id: id, p_motivo: motivoEstorno.trim(),
      });
      if (err) throw err;
      delete reverseKeys.current[row.id]; setMotivoEstorno("");
      await onChanged();
    }, "Recebimento estornado no pedido e no estoque.");
  }
  if (!canView) return null;
  const available = quotes.filter((q) => q.estado === "encerrada" && !orders.some((p) => p.cotacao_id === q.id));
  const selected = orders.find((p) => String(p.id) === orderId);
  const selectedReceipts = receipts.filter((r) => r.pedido_id === selected?.id);
  return <div className="panel editor">
    <h3>Pedidos e recebimentos</h3>
    <p className="muted">Emita o pedido pela proposta escolhida. Cada entrega parcial aumenta o saldo físico do almoxarifado e fica registrada no extrato de estoque.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {canOrder && <form onSubmit={createOrder} className="form-grid">
      <h4>Emitir pedido de compra</h4>
      <label>Cotação encerrada<select value={quoteId} onChange={(e) => setQuoteId(e.target.value)} required>
        <option value="">Selecione</option>{available.map((q) => {
          const offer = offers.find((o) => o.id === q.oferta_escolhida_id);
          return <option key={q.id} value={q.id}>#{q.id} · {materiais.find((m) => m.id === q.material_id)?.nome || "Material"} · {money(offer?.custo_entregue || 0)}</option>;
        })}
      </select></label>
      <label>Almoxarifado de destino<select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
        <option value="">Selecione</option>{almoxarifados.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
      </select></label>
      <button className="primary" disabled={busy || !available.length || !almoxarifados.length}>Emitir pedido</button>
    </form>}
    <label>Pedido<select value={orderId} onChange={(e) => { setOrderId(e.target.value); receiptKey.current = ""; }}>
      <option value="">Selecione</option>{orders.slice().reverse().map((p) => <option key={p.id} value={p.id}>#{p.id} · {materiais.find((m) => m.id === p.material_id)?.nome || "Material"} · {p.estado}</option>)}
    </select></label>
    {selected && <>
      <p><strong>Fornecedor:</strong> {suppliers.find((f) => f.id === selected.fornecedor_id)?.nome || "#" + selected.fornecedor_id}
        {" · "}<strong>Contratado:</strong> {money(selected.custo_contratado)}
        {" · "}<strong>Entrega prevista:</strong> {date(selected.entrega_prevista)}</p>
      <p><strong>Recebido:</strong> {Number(selected.quantidade_recebida).toLocaleString("pt-BR")} de {Number(selected.quantidade).toLocaleString("pt-BR")} {materiais.find((m) => m.id === selected.material_id)?.unidade_estoque}
        {" · "}<strong>Almoxarifado:</strong> {almoxarifados.find((a) => a.id === selected.almoxarifado_id)?.nome || "#" + selected.almoxarifado_id}</p>
      {canReceive && selected.estado !== "concluido" && selected.estado !== "cancelado" && <form onSubmit={receive} className="form-grid">
        <h4>Registrar entrega parcial</h4>
        <label>Quantidade recebida<input type="number" min="0.0001" max={Number(selected.quantidade) - Number(selected.quantidade_recebida)} step="any" value={quantity} onChange={(e) => { setQuantity(e.target.value); receiptKey.current = ""; }} required /></label>
        <label>Nota fiscal ou documento<input value={documento} onChange={(e) => { setDocumento(e.target.value); receiptKey.current = ""; }} maxLength={100} /></label>
        <label>Observação<textarea value={observacao} onChange={(e) => { setObservacao(e.target.value); receiptKey.current = ""; }} maxLength={1000} /></label>
        <button className="primary" disabled={busy}>Registrar recebimento</button>
      </form>}
      {canReceive && selectedReceipts.some((r) => !r.estornado_em) && <label>Motivo para estornar um recebimento<input value={motivoEstorno} onChange={(e) => setMotivoEstorno(e.target.value)} /></label>}
      {!selectedReceipts.length ? <p className="muted">Nenhum recebimento registrado.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Data</th><th>Quantidade</th><th>Documento</th><th>Estado</th><th>Ação</th></tr></thead><tbody>
          {selectedReceipts.map((r) => <tr key={r.id}>
            <td>{date(r.recebido_em)}</td><td>{Number(r.quantidade).toLocaleString("pt-BR")}</td>
            <td>{r.documento || "—"}{r.observacao && <p className="muted">{r.observacao}</p>}</td>
            <td>{r.estornado_em ? "Estornado: " + (r.motivo_estorno || "") : "Recebido"}</td>
            <td>{canReceive && !r.estornado_em && <button className="secondary" disabled={busy || !motivoEstorno.trim()} onClick={() => reverse(r)}>Estornar</button>}</td>
          </tr>)}</tbody></table></div>}
    </>}
  </div>;
}
