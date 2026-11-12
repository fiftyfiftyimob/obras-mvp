"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { allRows } from "../lib/operacional";

type Material = { id: number; nome: string; unidade_estoque: string };
type Service = { id: number; nome: string; unidade: string };
type Composition = {
  id: string; servico_id: number; estado: string; criado_em: string; aprovado_em: string | null;
};
type Item = {
  id: number; composicao_id: string; material_id: number;
  consumo_por_unidade: number; perda_percentual: number;
};
type Package = { id: string; codigo: string; titulo: string; servico_id: number; quantidade_meta: number; unidade: string };
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export default function Composicoes({ obraId, accessRole, ativo, materiais }: {
  obraId: number; accessRole: string; ativo: boolean; materiais: Material[];
}) {
  const canManage = ativo && ["administrador", "engenheiro"].includes(accessRole);
  const [services, setServices] = useState<Service[]>([]);
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [consumption, setConsumption] = useState("");
  const [waste, setWaste] = useState("0");
  const [estimateId, setEstimateId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [serviceQuantity, setServiceQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [s, c, i, p] = await Promise.all([
      supabase.from("servicos").select("id,nome,unidade").eq("ativo", true).order("nome"),
      allRows(() => supabase.from("composicoes_servico").select("id,servico_id,estado,criado_em,aprovado_em")
        .eq("obra_id", obraId).order("criado_em", { ascending: false }).order("id")),
      allRows(() => supabase.from("composicao_itens").select("id,composicao_id,material_id,consumo_por_unidade,perda_percentual")
        .eq("obra_id", obraId).order("id")),
      allRows(() => supabase.from("bim_pacotes").select("id,codigo,titulo,servico_id,quantidade_meta,unidade")
        .eq("obra_id", obraId).eq("estado", "aprovado").is("substituido_por", null)
        .order("inicio", { ascending: false }).order("id")),
    ]);
    if (s.error) throw s.error;
    const rows = c as Composition[];
    setServices((s.data || []) as Service[]);
    setCompositions(rows);
    setItems(i as Item[]);
    setPackages(p as Package[]);
    setSelectedId((old) => rows.some((row) => row.id === old) ? old : rows[0]?.id || "");
    setEstimateId((old) => rows.some((row) => row.id === old && row.estado === "aprovada")
      ? old : rows.find((row) => row.estado === "aprovada")?.id || "");
  }, [obraId]);
  useEffect(() => { void refresh().catch((cause) => setError(mensagemErro(cause))); }, [refresh]);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); setNotice(message); }
    catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }
  function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !serviceId) return;
    void run(async () => {
      const { data, error: saveError } = await supabase.from("composicoes_servico")
        .insert({ obra_id: obraId, servico_id: Number(serviceId) }).select("id").single();
      if (saveError) throw saveError;
      setSelectedId(data.id);
    }, "Rascunho criado. Adicione os materiais e confira os coeficientes.");
  }
  function addItem(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !selectedId || !materialId) return;
    const amount = Number(consumption), loss = Number(waste);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(loss) || loss < 0 || loss > 100) {
      setError("Informe consumo positivo e perda entre 0% e 100%."); return;
    }
    void run(async () => {
      const { error: saveError } = await supabase.from("composicao_itens").insert({
        composicao_id: selectedId, obra_id: obraId, material_id: Number(materialId),
        consumo_por_unidade: amount, perda_percentual: loss,
      });
      if (saveError) throw saveError;
      setMaterialId(""); setConsumption(""); setWaste("0");
    }, "Material adicionado à composição.");
  }
  function removeItem(id: number) {
    if (!canManage || !window.confirm("Remover este material do rascunho?")) return;
    void run(async () => {
      const { error: saveError } = await supabase.from("composicao_itens")
        .delete().eq("id", id).eq("obra_id", obraId);
      if (saveError) throw saveError;
    }, "Material removido.");
  }
  function approve() {
    if (!canManage || !selectedId || !window.confirm(
      "Você conferiu coeficientes, unidades e perdas? Aprovar esta composição e arquivar a versão anterior do serviço?"
    )) return;
    void run(async () => {
      const { error: saveError } = await supabase.rpc("aprovar_composicao_servico", { p_id: selectedId });
      if (saveError) throw saveError;
      setEstimateId(selectedId);
    }, "Composição aprovada. Ela pode ser usada para estimar necessidades.");
  }
  function discard() {
    if (!canManage || !selectedId || !window.confirm("Descartar este rascunho e seus materiais?")) return;
    void run(async () => {
      const { error: saveError } = await supabase.from("composicoes_servico")
        .delete().eq("id", selectedId).eq("obra_id", obraId);
      if (saveError) throw saveError;
    }, "Rascunho descartado.");
  }

  const selected = compositions.find((row) => row.id === selectedId);
  const selectedService = services.find((row) => row.id === selected?.servico_id);
  const selectedItems = items.filter((row) => row.composicao_id === selectedId);
  const approved = compositions.filter((row) => row.estado === "aprovada");
  const estimate = approved.find((row) => row.id === estimateId);
  const estimateService = services.find((row) => row.id === estimate?.servico_id);
  const estimateItems = items.filter((row) => row.composicao_id === estimateId);
  const quantity = Number(serviceQuantity);
  const validQuantity = Number.isFinite(quantity) && quantity > 0;
  return <div className="panel editor">
    <h3>Composições de materiais por serviço</h3>
    <p className="muted">Defina o consumo em unidade de estoque por unidade de serviço. Apenas engenheiro ou administrador pode aprovar. Estimativas não geram solicitações ou pedidos automaticamente.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {canManage && <form onSubmit={createDraft}>
      <div className="form-grid">
        <label>Serviço <select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          <option value="">Selecione</option>{services.map((row) =>
            <option key={row.id} value={row.id}>{row.nome} · {row.unidade}</option>)}
        </select></label>
      </div>
      <button className="secondary" disabled={busy || !serviceId}>Criar nova versão em rascunho</button>
    </form>}
    <label>Versão <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Selecione</option>{compositions.map((row) =>
        <option key={row.id} value={row.id}>
          {services.find((s) => s.id === row.servico_id)?.nome || "Serviço #" + row.servico_id}
          {" · "}{row.estado}{" · "}{new Date(row.criado_em).toLocaleDateString("pt-BR")}
        </option>)}
    </select></label>
    {selected && <>
      <p><strong>{selectedService?.nome || "Serviço"}</strong> · {selected.estado}
        {selected.aprovado_em && " · aprovado em " + new Date(selected.aprovado_em).toLocaleString("pt-BR")}</p>
      {selected.estado === "rascunho" && canManage && <form onSubmit={addItem}>
        <div className="form-grid">
          <label>Material <select required value={materialId} onChange={(event) => setMaterialId(event.target.value)}>
            <option value="">Selecione</option>{materiais.filter((m) =>
              !selectedItems.some((item) => item.material_id === m.id)).map((m) =>
                <option key={m.id} value={m.id}>{m.nome} · {m.unidade_estoque}</option>)}
          </select></label>
          <label>Consumo por 1 {selectedService?.unidade || "unidade de serviço"}
            <input required type="number" min="0.000001" step="any" value={consumption}
              onChange={(event) => setConsumption(event.target.value)} />
          </label>
          <label>Perda prevista (%) <input required type="number" min="0" max="100" step="0.01"
            value={waste} onChange={(event) => setWaste(event.target.value)} /></label>
        </div>
        <button className="secondary" disabled={busy || !materialId}>Adicionar material</button>
      </form>}
      {!selectedItems.length ? <p className="notice">Adicione pelo menos um material.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr>
          <th>Material</th><th>Consumo por unidade</th><th>Perda</th><th>Ação</th>
        </tr></thead><tbody>{selectedItems.map((item) => {
          const material = materiais.find((m) => m.id === item.material_id);
          return <tr key={item.id}>
            <td>{material?.nome || "#" + item.material_id}</td>
            <td>{number(Number(item.consumo_por_unidade))} {material?.unidade_estoque} / {selectedService?.unidade}</td>
            <td>{number(Number(item.perda_percentual))}%</td>
            <td>{selected.estado === "rascunho" && canManage &&
              <button className="secondary" disabled={busy} onClick={() => removeItem(item.id)}>Remover</button>}</td>
          </tr>;
        })}</tbody></table></div>}
      {selected.estado === "rascunho" && canManage && <div className="row-actions">
        <button className="primary" disabled={busy || !selectedItems.length} onClick={approve}>Aprovar composição</button>
        <button className="secondary" disabled={busy} onClick={discard}>Descartar rascunho</button>
      </div>}
    </>}
    <h4>Estimar necessidade de materiais</h4>
    {!approved.length ? <p className="notice">Aprove uma composição para calcular a necessidade.</p> : <>
      <div className="form-grid">
        <label>Composição aprovada <select value={estimateId} onChange={(event) => {
          setEstimateId(event.target.value); setPackageId(""); setServiceQuantity("");
        }}>{approved.map((row) => <option key={row.id} value={row.id}>
          {services.find((s) => s.id === row.servico_id)?.nome || "Serviço #" + row.servico_id}
        </option>)}</select></label>
        <label>Pacote BIM aprovado (opcional) <select value={packageId} onChange={(event) => {
          const id = event.target.value; setPackageId(id);
          const pack = packages.find((row) => row.id === id);
          setServiceQuantity(pack ? String(pack.quantidade_meta) : "");
        }}><option value="">Quantidade manual</option>
          {packages.filter((row) => row.servico_id === estimate?.servico_id).map((row) =>
            <option key={row.id} value={row.id}>{row.codigo} · {row.titulo}</option>)}
        </select></label>
        <label>Quantidade do serviço ({estimateService?.unidade || "un"})
          <input type="number" min="0.0001" step="any" value={serviceQuantity}
            onChange={(event) => { setServiceQuantity(event.target.value); setPackageId(""); }} />
        </label>
      </div>
      {validQuantity && <div className="table-wrap responsive-table"><table><thead><tr>
        <th>Material</th><th>Consumo base</th><th>Perda</th><th>Necessidade estimada</th>
      </tr></thead><tbody>{estimateItems.map((item) => {
        const material = materiais.find((m) => m.id === item.material_id);
        const base = quantity * Number(item.consumo_por_unidade);
        const total = base * (1 + Number(item.perda_percentual) / 100);
        return <tr key={item.id}>
          <td>{material?.nome || "#" + item.material_id}</td>
          <td>{number(base)} {material?.unidade_estoque}</td>
          <td>{number(Number(item.perda_percentual))}%</td>
          <td><strong>{number(total)} {material?.unidade_estoque}</strong></td>
        </tr>;
      })}</tbody></table></div>}
    </>}
  </div>;
}
