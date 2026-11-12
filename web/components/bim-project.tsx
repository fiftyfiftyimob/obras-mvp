"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { uploadIfc } from "../lib/bim-upload";
import BimPlanning from "./bim-planning";

type Importacao = {
  id: string; revisao: string; nome_arquivo: string; caminho_arquivo: string;
  tamanho_bytes: number; estado: string; schema_ifc: string | null;
  total_elementos: number; total_pendencias: number; erro: string | null;
  criado_em: string; tentativas: number;
  conferida_em: string | null; conferida_por: string | null;
};
type Elemento = {
  id: number; global_id: string | null; classe: string; nome: string | null;
  local: string | null; pendencias: string[];
};
type Quantidade = {
  id: number; conjunto: string | null; nome: string | null; tipo: string;
  valor: number | null; unidade: string | null; pendencia: string | null;
};
type Servico = { id: number; nome: string; unidade: string; ativo: boolean };
type Vinculo = { quantidade_id: number; servico_id: number };
const unidadeNormalizada = (valor: string | null) => (valor || "").toLowerCase().replaceAll("²", "2").replaceAll("³", "3");
const PAGE = 50;
const status: Record<string, string> = {
  aguardando_envio: "Aguardando envio", pendente: "Na fila",
  processando: "Processando", concluida: "Concluída", falha: "Falha",
};

export default function BimProject({ obraId, accessRole, ativo }: {
  obraId: number; accessRole: string; ativo: boolean;
}) {
  const canUpload = ativo && ["administrador", "engenheiro", "supervisor"].includes(accessRole);
  const canReview = ativo && ["administrador", "engenheiro"].includes(accessRole);
  const [imports, setImports] = useState<Importacao[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [elements, setElements] = useState<Elemento[]>([]);
  const [elementId, setElementId] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Quantidade[]>([]);
  const [services, setServices] = useState<Servico[]>([]);
  const [links, setLinks] = useState<Vinculo[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [revision, setRevision] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const { data, error: queryError } = await supabase.from("bim_importacoes")
      .select("*").eq("obra_id", obraId).order("criado_em", { ascending: false });
    if (queryError) throw queryError;
    const rows = (data || []) as Importacao[];
    setImports(rows);
    setSelectedId((current) => current && rows.some((row) => row.id === current)
      ? current : rows[0]?.id || "");
  }, [obraId]);
  useEffect(() => {
    void refresh().catch((cause) => setError(mensagemErro(cause)));
  }, [refresh]);
  useEffect(() => {
    if (!imports.some((item) => ["pendente", "processando"].includes(item.estado))) return;
    const timer = setInterval(() => {
      void refresh().catch((cause) => setError(mensagemErro(cause)));
    }, 8000);
    return () => clearInterval(timer);
  }, [imports, refresh]);
  useEffect(() => {
    void supabase.from("servicos").select("id,nome,unidade,ativo").eq("ativo", true).order("nome")
      .then(({ data, error: queryError }) => {
        if (queryError) setError(mensagemErro(queryError));
        else setServices((data || []) as Servico[]);
      });
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    void supabase.from("bim_vinculos_servico").select("quantidade_id,servico_id")
      .eq("importacao_id", selectedId)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(mensagemErro(queryError));
        else setLinks((data || []) as Vinculo[]);
      });
  }, [selectedId]);
  useEffect(() => {
    setElements([]); setPage(0); setCount(0); setElementId(null); setQuantities([]);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      const { data, error: queryError, count: total } = await supabase.from("bim_elementos")
        .select("id,global_id,classe,nome,local,pendencias", { count: "exact" })
        .eq("importacao_id", selectedId).order("id").range(page * PAGE, (page + 1) * PAGE - 1);
      if (queryError) throw queryError;
      if (!cancelled) { setElements((data || []) as Elemento[]); setCount(total || 0); }
    })().catch((cause) => { if (!cancelled) setError(mensagemErro(cause)); });
    return () => { cancelled = true; };
  }, [selectedId, page, imports]);
  useEffect(() => {
    if (!elementId) return;
    let cancelled = false;
    void (async () => {
      const { data, error: queryError } = await supabase.from("bim_quantidades")
        .select("id,conjunto,nome,tipo,valor,unidade,pendencia")
        .eq("elemento_id", elementId).order("id");
      if (queryError) throw queryError;
      if (!cancelled) setQuantities((data || []) as Quantidade[]);
    })().catch((cause) => { if (!cancelled) setError(mensagemErro(cause)); });
    return () => { cancelled = true; };
  }, [elementId]);
  const current = imports.find((row) => row.id === selectedId);

  async function linkQuantity(quantity: Quantidade, serviceId: string) {
    if (!current || !canUpload) return;
    setError(""); setBusy(true);
    try {
      if (serviceId) {
        const service = services.find((item) => item.id === Number(serviceId));
        if (!service || unidadeNormalizada(service.unidade) !== unidadeNormalizada(quantity.unidade)) {
          throw new Error("A unidade do serviço deve corresponder à medida do IFC.");
        }
        const { error: saveError } = await supabase.from("bim_vinculos_servico").upsert({
          quantidade_id: quantity.id, obra_id: obraId, importacao_id: current.id,
          servico_id: service.id,
        }, { onConflict: "quantidade_id" });
        if (saveError) throw saveError;
        setLinks((previous) => [...previous.filter((item) => item.quantidade_id !== quantity.id),
          { quantidade_id: quantity.id, servico_id: service.id }]);
      } else {
        const { error: saveError } = await supabase.from("bim_vinculos_servico")
          .delete().eq("quantidade_id", quantity.id).eq("obra_id", obraId);
        if (saveError) throw saveError;
        setLinks((previous) => previous.filter((item) => item.quantidade_id !== quantity.id));
      }
      setNotice("Vínculo com serviço atualizado.");
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally { setBusy(false); }
  }

  async function processRevision(id: string) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("A sessão expirou. Entre novamente para iniciar a extração.");
    const response = await fetch("/api/bim_process", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token },
      body: JSON.stringify({ import_id: id }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "O serviço de extração está temporariamente indisponível.");
    setNotice(result?.status === "concluida" ? "Extração concluída." : "A extração ainda não foi iniciada por esta solicitação. Confira o estado da revisão.");
  }

  async function retryCurrent() {
    if (!current || !canUpload || current.estado !== "pendente") return;
    setError(""); setNotice(""); setBusy(true);
    try {
      await processRevision(current.id);
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally {
      await refresh().catch((cause) => setError(mensagemErro(cause)));
      setBusy(false);
    }
  }

  async function removeCurrent() {
    if (!current || !canUpload || !["aguardando_envio", "pendente", "falha"].includes(current.estado) || !confirm("Excluir esta revisão IFC e seus dados?")) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      const storage = await supabase.storage.from("modelos-bim").remove([current.caminho_arquivo]);
      if (storage.error && !storage.error.message.includes("not found")) throw storage.error;
      const result = await supabase.from("bim_importacoes").delete().eq("id", current.id).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("A revisão não pôde ser excluída. Atualize a lista e confira o estado.");
      setNotice("Revisão IFC excluída.");
      await refresh();
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally { setBusy(false); }
  }

  async function reviewCurrent() {
    if (!current || !canReview || current.estado !== "concluida" || current.conferida_em) return;
    const detail = current.total_pendencias
      ? `Esta revisão possui ${current.total_pendencias} pendência(s). Confira os elementos e use apenas medidas válidas. Liberar para planejamento?`
      : "Você conferiu os elementos, quantitativos e unidades desta revisão? Liberar para planejamento?";
    if (!window.confirm(detail)) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      const { data: identity, error: identityError } = await supabase.auth.getUser();
      if (identityError || !identity.user) throw identityError || new Error("Entre novamente para conferir a revisão.");
      const { data, error: saveError } = await supabase.from("bim_importacoes")
        .update({ conferida_por: identity.user.id }).eq("id", current.id)
        .eq("obra_id", obraId).eq("estado", "concluida")
        .is("conferida_em", null).select("id").maybeSingle();
      if (saveError) throw saveError;
      if (!data) throw new Error("A revisão não pôde ser conferida. Atualize e tente novamente.");
      setNotice("Revisão conferida e liberada para o planejamento BIM.");
      await refresh();
    } catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!canUpload || !file) return;
    setError(""); setNotice("");
    const label = revision.trim();
    if (!label || label.length > 80) { setError("Informe uma revisão com até 80 caracteres."); return; }
    if (!file.name.toLowerCase().endsWith(".ifc") || !file.size || file.size > 200 * 1024 * 1024) {
      setError("Selecione um IFC de até 200 MB."); return;
    }
    setBusy(true); setProgress(0);
    try {
      let existing = imports.find((row) => row.revisao === label);
      if (existing && (existing.estado !== "aguardando_envio"
        || existing.nome_arquivo !== file.name || existing.tamanho_bytes !== file.size)) {
        throw new Error("Essa revisão já foi cadastrada. Escolha outro nome de revisão.");
      }
      if (!existing) {
        const id = crypto.randomUUID();
        const path = obraId + "/" + id + "/modelo.ifc";
        const result = await supabase.from("bim_importacoes").insert({
          id, obra_id: obraId, revisao: label, nome_arquivo: file.name,
          tamanho_bytes: file.size, caminho_arquivo: path,
        }).select("*").single();
        if (result.error) throw result.error;
        existing = result.data as Importacao;
      }
      await uploadIfc(file, existing.caminho_arquivo, existing.id, setProgress);
      const queued = await supabase.from("bim_importacoes")
        .update({ estado: "pendente" }).eq("id", existing.id)
        .eq("estado", "aguardando_envio").select("id").single();
      if (queued.error) throw queued.error;
      setSelectedId(existing.id);
      setFile(null); setRevision("");
      await processRevision(existing.id);
      await refresh();
    } catch (cause) {
      setError(mensagemErro(cause));
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  return <section aria-label="Projeto BIM">
    <div className="section-heading">
      <div><h2>Projeto BIM</h2>
        <p className="muted">Importe revisões IFC e confira elementos, unidades e pendências antes de planejar serviços.</p>
      </div>
      <button className="secondary" onClick={() => void refresh().catch((cause) => setError(mensagemErro(cause)))}>
        Atualizar
      </button>
    </div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {canUpload && <div className="panel editor">
      <h3>Enviar revisão IFC</h3>
      <div className="form-grid">
        <label>Revisão <input value={revision} maxLength={80} onChange={(event) => setRevision(event.target.value)} placeholder="Ex.: Estrutura R01" /></label>
        <label>Arquivo .ifc <input type="file" accept=".ifc" onChange={(event) => {
          const selected = event.target.files?.[0] || null;
          setFile(selected);
          if (selected && !revision.trim()) {
            const suggested = selected.name.replace(/\.ifc$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 80);
            setRevision(suggested);
          }
        }} /></label>
      </div>
      <p className="muted">Arquivo privado, até 200 MB. A revisão é preenchida pelo nome do arquivo e pode ser ajustada antes do envio. Arquivos grandes podem ser retomados após uma interrupção.</p>
      <button className="primary" disabled={busy || !file} onClick={() => void send()}>
        {busy ? "Enviando " + progress + "%" : "Importar IFC"}
      </button>
      {busy && <progress max={100} value={progress} aria-label="Envio do IFC" />}
    </div>}
    <div className="panel editor">
      <h3>Revisões</h3>
      {imports.length === 0 ? <p className="muted">Nenhuma revisão IFC cadastrada.</p> : <>
        <label>Revisão selecionada <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {imports.map((row) => <option key={row.id} value={row.id}>
            {row.revisao} · {status[row.estado] || row.estado}
          </option>)}
        </select></label>
        {current && <div>
          <p><strong>Arquivo:</strong> {current.nome_arquivo} · <strong>Formato:</strong> {current.schema_ifc || "Aguardando extração"}</p>
          <p><strong>Estado:</strong> {status[current.estado] || current.estado} · <strong>Elementos:</strong> {current.total_elementos} · <strong>Pendências:</strong> {current.total_pendencias}</p>
          {current.estado === "concluida" && <p className={current.conferida_em ? "alert success" : "notice"}>
            {current.conferida_em ? `Conferida em ${new Date(current.conferida_em).toLocaleString("pt-BR")}. Liberada para pacotes BIM.`
              : "A extração terminou. Confira elementos, medidas e unidades antes de liberar esta revisão para o planejamento."}
          </p>}
          {canReview && current.estado === "concluida" && !current.conferida_em &&
            <button className="primary" disabled={busy} onClick={() => void reviewCurrent()}>Conferir e liberar revisão</button>}
          {canUpload && current.estado === "pendente" &&
            <button className="secondary" disabled={busy} onClick={() => void retryCurrent()}>Tentar extração</button>}
          {canUpload && ["aguardando_envio", "pendente", "falha"].includes(current.estado) &&
            <button className="secondary" disabled={busy} onClick={() => void removeCurrent()}>Excluir revisão</button>}
          {current.erro && <p className="alert error">{current.erro}</p>}
          {current.estado === "aguardando_envio" && <p className="notice">Selecione o mesmo arquivo e revisão acima para retomar o envio.</p>}
        </div>}
      </>}
    </div>
    {current?.estado === "concluida" && <div className="panel editor">
      <h3>Elementos e quantitativos</h3>
      <p className="muted">Os valores são os quantitativos declarados no IFC; confira a origem e a unidade antes de usá-los no planejamento.</p>
      <div className="table-wrap responsive-table"><table>
        <thead><tr><th>GlobalId</th><th>Classe</th><th>Nome</th><th>Local</th><th>Pendências</th><th></th></tr></thead>
        <tbody>{elements.map((row) => <tr key={row.id}>
          <td>{row.global_id || "—"}</td><td>{row.classe}</td><td>{row.nome || "—"}</td>
          <td>{row.local || "—"}</td><td>{row.pendencias.length ? row.pendencias.join("; ") : "—"}</td>
          <td><button className="secondary" onClick={() => { setElementId(row.id); setQuantities([]); }}>Quantitativos</button></td>
        </tr>)}</tbody>
      </table></div>
      {count === 0 && <p className="muted">O modelo não contém elementos IFC utilizáveis.</p>}
      <div className="toolbar">
        <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
        <span>{count ? page * PAGE + 1 : 0}–{Math.min((page + 1) * PAGE, count)} de {count}</span>
        <button className="secondary" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>Próxima</button>
      </div>
      {elementId && <div className="panel editor">
        <h3>Quantitativos do elemento</h3>
        {quantities.length ? <div className="table-wrap responsive-table"><table>
          <thead><tr><th>Conjunto</th><th>Medida</th><th>Valor</th><th>Unidade</th><th>Pendência</th><th>Serviço</th></tr></thead>
          <tbody>{quantities.map((row) => <tr key={row.id}>
            <td>{row.conjunto || "—"}</td><td>{row.nome || row.tipo}</td>
            <td>{row.valor ?? "—"}</td><td>{row.unidade || "—"}</td>
            <td>{row.pendencia || "—"}</td>
            <td><select aria-label={"Serviço para " + (row.nome || row.tipo)}
              disabled={!canUpload || busy || !row.valor || Boolean(row.pendencia)}
              value={links.find((item) => item.quantidade_id === row.id)?.servico_id || ""}
              onChange={(event) => void linkQuantity(row, event.target.value)}>
              <option value="">Sem vínculo</option>
              {services.filter((item) => unidadeNormalizada(item.unidade) === unidadeNormalizada(row.unidade))
                .map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select></td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">Nenhum quantitativo declarado neste elemento.</p>}
      </div>}
    </div>}
    <BimPlanning obraId={obraId} accessRole={accessRole} ativo={ativo} revisoes={imports} />
  </section>;
}
