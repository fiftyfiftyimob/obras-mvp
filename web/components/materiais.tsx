"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro, hoje } from "../lib/supabase";
import Estoque from "./estoque";
import Cotacoes from "./cotacoes";
import PedidosCompra from "./pedidos-compra";

type Material = { id: number; nome: string; especificacao: string; unidade_estoque: string; unidade_compra: string; quantidade_por_embalagem: number };
type Almoxarifado = { id: number; nome: string };
type Frente = { id: number; nome: string };
type Tarefa = { id: number; frente_id: number; data: string; servico_id: number };
type Solicitacao = {
  id: number; material_id: number; almoxarifado_id: number; frente_id: number; tarefa_id: number | null;
  quantidade: number; quantidade_reservada: number; quantidade_entregue: number;
  necessario_em: string; observacao: string | null; estado: string;
  solicitado_por: string; solicitado_em: string; justificativa_decisao: string | null;
};
const estados: Record<string, string> = { pendente: "Pendente", aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada" };
const unidades = ["un", "m", "m²", "m³", "kg", "l"];

export default function Materiais({ obraId, accessRole, ativo }: { obraId: number; accessRole: string; ativo: boolean }) {
  const podeVer = ["administrador", "engenheiro", "supervisor", "estagiario", "encarregado"].includes(accessRole);
  const podeCadastrar = ativo && ["administrador", "engenheiro", "supervisor"].includes(accessRole);
  const podeSolicitar = ativo && podeVer;
  const podeAprovar = ativo && ["administrador", "engenheiro"].includes(accessRole);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [almoxarifados, setAlmoxarifados] = useState<Almoxarifado[]>([]);
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [filtro, setFiltro] = useState("pendente");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cotacoesRevision, setCotacoesRevision] = useState(0);
  const [estoqueRevision, setEstoqueRevision] = useState(0);
  const [nomeMaterial, setNomeMaterial] = useState("");
  const [especificacao, setEspecificacao] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [unidadeCompra, setUnidadeCompra] = useState("un");
  const [fator, setFator] = useState("1");
  const [nomeAlmoxarifado, setNomeAlmoxarifado] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [almoxarifadoId, setAlmoxarifadoId] = useState("");
  const [frenteId, setFrenteId] = useState("");
  const [tarefaId, setTarefaId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [necessarioEm, setNecessarioEm] = useState(hoje());
  const [observacao, setObservacao] = useState("");

  const refresh = useCallback(async () => {
    if (!podeVer) return;
    const [m, a, f, t, s, u] = await Promise.all([
      supabase.from("materiais").select("id,nome,especificacao,unidade_estoque,unidade_compra,quantidade_por_embalagem").eq("obra_id", obraId).eq("ativo", true).order("nome"),
      supabase.from("almoxarifados").select("id,nome").eq("obra_id", obraId).eq("ativo", true).order("nome"),
      supabase.from("frentes").select("id,nome").eq("obra_id", obraId).eq("ativo", true).order("nome"),
      supabase.from("tarefas").select("id,frente_id,data,servico_id").eq("obra_id", obraId).order("data", { ascending: false }).limit(500),
      supabase.from("solicitacoes_materiais").select("id,material_id,almoxarifado_id,frente_id,tarefa_id,quantidade,quantidade_reservada,quantidade_entregue,necessario_em,observacao,estado,solicitado_por,solicitado_em,justificativa_decisao").eq("obra_id", obraId).order("solicitado_em", { ascending: false }).limit(500),
      supabase.auth.getUser(),
    ]);
    for (const result of [m, a, f, t, s, u]) if (result.error) throw result.error;
    setMateriais((m.data || []) as Material[]);
    setAlmoxarifados((a.data || []) as Almoxarifado[]);
    setFrentes((f.data || []) as Frente[]);
    setTarefas((t.data || []) as Tarefa[]);
    setSolicitacoes((s.data || []) as Solicitacao[]);
    setUsuarioId(u.data.user?.id || "");
  }, [obraId, podeVer]);
  useEffect(() => { void refresh().catch((cause) => setError(mensagemErro(cause))); }, [refresh]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); setNotice(success); }
    catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }
  function cadastrarMaterial(event: FormEvent) {
    event.preventDefault();
    if (!podeCadastrar) return;
    const pack = Number(fator);
    if (!nomeMaterial.trim() || !unidadeCompra.trim() || !Number.isFinite(pack) || pack <= 0) {
      setError("Informe nome, unidade de compra e quantidade por embalagem válida."); return;
    }
    void run(async () => {
      const { error: saveError } = await supabase.from("materiais").insert({
        obra_id: obraId, nome: nomeMaterial.trim(), especificacao: especificacao.trim(),
        unidade_estoque: unidade, unidade_compra: unidadeCompra.trim(), quantidade_por_embalagem: pack,
      });
      if (saveError) throw saveError;
      setNomeMaterial(""); setEspecificacao(""); setFator("1");
    }, "Material cadastrado.");
  }
  function cadastrarAlmoxarifado(event: FormEvent) {
    event.preventDefault();
    if (!podeCadastrar || !nomeAlmoxarifado.trim()) return;
    void run(async () => {
      const { error: saveError } = await supabase.from("almoxarifados").insert({ obra_id: obraId, nome: nomeAlmoxarifado.trim() });
      if (saveError) throw saveError;
      setNomeAlmoxarifado("");
    }, "Almoxarifado cadastrado.");
  }
  function solicitar(event: FormEvent) {
    event.preventDefault();
    if (!podeSolicitar) return;
    const amount = Number(quantidade);
    if (!materialId || !almoxarifadoId || !frenteId || !necessarioEm || !Number.isFinite(amount) || amount <= 0) {
      setError("Preencha material, almoxarifado, frente, quantidade e data necessária."); return;
    }
    void run(async () => {
      const { error: saveError } = await supabase.from("solicitacoes_materiais").insert({
        obra_id: obraId, material_id: Number(materialId), almoxarifado_id: Number(almoxarifadoId),
        frente_id: Number(frenteId), tarefa_id: tarefaId ? Number(tarefaId) : null,
        quantidade: amount, necessario_em: necessarioEm, observacao: observacao.trim() || null,
      });
      if (saveError) throw saveError;
      setQuantidade(""); setTarefaId(""); setObservacao("");
    }, "Solicitação registrada na fila de aprovação.");
  }
  function decidir(row: Solicitacao, acao: "aprovar" | "recusar" | "cancelar") {
    if (busy) return;
    let justificativa: string | null = null;
    if (acao === "recusar") {
      justificativa = window.prompt("Informe o motivo da recusa:")?.trim() || null;
      if (!justificativa) return;
    }
    if (acao === "cancelar" && !window.confirm("Cancelar esta solicitação?")) return;
    void run(async () => {
      const { error: saveError } = await supabase.rpc("decidir_solicitacao_material", {
        p_id: row.id, p_acao: acao, p_justificativa: justificativa,
      });
      if (saveError) throw saveError;
    }, acao === "aprovar" ? "Solicitação aprovada." : acao === "recusar" ? "Solicitação recusada." : "Solicitação cancelada.");
  }
  const material = materiais.find((item) => item.id === Number(materialId));
  const packAmount = material && Number(quantidade) > 0
    ? Number(quantidade) / Number(material.quantidade_por_embalagem) : null;
  const rows = solicitacoes.filter((item) => filtro === "todos" || item.estado === filtro);

  if (!podeVer) return <section className="panel"><h2>Materiais</h2><p className="muted">Este perfil não tem acesso ao almoxarifado.</p></section>;
  return <section aria-label="Materiais e almoxarifado">
    <div className="section-heading"><div><h2>Materiais</h2>
      <p className="muted">Cadastre materiais, solicite por frente e acompanhe reservas, entregas e saldos do almoxarifado.</p>
    </div><button className="secondary" disabled={busy} onClick={() => void refresh().catch((cause) => setError(mensagemErro(cause)))}>Atualizar</button></div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {podeCadastrar && <div className="panel editor">
      <h3>Preparar catálogo e almoxarifado</h3>
      <form onSubmit={cadastrarMaterial}>
        <div className="form-grid">
          <label>Material <input required maxLength={120} value={nomeMaterial} onChange={(e) => setNomeMaterial(e.target.value)} placeholder="Ex.: Bloco cerâmico 9 × 19 × 19 cm" /></label>
          <label>Especificação <input value={especificacao} onChange={(e) => setEspecificacao(e.target.value)} placeholder="Fabricante, classe ou norma" /></label>
          <label>Unidade de estoque <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>{unidades.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label>Unidade de compra <input required maxLength={30} value={unidadeCompra} onChange={(e) => setUnidadeCompra(e.target.value)} placeholder="Ex.: pallet, saco, un" /></label>
          <label>Quantidade de estoque por unidade de compra <input required type="number" min="0.0001" step="any" value={fator} onChange={(e) => setFator(e.target.value)} /></label>
        </div>
        <button className="primary" disabled={busy}>Cadastrar material</button>
      </form>
      <form onSubmit={cadastrarAlmoxarifado}>
        <div className="form-grid"><label>Nome do almoxarifado <input required maxLength={100} value={nomeAlmoxarifado} onChange={(e) => setNomeAlmoxarifado(e.target.value)} placeholder="Ex.: Almoxarifado principal" /></label></div>
        <button className="secondary" disabled={busy}>Cadastrar almoxarifado</button>
      </form>
      <p className="muted">{materiais.length} materiais · {almoxarifados.length} almoxarifados cadastrados nesta obra.</p>
    </div>}
    {podeSolicitar && <div className="panel editor">
      <h3>Nova solicitação</h3>
      {(!materiais.length || !almoxarifados.length || !frentes.length) && <p className="notice">Cadastre ao menos um material, um almoxarifado e uma frente ativa antes de solicitar.</p>}
      <form onSubmit={solicitar}>
        <div className="form-grid">
          <label>Material <select required value={materialId} onChange={(e) => setMaterialId(e.target.value)}><option value="">Selecione</option>{materiais.map((m) => <option key={m.id} value={m.id}>{m.nome} · {m.unidade_estoque}</option>)}</select></label>
          <label>Almoxarifado <select required value={almoxarifadoId} onChange={(e) => setAlmoxarifadoId(e.target.value)}><option value="">Selecione</option>{almoxarifados.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
          <label>Frente <select required value={frenteId} onChange={(e) => { setFrenteId(e.target.value); setTarefaId(""); }}><option value="">Selecione</option>{frentes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
          <label>Tarefa (opcional) <select value={tarefaId} onChange={(e) => setTarefaId(e.target.value)}><option value="">Sem tarefa</option>{tarefas.filter((t) => t.frente_id === Number(frenteId)).map((t) => <option key={t.id} value={t.id}>#{t.id} · {t.data}</option>)}</select></label>
          <label>Quantidade em {material?.unidade_estoque || "unidade de estoque"} <input required type="number" min="0.0001" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} /></label>
          <label>Necessário em <input required type="date" value={necessarioEm} onChange={(e) => setNecessarioEm(e.target.value)} /></label>
          <label>Observação <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Especificação da necessidade" /></label>
        </div>
        {packAmount !== null && <p className="muted">Equivale a {packAmount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {material?.unidade_compra}(s) de compra, antes de arredondar embalagens.</p>}
        <button className="primary" disabled={busy || !materiais.length || !almoxarifados.length || !frentes.length}>Solicitar material</button>
      </form>
    </div>}
    <div className="panel editor">
      <h3>Fila de solicitações</h3>
      <label>Estado <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
        <option value="pendente">Pendentes</option><option value="aprovada">Aprovadas</option><option value="recusada">Recusadas</option><option value="cancelada">Canceladas</option><option value="todos">Todas</option>
      </select></label>
      {!rows.length ? <p className="muted">Nenhuma solicitação neste filtro.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Material</th><th>Quantidade</th><th>Frente / tarefa</th><th>Almoxarifado</th><th>Necessário em</th><th>Estado</th><th>Ações</th></tr></thead>
          <tbody>{rows.map((row) => {
            const item = materiais.find((m) => m.id === row.material_id);
            return <tr key={row.id}>
              <td>{item?.nome || "#" + row.material_id}{row.observacao && <p className="muted">{row.observacao}</p>}</td>
              <td>{Number(row.quantidade).toLocaleString("pt-BR")} {item?.unidade_estoque}</td>
              <td>{frentes.find((f) => f.id === row.frente_id)?.nome || "#" + row.frente_id}{row.tarefa_id ? " · tarefa #" + row.tarefa_id : ""}</td>
              <td>{almoxarifados.find((a) => a.id === row.almoxarifado_id)?.nome || "#" + row.almoxarifado_id}</td>
              <td>{new Date(row.necessario_em + "T12:00:00").toLocaleDateString("pt-BR")}</td>
              <td>{estados[row.estado] || row.estado}{row.justificativa_decisao && <p className="muted">{row.justificativa_decisao}</p>}</td>
              <td><div className="row-actions">
                {row.estado === "pendente" && podeAprovar && <><button className="secondary" disabled={busy} onClick={() => decidir(row, "aprovar")}>Aprovar</button><button className="secondary" disabled={busy} onClick={() => decidir(row, "recusar")}>Recusar</button></>}
                {row.estado === "pendente" && ativo && (row.solicitado_por === usuarioId || podeAprovar) && <button className="secondary" disabled={busy} onClick={() => decidir(row, "cancelar")}>Cancelar</button>}
              </div></td>
            </tr>;
          })}</tbody></table></div>}
      {solicitacoes.length >= 500 && <p className="muted">Exibindo as 500 solicitações mais recentes.</p>}
    </div>
    <Estoque obraId={obraId} accessRole={accessRole} ativo={ativo} materiais={materiais} almoxarifados={almoxarifados} onChanged={refresh} revision={estoqueRevision} />
    <Cotacoes obraId={obraId} accessRole={accessRole} ativo={ativo} materiais={materiais} solicitacoes={solicitacoes} onChanged={() => setCotacoesRevision((v) => v + 1)} />
    <PedidosCompra obraId={obraId} accessRole={accessRole} ativo={ativo} materiais={materiais} almoxarifados={almoxarifados} onChanged={async () => { await refresh(); setEstoqueRevision((v) => v + 1); }} cotacoesRevision={cotacoesRevision} />
  </section>;
}
