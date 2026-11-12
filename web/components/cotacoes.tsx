"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro, hoje } from "../lib/supabase";
import { allRows } from "../lib/operacional";

type Material = { id: number; nome: string; unidade_estoque: string; unidade_compra: string; quantidade_por_embalagem: number };
type Solicitacao = { id: number; material_id: number; quantidade: number; necessario_em: string; estado: string };
type Supplier = { id: number; nome: string; documento: string | null; contato: string | null; telefone: string | null; email: string | null; ativo: boolean };
type Quote = { id: number; material_id: number; solicitacao_id: number | null; quantidade: number; necessario_em: string; observacao: string | null; estado: string; oferta_escolhida_id: number | null; justificativa_escolha: string | null };
type Offer = { id: number; cotacao_id: number; fornecedor_id: number; quantidade: number; unidade_compra: string; quantidade_por_embalagem: number; preco_embalagem: number; frete: number; impostos: number; desconto: number; entrega_em: string; validade_ate: string; observacao: string | null; custo_entregue: number };
const dinheiro = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR");

export default function Cotacoes({ obraId, accessRole, ativo, materiais, solicitacoes, onChanged }: {
  obraId: number; accessRole: string; ativo: boolean; materiais: Material[]; solicitacoes: Solicitacao[]; onChanged: () => void;
}) {
  const podeVer = ["administrador", "engenheiro", "supervisor", "estagiario", "encarregado"].includes(accessRole);
  const podeRegistrar = ativo && ["administrador", "engenheiro", "supervisor", "estagiario"].includes(accessRole);
  const podeEscolher = ativo && ["administrador", "engenheiro"].includes(accessRole);
  const [fornecedores, setFornecedores] = useState<Supplier[]>([]);
  const [cotacoes, setCotacoes] = useState<Quote[]>([]);
  const [ofertas, setOfertas] = useState<Offer[]>([]);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [contato, setContato] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [solicitacaoId, setSolicitacaoId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [necessarioEm, setNecessarioEm] = useState(hoje());
  const [observacao, setObservacao] = useState("");
  const [cotacaoId, setCotacaoId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [preco, setPreco] = useState("");
  const [frete, setFrete] = useState("0");
  const [impostos, setImpostos] = useState("0");
  const [desconto, setDesconto] = useState("0");
  const [entregaEm, setEntregaEm] = useState(hoje());
  const [validadeAte, setValidadeAte] = useState(hoje());
  const [observacaoOferta, setObservacaoOferta] = useState("");
  const [edicaoOfertaId, setEdicaoOfertaId] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [f, c, o] = await Promise.all([
      allRows(() => supabase.from("fornecedores_materiais").select("*").eq("obra_id", obraId).order("id")),
      allRows(() => supabase.from("cotacoes_materiais").select("*").eq("obra_id", obraId).order("id")),
      allRows(() => supabase.from("ofertas_materiais").select("*").eq("obra_id", obraId).order("id")),
    ]);
    setFornecedores(f as Supplier[]);
    setCotacoes(c as Quote[]);
    setOfertas(o as Offer[]);
  }, [obraId]);
  useEffect(() => { if (podeVer) void refresh().catch((e) => setError(mensagemErro(e))); }, [podeVer, refresh]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); onChanged(); setNotice(success); }
    catch (e) { setError(mensagemErro(e)); }
    finally { setBusy(false); }
  }
  function criarFornecedor(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase.from("fornecedores_materiais").insert({
        obra_id: obraId, nome: nome.trim(), documento: documento.trim() || null,
        contato: contato.trim() || null, telefone: telefone.trim() || null, email: email.trim() || null,
      });
      if (err) throw err;
      setNome(""); setDocumento(""); setContato(""); setTelefone(""); setEmail("");
    }, "Fornecedor cadastrado.");
  }
  function escolherSolicitacao(value: string) {
    setSolicitacaoId(value);
    const row = solicitacoes.find((s) => String(s.id) === value);
    if (row) { setMaterialId(String(row.material_id)); setQuantidade(String(row.quantidade)); setNecessarioEm(row.necessario_em); }
  }
  function criarCotacao(e: FormEvent) {
    e.preventDefault();
    const q = Number(quantidade);
    if (!Number.isFinite(q) || q <= 0) { setError("Informe uma quantidade positiva."); return; }
    void run(async () => {
      const { error: err } = await supabase.from("cotacoes_materiais").insert({
        obra_id: obraId, material_id: Number(materialId), solicitacao_id: solicitacaoId ? Number(solicitacaoId) : null,
        quantidade: q, necessario_em: necessarioEm, observacao: observacao.trim() || null,
      });
      if (err) throw err;
      setSolicitacaoId(""); setMaterialId(""); setQuantidade(""); setObservacao("");
    }, "Cotação aberta para comparação de propostas.");
  }
  function editarOferta(row: Offer) {
    setCotacaoId(String(row.cotacao_id)); setFornecedorId(String(row.fornecedor_id));
    setPreco(String(row.preco_embalagem)); setFrete(String(row.frete));
    setImpostos(String(row.impostos)); setDesconto(String(row.desconto));
    setEntregaEm(row.entrega_em); setValidadeAte(row.validade_ate);
    setObservacaoOferta(row.observacao || ""); setEdicaoOfertaId(row.id);
  }
  function limparOferta() {
    setEdicaoOfertaId(null); setFornecedorId(""); setPreco(""); setFrete("0");
    setImpostos("0"); setDesconto("0"); setObservacaoOferta("");
  }
  function salvarOferta(e: FormEvent) {
    e.preventDefault();
    const valores = [preco, frete, impostos, desconto].map(Number);
    if (valores.some((v) => !Number.isFinite(v) || v < 0)) { setError("Informe valores monetários válidos."); return; }
    void run(async () => {
      const payload = {
        preco_embalagem: valores[0], frete: valores[1], impostos: valores[2], desconto: valores[3],
        entrega_em: entregaEm, validade_ate: validadeAte, observacao: observacaoOferta.trim() || null,
      };
      const result = edicaoOfertaId
        ? await supabase.from("ofertas_materiais").update(payload).eq("id", edicaoOfertaId)
        : await supabase.from("ofertas_materiais").insert({
          ...payload, obra_id: obraId, cotacao_id: Number(cotacaoId), fornecedor_id: Number(fornecedorId),
        });
      if (result.error) throw result.error;
      limparOferta();
    }, edicaoOfertaId ? "Proposta atualizada." : "Proposta registrada.");
  }
  function escolher(cotacao: Quote, oferta: Offer) {
    void run(async () => {
      const { error: err } = await supabase.rpc("escolher_oferta_material", {
        p_cotacao_id: cotacao.id, p_oferta_id: oferta.id, p_justificativa: justificativa.trim() || null,
      });
      if (err) throw err;
      setJustificativa("");
    }, "Fornecedor escolhido e cotação encerrada.");
  }

  if (!podeVer) return null;
  const selecionada = cotacoes.find((c) => String(c.id) === cotacaoId);
  const materialSelecionado = materiais.find((m) => m.id === selecionada?.material_id);
  const ofertasCotacao = ofertas.filter((o) => o.cotacao_id === selecionada?.id)
    .sort((a, b) => Number(a.custo_entregue) - Number(b.custo_entregue) || a.entrega_em.localeCompare(b.entrega_em));
  const menorValido = Math.min(...ofertasCotacao.filter((o) => o.validade_ate >= hoje()).map((o) => Number(o.custo_entregue)));
  const embalagem = materialSelecionado ? Math.ceil(Number(selecionada?.quantidade || 0) / Number(materialSelecionado.quantidade_por_embalagem)) : 0;

  return <div className="panel editor">
    <h3>Fornecedores e cotações</h3>
    <p className="muted">Compare propostas para a mesma quantidade e especificação. O custo entregue inclui embalagens inteiras, frete, impostos e desconto.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {podeRegistrar && <form onSubmit={criarFornecedor} className="form-grid">
      <h4>Cadastrar fornecedor</h4>
      <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={160} /></label>
      <label>Documento<input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={30} /></label>
      <label>Contato<input value={contato} onChange={(e) => setContato(e.target.value)} maxLength={100} /></label>
      <label>Telefone<input value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} /></label>
      <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} /></label>
      <button className="secondary" disabled={busy}>Cadastrar fornecedor</button>
    </form>}
    {podeRegistrar && <form onSubmit={criarCotacao} className="form-grid">
      <h4>Abrir cotação</h4>
      <label>Solicitação aprovada (opcional)<select value={solicitacaoId} onChange={(e) => escolherSolicitacao(e.target.value)}>
        <option value="">Cotação sem solicitação</option>
        {solicitacoes.filter((s) => s.estado === "aprovada").map((s) => <option key={s.id} value={s.id}>#{s.id} · {materiais.find((m) => m.id === s.material_id)?.nome || "Material"}</option>)}
      </select></label>
      <label>Material<select value={materialId} onChange={(e) => { setMaterialId(e.target.value); setSolicitacaoId(""); }} required>
        <option value="">Selecione</option>{materiais.map((m) => <option key={m.id} value={m.id}>{m.nome} · {m.unidade_estoque}</option>)}
      </select></label>
      <label>Quantidade em unidade de estoque<input type="number" min="0.0001" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required /></label>
      <label>Necessário em<input type="date" value={necessarioEm} onChange={(e) => setNecessarioEm(e.target.value)} required /></label>
      <label>Especificação e condições<textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} /></label>
      <button className="primary" disabled={busy || !materiais.length}>Abrir cotação</button>
    </form>}
    <label>Cotação para comparar<select value={cotacaoId} onChange={(e) => { setCotacaoId(e.target.value); limparOferta(); }}>
      <option value="">Selecione uma cotação</option>
      {cotacoes.slice().reverse().map((c) => <option key={c.id} value={c.id}>#{c.id} · {materiais.find((m) => m.id === c.material_id)?.nome || "Material"} · {c.estado === "aberta" ? "Aberta" : "Encerrada"}</option>)}
    </select></label>
    {selecionada && <>
      <p><strong>Base de comparação:</strong> {Number(selecionada.quantidade).toLocaleString("pt-BR")} {materialSelecionado?.unidade_estoque} · {embalagem} {materialSelecionado?.unidade_compra}(s) · necessidade em {dataBR(selecionada.necessario_em)}.</p>
      {selecionada.observacao && <p className="muted">{selecionada.observacao}</p>}
      {selecionada.solicitacao_id && <p className="muted">Solicitação vinculada: #{selecionada.solicitacao_id}</p>}
      {selecionada.estado === "encerrada" && <p className="alert success">Proposta escolhida: #{selecionada.oferta_escolhida_id}. {selecionada.justificativa_escolha || ""}</p>}
      {podeRegistrar && selecionada.estado === "aberta" && <form onSubmit={salvarOferta} className="form-grid">
        <h4>{edicaoOfertaId ? "Corrigir proposta" : "Registrar proposta"}</h4>
        <label>Fornecedor<select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} required disabled={Boolean(edicaoOfertaId)}>
          <option value="">Selecione</option>{fornecedores.filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select></label>
        <label>Preço por {materialSelecionado?.unidade_compra || "embalagem"} (R$)<input type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} required /></label>
        <label>Frete (R$)<input type="number" min="0" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} required /></label>
        <label>Impostos (R$)<input type="number" min="0" step="0.01" value={impostos} onChange={(e) => setImpostos(e.target.value)} required /></label>
        <label>Desconto total (R$)<input type="number" min="0" step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} required /></label>
        <label>Entrega prevista<input type="date" value={entregaEm} onChange={(e) => setEntregaEm(e.target.value)} required /></label>
        <label>Válida até<input type="date" value={validadeAte} onChange={(e) => setValidadeAte(e.target.value)} required /></label>
        <label>Observação<textarea value={observacaoOferta} onChange={(e) => setObservacaoOferta(e.target.value)} maxLength={1000} /></label>
        <div className="row-actions"><button className="primary" disabled={busy || !fornecedores.some((f) => f.ativo)}>Salvar proposta</button>
          {edicaoOfertaId && <button type="button" className="secondary" onClick={limparOferta}>Cancelar edição</button>}</div>
      </form>}
      {podeEscolher && selecionada.estado === "aberta" && <label>Justificativa da escolha, se custar mais ou chegar após a data necessária<textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} /></label>}
      {!ofertasCotacao.length ? <p className="muted">Nenhuma proposta registrada nesta cotação.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Fornecedor</th><th>Preço/embalagem</th><th>Frete + impostos - desconto</th><th>Custo entregue</th><th>Entrega</th><th>Validade</th><th>Ações</th></tr></thead><tbody>
          {ofertasCotacao.map((o) => {
            const vencida = o.validade_ate < hoje();
            const atrasada = o.entrega_em > selecionada.necessario_em;
            return <tr key={o.id}>
              <td>{fornecedores.find((f) => f.id === o.fornecedor_id)?.nome || "#" + o.fornecedor_id}{o.observacao && <p className="muted">{o.observacao}</p>}</td>
              <td>{dinheiro(o.preco_embalagem)}</td>
              <td>{dinheiro(Number(o.frete) + Number(o.impostos) - Number(o.desconto))}</td>
              <td><strong>{dinheiro(o.custo_entregue)}</strong>{Number(o.custo_entregue) === menorValido && !vencida && <p className="muted">Menor valor válido</p>}</td>
              <td>{dataBR(o.entrega_em)}{atrasada && <p className="muted">Após necessidade</p>}</td>
              <td>{dataBR(o.validade_ate)}{vencida && <p className="muted">Vencida</p>}</td>
              <td><div className="row-actions">
                {o.id === selecionada.oferta_escolhida_id && "Escolhida"}
                {podeRegistrar && selecionada.estado === "aberta" && <button className="secondary" disabled={busy} onClick={() => editarOferta(o)}>Editar</button>}
                {podeEscolher && selecionada.estado === "aberta" && !vencida && <button className="secondary" disabled={busy} onClick={() => escolher(selecionada, o)}>Escolher</button>}
              </div></td>
            </tr>;
          })}</tbody></table></div>}
    </>}
  </div>;
}
