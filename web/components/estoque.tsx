"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";

type Material = { id: number; nome: string; unidade_estoque: string };
type Almoxarifado = { id: number; nome: string };
type Saldo = { almoxarifado_id: number; material_id: number; fisico: number; reservado: number };
type Solicitacao = {
  id: number; material_id: number; almoxarifado_id: number; frente_id: number;
  quantidade: number; quantidade_reservada: number; quantidade_entregue: number; necessario_em: string;
};
type Operacao = {
  id: string; tipo: string; material_id: number; almoxarifado_id: number; destino_id: number | null;
  solicitacao_id: number | null; quantidade: number; observacao: string | null; criado_em: string; estorno_de: string | null;
};
type Movimento = {
  id: number; operacao_id: string; almoxarifado_id: number; material_id: number;
  delta_fisico: number; delta_reservado: number; criado_em: string;
};
type OperacaoInput = {
  p_id: string; p_obra_id: number; p_tipo: string; p_material_id: number;
  p_almoxarifado_id: number; p_quantidade: number; p_solicitacao_id?: number | null;
  p_destino_id?: number | null; p_observacao?: string | null; p_estorno_de?: string | null;
};
const nomes: Record<string, string> = {
  inventario_inicial: "Saldo inicial", entrada: "Entrada", reserva: "Reserva",
  baixa: "Entrega", devolucao: "Devolução", liberacao: "Liberação de reserva",
  transferencia: "Transferência", contagem: "Contagem", estorno: "Estorno",
};
const numero = (value: number) => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export default function Estoque({ obraId, accessRole, ativo, materiais, almoxarifados, onChanged, revision }: {
  obraId: number; accessRole: string; ativo: boolean; materiais: Material[]; almoxarifados: Almoxarifado[];
  onChanged: () => Promise<void>; revision: number;
}) {
  const podeVer = ["administrador","engenheiro","supervisor","estagiario","encarregado"].includes(accessRole);
  const podeOperar = ativo && ["administrador","engenheiro","supervisor","encarregado"].includes(accessRole);
  const podeGerir = ativo && ["administrador","engenheiro","supervisor"].includes(accessRole);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tipo, setTipo] = useState("entrada");
  const [materialId, setMaterialId] = useState("");
  const [almoxarifadoId, setAlmoxarifadoId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [quantidadesSolicitacao, setQuantidadesSolicitacao] = useState<Record<number,string>>({});
  const pending = useRef(new Map<string,string>());

  const refresh = useCallback(async () => {
    if (!podeVer) return;
    const [s, r, o, m] = await Promise.all([
      supabase.from("estoque_saldos").select("almoxarifado_id,material_id,fisico,reservado").eq("obra_id", obraId).order("almoxarifado_id").limit(500),
      supabase.from("solicitacoes_materiais").select("id,material_id,almoxarifado_id,frente_id,quantidade,quantidade_reservada,quantidade_entregue,necessario_em").eq("obra_id", obraId).eq("estado", "aprovada").order("necessario_em").limit(500),
      supabase.from("estoque_operacoes").select("id,tipo,material_id,almoxarifado_id,destino_id,solicitacao_id,quantidade,observacao,criado_em,estorno_de").eq("obra_id", obraId).order("criado_em", { ascending: false }).limit(100),
      supabase.from("estoque_movimentos").select("id,operacao_id,almoxarifado_id,material_id,delta_fisico,delta_reservado,criado_em").eq("obra_id", obraId).order("id", { ascending: false }).limit(100),
    ]);
    for (const result of [s,r,o,m]) if (result.error) throw result.error;
    setSaldos((s.data || []) as Saldo[]);
    setSolicitacoes((r.data || []) as Solicitacao[]);
    setOperacoes((o.data || []) as Operacao[]);
    setMovimentos((m.data || []) as Movimento[]);
  }, [obraId,podeVer]);
  useEffect(() => { void refresh().catch((cause) => setError(mensagemErro(cause))); }, [refresh, revision]);

  async function registrar(input: Omit<OperacaoInput,"p_id">, success: string) {
    const signature = JSON.stringify(input);
    const operationId = pending.current.get(signature) || crypto.randomUUID();
    pending.current.set(signature, operationId);
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc("registrar_operacao_estoque", { ...input, p_id: operationId });
      if (rpcError) throw rpcError;
      pending.current.delete(signature);
      await Promise.all([refresh(), onChanged()]);
      setNotice(success);
      return true;
    } catch (cause) {
      setError(mensagemErro(cause));
      return false;
    } finally { setBusy(false); }
  }
  async function registrarAvulsa(event: FormEvent) {
    event.preventDefault();
    if (!podeGerir) return;
    const amount = Number(quantidade);
    if (!materialId || !almoxarifadoId || !Number.isFinite(amount) || amount < 0
      || (tipo !== "contagem" && amount === 0)
      || (tipo === "transferencia" && (!destinoId || destinoId === almoxarifadoId))) {
      setError("Informe material, almoxarifado, quantidade e destino válidos."); return;
    }
    const ok = await registrar({
      p_obra_id: obraId, p_tipo: tipo, p_material_id: Number(materialId),
      p_almoxarifado_id: Number(almoxarifadoId), p_quantidade: amount,
      p_destino_id: tipo === "transferencia" ? Number(destinoId) : null,
      p_observacao: observacao.trim() || null,
    }, nomes[tipo] + " registrada.");
    if (ok) { setQuantidade(""); setObservacao(""); }
  }
  async function atender(row: Solicitacao, action: "reserva" | "baixa" | "devolucao" | "liberacao") {
    if (!podeOperar) return;
    const amount = Number(quantidadesSolicitacao[row.id]);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe a quantidade a movimentar nessa solicitação."); return;
    }
    const ok = await registrar({
      p_obra_id: obraId, p_tipo: action, p_material_id: row.material_id,
      p_almoxarifado_id: row.almoxarifado_id, p_quantidade: amount,
      p_solicitacao_id: row.id,
    }, nomes[action] + " registrada.");
    if (ok) setQuantidadesSolicitacao((current) => ({ ...current, [row.id]: "" }));
  }
  async function estornar(row: Operacao) {
    if (!podeGerir || !window.confirm("Estornar esta operação? O sistema verificará se o saldo atual permite a reversão.")) return;
    await registrar({
      p_obra_id: obraId, p_tipo: "estorno", p_material_id: row.material_id,
      p_almoxarifado_id: row.almoxarifado_id, p_quantidade: Number(row.quantidade),
      p_solicitacao_id: row.solicitacao_id, p_estorno_de: row.id,
    }, "Estorno registrado no extrato.");
  }
  const materialNome = (id: number) => materiais.find((m) => m.id === id)?.nome || "#" + id;
  const unidade = (id: number) => materiais.find((m) => m.id === id)?.unidade_estoque || "";
  const almoxNome = (id: number) => almoxarifados.find((a) => a.id === id)?.nome || "#" + id;
  const selectedSaldo = saldos.find((s) => s.material_id === Number(materialId) && s.almoxarifado_id === Number(almoxarifadoId));
  const estornadas = new Set(operacoes.filter((o) => o.estorno_de).map((o) => o.estorno_de));
  if (!podeVer) return null;

  return <section aria-label="Estoque">
    <div className="section-heading"><div><h2>Estoque e almoxarifado</h2>
      <p className="muted">Saldo físico, reservado e disponível por material e almoxarifado. Cada ajuste fica no extrato.</p>
    </div><button className="secondary" disabled={busy} onClick={() => void refresh().catch((cause) => setError(mensagemErro(cause)))}>Atualizar estoque</button></div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    <div className="panel editor">
      <h3>Saldos</h3>
      {!saldos.length ? <p className="muted">Nenhum saldo registrado. Cadastre o saldo inicial para começar.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Material</th><th>Almoxarifado</th><th>Físico</th><th>Reservado</th><th>Disponível</th></tr></thead>
          <tbody>{saldos.map((s) => <tr key={s.material_id + "-" + s.almoxarifado_id}>
            <td>{materialNome(s.material_id)}</td><td>{almoxNome(s.almoxarifado_id)}</td>
            <td>{numero(s.fisico)} {unidade(s.material_id)}</td>
            <td>{numero(s.reservado)} {unidade(s.material_id)}</td>
            <td>{numero(Number(s.fisico) - Number(s.reservado))} {unidade(s.material_id)}</td>
          </tr>)}</tbody></table></div>}
      {saldos.length >= 500 && <p className="muted">Exibindo os primeiros 500 saldos. Use o extrato para conferir movimentos recentes.</p>}
    </div>
    {podeGerir && <div className="panel editor">
      <h3>Registrar no estoque</h3>
      <form onSubmit={(event) => void registrarAvulsa(event)}>
        <div className="form-grid">
          <label>Operação <select value={tipo} onChange={(event) => setTipo(event.target.value)}>
            <option value="inventario_inicial">Saldo inicial</option><option value="entrada">Entrada</option>
            <option value="transferencia">Transferência</option><option value="contagem">Contagem cíclica</option>
          </select></label>
          <label>Material <select required value={materialId} onChange={(event) => setMaterialId(event.target.value)}><option value="">Selecione</option>{materiais.map((m) => <option key={m.id} value={m.id}>{m.nome} · {m.unidade_estoque}</option>)}</select></label>
          <label>Almoxarifado <select required value={almoxarifadoId} onChange={(event) => setAlmoxarifadoId(event.target.value)}><option value="">Selecione</option>{almoxarifados.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
          {tipo === "transferencia" && <label>Almoxarifado de destino <select required value={destinoId} onChange={(event) => setDestinoId(event.target.value)}><option value="">Selecione</option>{almoxarifados.filter((a) => a.id !== Number(almoxarifadoId)).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>}
          <label>{tipo === "contagem" ? "Quantidade física contada" : "Quantidade"} <input required type="number" min={tipo === "contagem" ? "0" : "0.0001"} step="any" value={quantidade} onChange={(event) => setQuantidade(event.target.value)} /></label>
          <label>Observação <input value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Ex.: nota fiscal, local ou motivo" /></label>
        </div>
        {materialId && almoxarifadoId && <p className="muted">Saldo atual: {numero(selectedSaldo?.fisico || 0)} físico · {numero(selectedSaldo?.reservado || 0)} reservado · {numero(Number(selectedSaldo?.fisico || 0) - Number(selectedSaldo?.reservado || 0))} disponível.</p>}
        <button className="primary" disabled={busy || !materiais.length || !almoxarifados.length}>Registrar {nomes[tipo]?.toLowerCase()}</button>
      </form>
    </div>}
    <div className="panel editor">
      <h3>Atender solicitações aprovadas</h3>
      {!solicitacoes.length ? <p className="muted">Nenhuma solicitação aprovada.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Solicitação</th><th>Material</th><th>Necessidade</th><th>Reservado</th><th>Entregue</th><th>A atender</th><th>Movimentar</th></tr></thead>
          <tbody>{solicitacoes.map((r) => <tr key={r.id}>
            <td>#{r.id} · {new Date(r.necessario_em + "T12:00:00").toLocaleDateString("pt-BR")}</td>
            <td>{materialNome(r.material_id)}<p className="muted">{almoxNome(r.almoxarifado_id)}</p></td>
            <td>{numero(r.quantidade)} {unidade(r.material_id)}</td>
            <td>{numero(r.quantidade_reservada)}</td><td>{numero(r.quantidade_entregue)}</td>
            <td>{numero(Number(r.quantidade)-Number(r.quantidade_reservada)-Number(r.quantidade_entregue))}</td>
            <td>{podeOperar && <div className="row-actions">
              <input aria-label={"Quantidade para solicitação " + r.id} type="number" min="0.0001" step="any"
                value={quantidadesSolicitacao[r.id] || ""} onChange={(event) => setQuantidadesSolicitacao((current) => ({ ...current, [r.id]: event.target.value }))} />
              <button className="secondary" disabled={busy || Number(r.quantidade)-Number(r.quantidade_reservada)-Number(r.quantidade_entregue) <= 0} onClick={() => void atender(r,"reserva")}>Reservar</button>
              <button className="secondary" disabled={busy || Number(r.quantidade_reservada) <= 0} onClick={() => void atender(r,"baixa")}>Entregar</button>
              <button className="secondary" disabled={busy || Number(r.quantidade_reservada) <= 0} onClick={() => void atender(r,"liberacao")}>Liberar</button>
              <button className="secondary" disabled={busy || Number(r.quantidade_entregue) <= 0} onClick={() => void atender(r,"devolucao")}>Devolver</button>
            </div>}</td>
          </tr>)}</tbody></table></div>}
      {solicitacoes.length >= 500 && <p className="muted">Exibindo as 500 solicitações aprovadas com necessidade mais próxima.</p>}
    </div>
    <div className="panel editor">
      <h3>Extrato de movimentos</h3>
      {!movimentos.length ? <p className="muted">Nenhuma movimentação registrada.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Data</th><th>Operação</th><th>Material</th><th>Almoxarifado</th><th>Δ físico</th><th>Δ reservado</th><th></th></tr></thead>
          <tbody>{movimentos.map((m) => {
            const op = operacoes.find((o) => o.id === m.operacao_id);
            return <tr key={m.id}>
              <td>{new Date(m.criado_em).toLocaleString("pt-BR")}</td>
              <td>{op ? nomes[op.tipo] || op.tipo : "Operação #" + m.operacao_id.slice(0,8)}
                {op?.solicitacao_id && <p className="muted">Solicitação #{op.solicitacao_id}</p>}
                {op?.observacao && <p className="muted">{op.observacao}</p>}</td>
              <td>{materialNome(m.material_id)}</td><td>{almoxNome(m.almoxarifado_id)}</td>
              <td>{numero(m.delta_fisico)} {unidade(m.material_id)}</td>
              <td>{numero(m.delta_reservado)} {unidade(m.material_id)}</td>
              <td>{podeGerir && op && op.tipo !== "estorno" && !estornadas.has(op.id) &&
                <button className="secondary" disabled={busy} onClick={() => void estornar(op)}>Estornar</button>}</td>
            </tr>;
          })}</tbody></table></div>}
      {movimentos.length >= 100 && <p className="muted">Exibindo os 100 movimentos mais recentes.</p>}
    </div>
  </section>;
}
