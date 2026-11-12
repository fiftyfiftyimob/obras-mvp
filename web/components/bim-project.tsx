"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { uploadIfc } from "../lib/bim-upload";

type Importacao = {
  id: string; revisao: string; nome_arquivo: string; caminho_arquivo: string;
  tamanho_bytes: number; estado: string; schema_ifc: string | null;
  total_elementos: number; total_pendencias: number; erro: string | null;
  criado_em: string; tentativas: number;
};
type Elemento = {
  id: number; global_id: string | null; classe: string; nome: string | null;
  local: string | null; pendencias: string[];
};
type Quantidade = {
  id: number; conjunto: string | null; nome: string | null; tipo: string;
  valor: number | null; unidade: string | null; pendencia: string | null;
};
const PAGE = 50;
const status: Record<string, string> = {
  aguardando_envio: "Aguardando envio", pendente: "Na fila",
  processando: "Processando", concluida: "Concluída", falha: "Falha",
};

export default function BimProject({ obraId, accessRole, ativo }: {
  obraId: number; accessRole: string; ativo: boolean;
}) {
  const canUpload = ativo && ["administrador", "engenheiro", "supervisor"].includes(accessRole);
  const [imports, setImports] = useState<Importacao[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [elements, setElements] = useState<Elemento[]>([]);
  const [elementId, setElementId] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Quantidade[]>([]);
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
      setNotice("Arquivo enviado. Iniciando a extração…");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const processResponse = await fetch("/api/bim_process", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ import_id: existing.id }),
        });
        if (!processResponse.ok) {
          let detail = "o processamento encontrou um erro temporário";
          const responseType = processResponse.headers.get("content-type") || "";
          if (responseType.includes("application/json")) {
            const payload = await processResponse.json() as { error?: string };
            if (payload.error) detail = payload.error;
          }
          throw new Error("A extração ficou na fila para uma nova tentativa: " + detail + ".");
        }
      }
      setNotice("Arquivo enviado e extração concluída. Atualizando a conferência.");
      setSelectedId(existing.id);
      setFile(null); setRevision("");
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
            const suggested = selected.name.replace(/\\.ifc$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 80);
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
          <thead><tr><th>Conjunto</th><th>Medida</th><th>Valor</th><th>Unidade</th><th>Pendência</th></tr></thead>
          <tbody>{quantities.map((row) => <tr key={row.id}>
            <td>{row.conjunto || "—"}</td><td>{row.nome || row.tipo}</td>
            <td>{row.valor ?? "—"}</td><td>{row.unidade || "—"}</td>
            <td>{row.pendencia || "—"}</td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">Nenhum quantitativo declarado neste elemento.</p>}
      </div>}
    </div>}
  </section>;
}
