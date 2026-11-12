"use client";
import { ChangeEvent, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { allRows } from "../lib/operacional";
import { downloadCsv, parseCsv } from "../lib/csv-exchange";

type Kind = "materiais" | "fornecedores";
type Row = Record<string, string>;
const columns: Record<Kind, string[]> = {
  materiais: ["nome","especificacao","unidade_estoque","unidade_compra","quantidade_por_embalagem"],
  fornecedores: ["nome","documento","contato","telefone","email"],
};
const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

export default function TrocaCompras({ obraId, accessRole, ativo, onImported }: {
  obraId: number; accessRole: string; ativo: boolean; onImported: () => Promise<void>;
}) {
  const canImport = ativo && ["administrador","engenheiro","supervisor"].includes(accessRole);
  const canExport = ["administrador","engenheiro","supervisor","estagiario"].includes(accessRole);
  const [kind, setKind] = useState<Kind>("materiais");
  const [preview, setPreview] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function template() {
    downloadCsv("modelo-" + kind + "-v1.csv", columns[kind], []);
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview([]); setError(""); setNotice("");
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 1024 * 1024)
        throw new Error("Selecione um CSV de até 1 MB.");
      const parsed = parseCsv(await file.text());
      const header = parsed[0].map(normalize);
      if (header.join("|") !== columns[kind].join("|"))
        throw new Error("Cabeçalho diferente do modelo " + kind + " v1. Baixe o modelo e mantenha a ordem das colunas.");
      if (parsed.length < 2 || parsed.length > 501)
        throw new Error("O arquivo deve ter de 1 a 500 linhas de dados.");
      const seen = new Set<string>();
      const rows = parsed.slice(1).map((values, index) => {
        const row = Object.fromEntries(columns[kind].map((column, i) => [column, values[i]])) as Row;
        const name = normalize(row.nome);
        if (name.length < 2 || name.length > (kind === "materiais" ? 120 : 160))
          throw new Error("Nome inválido na linha " + (index + 2) + ".");
        if (seen.has(name)) throw new Error("Nome repetido no arquivo: " + row.nome);
        seen.add(name);
        if (kind === "materiais") {
          row.quantidade_por_embalagem = row.quantidade_por_embalagem.replace(",", ".");
          const amount = Number(row.quantidade_por_embalagem);
          if (!["un","m","m²","m³","kg","l"].includes(row.unidade_estoque)
            || !row.unidade_compra || row.unidade_compra.length > 30
            || !Number.isFinite(amount) || amount <= 0)
            throw new Error("Unidade ou embalagem inválida na linha " + (index + 2) + ".");
        }
        return row;
      });
      setPreview(rows); setFileName(file.name);
      setNotice(rows.length + " linha(s) prontas para conferência.");
    } catch (cause) { setError(mensagemErro(cause)); }
  }
  async function importRows() {
    if (!canImport || !preview.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error: saveError } = await supabase.rpc("importar_catalogo_compras", {
        p_obra_id: obraId, p_tipo: kind, p_linhas: preview,
      });
      if (saveError) throw saveError;
      await onImported();
      setNotice(data.inseridos + " cadastrado(s), " + data.ignorados + " já existente(s).");
      setPreview([]); setFileName("");
    } catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }
  async function exportRows(type: "materiais" | "fornecedores" | "pedidos" | "recebimentos") {
    if (!canExport) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const spec = {
        materiais: { table: "materiais", fields: ["id","nome","especificacao","unidade_estoque","unidade_compra","quantidade_por_embalagem","ativo"] },
        fornecedores: { table: "fornecedores_materiais", fields: ["id","nome","documento","contato","telefone","email","ativo"] },
        pedidos: { table: "pedidos_compra", fields: ["id","cotacao_id","oferta_id","fornecedor_id","material_id","almoxarifado_id","quantidade","quantidade_recebida","custo_contratado","entrega_prevista","estado","criado_em"] },
        recebimentos: { table: "recebimentos_compra", fields: ["id","pedido_id","operacao_id","quantidade","documento","recebido_em","estorno_id","estornado_em"] },
      }[type];
      const rows = await allRows(() => supabase.from(spec.table).select(spec.fields.join(","))
        .eq("obra_id", obraId).order("id"));
      const headers = ["schema_version","obra_id",...spec.fields];
      downloadCsv("obra-" + obraId + "-" + type + "-v1.csv", headers,
        rows.map((row) => [1, obraId, ...spec.fields.map((field) => row[field] ?? "")]));
      setNotice(rows.length + " registro(s) exportado(s) em " + type + ".");
    } catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }

  return <div className="panel editor">
    <h3>Troca de dados de compras (CSV v1)</h3>
    <p className="muted">Importe catálogos e exporte registros com IDs internos, datas ISO e decimais com ponto. A importação ignora nomes já cadastrados nesta obra e é concluída por inteiro ou rejeitada sem registros parciais.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {canImport && <>
      <div className="form-grid">
        <label>Catálogo <select value={kind} onChange={(event) => {
          setKind(event.target.value as Kind); setPreview([]); setFileName(""); setError(""); setNotice("");
        }}><option value="materiais">Materiais</option><option value="fornecedores">Fornecedores</option></select></label>
        <label>Arquivo CSV <input type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event)} /></label>
      </div>
      <div className="row-actions">
        <button className="secondary" disabled={busy} onClick={template}>Baixar modelo {kind}</button>
        <button className="primary" disabled={busy || !preview.length} onClick={() => void importRows()}>
          Importar {preview.length} linha(s)
        </button>
      </div>
      {preview.length > 0 && <div>
        <p className="muted">{fileName} · confira as primeiras {Math.min(5, preview.length)} linhas antes de importar.</p>
        <div className="table-wrap responsive-table"><table><thead><tr>
          {columns[kind].map((column) => <th key={column}>{column}</th>)}
        </tr></thead><tbody>{preview.slice(0, 5).map((row, index) => <tr key={index}>
          {columns[kind].map((column) => <td key={column}>{row[column] || "—"}</td>)}
        </tr>)}</tbody></table></div>
      </div>}
    </>}
    {canExport && <div className="row-actions">
      {(["materiais","fornecedores","pedidos","recebimentos"] as const).map((type) =>
        <button key={type} className="secondary" disabled={busy} onClick={() => void exportRows(type)}>
          Exportar {type}
        </button>)}
    </div>}
  </div>;
}
