"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { allRows } from "../lib/operacional";

type Revision = { id: string; revisao: string; estado: string };
type Service = { id: number; nome: string; unidade: string; ativo: boolean; produtividade_referencia: number | null };
type Front = { id: number; nome: string };
type Team = { id: number; nome: string };
type Link = { quantidade_id: number; servico_id: number };
type Quantity = { id: number; elemento_id: number; nome: string | null; tipo: string; valor: number; unidade: string | null };
type Element = { id: number; global_id: string | null; nome: string | null; local: string | null };
type Package = {
  id: string; importacao_id: string; codigo: string; titulo: string; frente_id: number;
  servico_id: number; equipe_id: number; inicio: string; fim: string;
  quantidade_meta: number; unidade: string; estado: string;
  horas_equipe_previstas: number | null; produtividade_referencia: number | null; substituido_por: string | null;
};
type Source = { pacote_id: string; quantidade_id: number; valor: number };
type Dependency = { pacote_id: string; predecessor_id: string };
type Week = {
  id: string; pacote_id: string; semana_inicio: string; semana_fim: string;
  quantidade_meta: number; compromisso_id: number | null;
};
type Replan = { id: string; pacote_id: string; nova_importacao_id: string; decisao: string;
  pacote_novo_id: string | null; motivo: string; registrado_em: string };
type Difference = {
  global_id: string | null; classe_anterior: string | null; classe_nova: string | null;
  elemento_anterior: string | null; elemento_novo: string | null;
  local_anterior: string | null; local_novo: string | null;
  medida: string; unidade: string | null; valor_anterior: number | null;
  valor_novo: number | null; delta: number | null; situacao: string; observacao: string | null;
};
const stateName: Record<string,string> = {
  igual: "Sem mudança", alterado: "Alterado", adicionado: "Adicionado",
  removido: "Removido", pendente: "Pendência", verificar_identificador: "Conferir identificador",
};
const amount = (value: number | null | undefined) =>
  value == null ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const date = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR");
const PAGE = 50;

export default function BimPlanning({ obraId, accessRole, ativo, revisoes }: {
  obraId: number; accessRole: string; ativo: boolean; revisoes: Revision[];
}) {
  const concluded = revisoes.filter((r) => r.estado === "concluida");
  const canPlan = ativo && ["administrador","engenheiro","supervisor"].includes(accessRole);
  const canApprove = ativo && ["administrador","engenheiro"].includes(accessRole);
  const [packages, setPackages] = useState<Package[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [replans, setReplans] = useState<Replan[]>([]);
  const [hoursByPackage, setHoursByPackage] = useState<Record<string,string>>({});
  const [services, setServices] = useState<Service[]>([]);
  const [fronts, setFronts] = useState<Front[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [revisionId, setRevisionId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [page, setPage] = useState(0);
  const [sourceCount, setSourceCount] = useState(0);
  const [quantityRows, setQuantityRows] = useState<Quantity[]>([]);
  const [elements, setElements] = useState<Element[]>([]);
  const [used, setUsed] = useState<Record<number,number>>({});
  const [allocations, setAllocations] = useState<Record<number,string>>({});
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [frontId, setFrontId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [predecessorIds, setPredecessorIds] = useState<string[]>([]);
  const [packageId, setPackageId] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [weekAmount, setWeekAmount] = useState("");
  const [editingWeekId, setEditingWeekId] = useState("");
  const [editWeekEnd, setEditWeekEnd] = useState("");
  const [editWeekAmount, setEditWeekAmount] = useState("");
  const [baseId, setBaseId] = useState("");
  const [newId, setNewId] = useState("");
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [replanPackageId, setReplanPackageId] = useState("");
  const [replanRevisionId, setReplanRevisionId] = useState("");
  const [replanDecision, setReplanDecision] = useState("manter");
  const [replanNewPackageId, setReplanNewPackageId] = useState("");
  const [replanReason, setReplanReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (concluded.length && !concluded.some((r) => r.id === revisionId)) setRevisionId(concluded[0].id);
    if (concluded.length && !concluded.some((r) => r.id === baseId)) setBaseId(concluded[0].id);
    if (concluded.length > 1 && !concluded.some((r) => r.id === newId))
      setNewId(concluded.find((r) => r.id !== concluded[0].id)?.id || "");
  }, [revisoes, revisionId, baseId, newId]);

  const refresh = useCallback(async () => {
    const [p, f, d, w, servicesResult, frontsResult, teamsResult, replansResult] = await Promise.all([
      allRows(() => supabase.from("bim_pacotes")
        .select("id,importacao_id,codigo,titulo,frente_id,servico_id,equipe_id,inicio,fim,quantidade_meta,unidade,estado,horas_equipe_previstas,produtividade_referencia,substituido_por")
        .eq("obra_id", obraId).is("cancelado_em", null).order("inicio").order("id")),
      allRows(() => supabase.from("bim_pacote_fontes").select("pacote_id,quantidade_id,valor").order("pacote_id")),
      allRows(() => supabase.from("bim_pacote_predecessores").select("pacote_id,predecessor_id").order("pacote_id")),
      allRows(() => supabase.from("bim_pacote_semanas")
        .select("id,pacote_id,semana_inicio,semana_fim,quantidade_meta,compromisso_id")
        .eq("obra_id", obraId).order("semana_inicio").order("id")),
      allRows(() => supabase.from("servicos").select("id,nome,unidade,ativo,produtividade_referencia")
        .eq("ativo", true).order("nome").order("id")),
      allRows(() => supabase.from("frentes").select("id,nome")
        .eq("obra_id", obraId).eq("ativo", true).order("nome").order("id")),
      allRows(() => supabase.from("equipes").select("id,nome")
        .eq("obra_id", obraId).eq("ativo", true).order("nome").order("id")),
      allRows(() => supabase.from("bim_replanejamentos")
        .select("id,pacote_id,nova_importacao_id,decisao,pacote_novo_id,motivo,registrado_em")
        .eq("obra_id", obraId).order("registrado_em", { ascending: false }).order("id")),
    ]);
    const packageRows = p as Package[];
    const packageIds = new Set(packageRows.map((row) => row.id));
    setPackages(packageRows);
    setSources((f as Source[]).filter((row) => packageIds.has(row.pacote_id)));
    setDependencies((d as Dependency[]).filter((row) => packageIds.has(row.pacote_id)));
    setWeeks(w as Week[]);
    setServices(servicesResult as Service[]);
    setFronts(frontsResult as Front[]);
    setTeams(teamsResult as Team[]);
    setReplans(replansResult as Replan[]);
  }, [obraId]);
  useEffect(() => { void refresh().catch((cause) => setError(mensagemErro(cause))); }, [refresh]);

  useEffect(() => {
    setPage(0); setAllocations({});
  }, [revisionId, serviceId]);
  useEffect(() => {
    if (!revisionId || !serviceId) { setQuantityRows([]); setSourceCount(0); return; }
    let cancelled = false;
    void (async () => {
      const linksResult = await supabase.from("bim_vinculos_servico")
        .select("quantidade_id,servico_id", { count: "exact" })
        .eq("importacao_id", revisionId).eq("servico_id", Number(serviceId))
        .order("quantidade_id").range(page * PAGE,(page + 1) * PAGE - 1);
      if (linksResult.error) throw linksResult.error;
      const links = (linksResult.data || []) as Link[];
      const ids = links.map((row) => row.quantidade_id);
      if (!ids.length) {
        if (!cancelled) { setQuantityRows([]); setElements([]); setUsed({}); setSourceCount(linksResult.count || 0); }
        return;
      }
      const quantitiesResult = await supabase.from("bim_quantidades")
        .select("id,elemento_id,nome,tipo,valor,unidade").in("id", ids);
      if (quantitiesResult.error) throw quantitiesResult.error;
      const quantityRows = (quantitiesResult.data || []) as Quantity[];
      const elementIds = Array.from(new Set(quantityRows.map((row) => row.elemento_id)));
      const [elementsResult, usedResult] = await Promise.all([
        supabase.from("bim_elementos").select("id,global_id,nome,local").in("id", elementIds),
        supabase.from("bim_quantidades_alocadas").select("quantidade_id,valor_alocado").eq("obra_id", obraId).in("quantidade_id", ids),
      ]);
      if (elementsResult.error) throw elementsResult.error;
      if (usedResult.error) throw usedResult.error;
      const usage: Record<number,number> = {};
      for (const row of usedResult.data || []) usage[row.quantidade_id] = Number(row.valor_alocado);
      if (!cancelled) {
        setQuantityRows(quantityRows.sort((a,b) => ids.indexOf(a.id)-ids.indexOf(b.id)));
        setElements((elementsResult.data || []) as Element[]);
        setUsed(usage); setSourceCount(linksResult.count || 0);
      }
    })().catch((cause) => { if (!cancelled) setError(mensagemErro(cause)); });
    return () => { cancelled = true; };
  }, [revisionId, serviceId, page, packages]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); setNotice(success); }
    catch (cause) { setError(mensagemErro(cause)); }
    finally { setBusy(false); }
  }
  function createPackage(event: FormEvent) {
    event.preventDefault();
    if (!canPlan) return;
    const chosen = Object.entries(allocations)
      .map(([id,valor]) => ({ quantidade_id: Number(id), valor: Number(valor) }))
      .filter((row) => Number.isFinite(row.valor) && row.valor > 0);
    if (!revisionId || !serviceId || !frontId || !teamId || !code.trim() || !title.trim()
      || !start || !end || end < start || !chosen.length) {
      setError("Preencha os dados do pacote e aloque ao menos um quantitativo."); return;
    }
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("criar_pacote_bim", {
        p_id: crypto.randomUUID(), p_obra_id: obraId, p_importacao_id: revisionId,
        p_codigo: code.trim(), p_titulo: title.trim(), p_frente_id: Number(frontId),
        p_servico_id: Number(serviceId), p_equipe_id: Number(teamId),
        p_inicio: start, p_fim: end, p_fontes: chosen, p_predecessores: predecessorIds,
      });
      if (rpcError) throw rpcError;
      setCode(""); setTitle(""); setAllocations({}); setPredecessorIds([]);
    }, "Pacote BIM criado em rascunho.");
  }
  function discardDraft(row: Package) {
    if (!canPlan || !window.confirm("Descartar este rascunho? A alocação IFC será liberada para outro pacote.")) return;
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("descartar_rascunho_pacote_bim", { p_id: row.id });
      if (rpcError) throw rpcError;
    }, "Rascunho descartado. Os quantitativos voltaram a ficar disponíveis.");
  }
  function approvePackage(row: Package) {
    if (!canApprove) return;
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("aprovar_pacote_bim", { p_id: row.id });
      if (rpcError) throw rpcError;
    }, "Pacote BIM aprovado.");
  }
  function createWeek(event: FormEvent) {
    event.preventDefault();
    if (!canPlan || !packageId) return;
    const qty = Number(weekAmount);
    if (!weekStart || !weekEnd || weekEnd < weekStart || !Number.isFinite(qty) || qty <= 0) {
      setError("Informe uma semana e quantidade válidas."); return;
    }
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("criar_proposta_bim", {
        p_id: crypto.randomUUID(), p_pacote_id: packageId,
        p_semana_inicio: weekStart, p_semana_fim: weekEnd, p_quantidade: qty,
      });
      if (rpcError) throw rpcError;
      setWeekAmount("");
    }, "Proposta semanal criada.");
  }
  function saveWeek(row: Week) {
    if (!canPlan) return;
    const qty = Number(editWeekAmount);
    if (!editWeekEnd || editWeekEnd < row.semana_inicio || !Number.isFinite(qty) || qty <= 0) {
      setError("Informe uma data final e quantidade válidas."); return;
    }
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("alterar_proposta_bim", {
        p_id: row.id, p_semana_fim: editWeekEnd, p_quantidade: qty,
      });
      if (rpcError) throw rpcError;
      setEditingWeekId(""); setEditWeekEnd(""); setEditWeekAmount("");
    }, "Proposta semanal atualizada.");
  }
  function publishWeek(row: Week) {
    if (!canApprove) return;
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("publicar_proposta_bim", { p_id: row.id });
      if (rpcError) throw rpcError;
    }, "Compromisso semanal publicado com origem BIM.");
  }
  function compare() {
    if (!baseId || !newId || baseId === newId) { setError("Escolha duas revisões concluídas diferentes."); return; }
    void run(async () => {
      const { data, error: rpcError } = await supabase.rpc("comparar_revisoes_bim", {
        p_base: baseId, p_nova: newId,
      });
      if (rpcError) throw rpcError;
      setDifferences((data || []) as Difference[]);
      setReplanRevisionId(newId);
    }, "Comparação concluída. Confira os itens alterados e os identificadores incertos.");
  }

  function saveCapacity(row: Package) {
    if (!canPlan) return;
    const hours = Number(hoursByPackage[row.id] || row.horas_equipe_previstas);
    if (!Number.isFinite(hours) || hours <= 0) { setError("Informe as horas previstas da equipe."); return; }
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("definir_capacidade_pacote_bim", {
        p_id: row.id, p_horas: hours,
      });
      if (rpcError) throw rpcError;
    }, "Capacidade do pacote registrada.");
  }
  function recordReplan(event: FormEvent) {
    event.preventDefault();
    if (!canApprove) return;
    const oldPackage = packages.find((p) => p.id === replanPackageId);
    if (!oldPackage || !replanRevisionId || !replanReason.trim()
      || (replanDecision === "substituir" && !replanNewPackageId)) {
      setError("Selecione o pacote, a nova revisão, a decisão e o motivo."); return;
    }
    void run(async () => {
      const { error: rpcError } = await supabase.rpc("registrar_replanejamento_bim", {
        p_pacote_id: replanPackageId, p_nova_importacao_id: replanRevisionId,
        p_decisao: replanDecision, p_motivo: replanReason.trim(),
        p_pacote_novo_id: replanDecision === "substituir" ? replanNewPackageId : null,
      });
      if (rpcError) throw rpcError;
      setReplanReason(""); setReplanNewPackageId("");
    }, "Decisão de replanejamento registrada, mantendo a linha de base.");
  }
  const selectedService = services.find((s) => s.id === Number(serviceId));
  const selectedPackage = packages.find((p) => p.id === packageId);
  const planned = selectedPackage ? weeks.filter((w) => w.pacote_id === selectedPackage.id)
    .reduce((sum,w) => sum + Number(w.quantidade_meta),0) : 0;
  const changed = differences.filter((d) => d.situacao !== "igual");
  const oldPackage = packages.find((p) => p.id === replanPackageId);
  const availableNewPackages = packages.filter((p) => oldPackage && p.importacao_id === replanRevisionId
    && p.estado === "aprovado" && !p.substituido_por && p.servico_id === oldPackage.servico_id
    && p.frente_id === oldPackage.frente_id);
  return <section aria-label="Planejamento BIM">
    <div className="section-heading"><div><h2>Planejamento BIM</h2>
      <p className="muted">Organize os quantitativos conferidos em pacotes, aprove o cronograma e publique metas semanais com origem rastreável.</p>
    </div><button className="secondary" disabled={busy} onClick={() => void refresh().catch((cause) => setError(mensagemErro(cause)))}>Atualizar pacotes</button></div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    {!concluded.length && <p className="notice">Conclua a extração de uma revisão IFC antes de montar pacotes.</p>}
    {canPlan && concluded.length > 0 && <div className="panel editor">
      <h3>Novo pacote da EAP</h3>
      <form onSubmit={createPackage}>
        <div className="form-grid">
          <label>Revisão IFC <select value={revisionId} onChange={(e) => setRevisionId(e.target.value)}>{concluded.map((r) => <option key={r.id} value={r.id}>{r.revisao}</option>)}</select></label>
          <label>Código EAP <input required maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: 03.02" /></label>
          <label>Título <input required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Alvenaria térreo" /></label>
          <label>Serviço <select required value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">Selecione</option>{services.map((s) => <option key={s.id} value={s.id}>{s.nome} · {s.unidade}</option>)}</select></label>
          <label>Frente <select required value={frontId} onChange={(e) => setFrontId(e.target.value)}><option value="">Selecione</option>{fronts.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
          <label>Equipe <select required value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">Selecione</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
          <label>Início <input required type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Fim <input required type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <p className="muted">Predecessores são pacotes que precisam terminar até o início deste pacote. A aprovação exige que estejam aprovados.</p>
        <div className="row-actions">{packages.filter((p) => p.fim <= start && start).map((p) =>
          <label key={p.id}><input type="checkbox" checked={predecessorIds.includes(p.id)}
            onChange={(e) => setPredecessorIds((current) => e.target.checked ? [...current,p.id] : current.filter((id) => id !== p.id))} />
            {p.codigo} · {p.titulo}</label>)}</div>
        <h4>Quantitativos vinculados ao serviço</h4>
        {!serviceId ? <p className="muted">Selecione o serviço para ver as fontes IFC.</p> :
          !sourceCount ? <p className="notice">Nenhum quantitativo desta revisão está vinculado a {selectedService?.nome}. Faça o vínculo em Elementos e quantitativos acima.</p> :
          <><div className="table-wrap responsive-table"><table><thead><tr><th>Elemento</th><th>Medida</th><th>Total IFC</th><th>Já alocado</th><th>Alocar neste pacote</th></tr></thead>
            <tbody>{quantityRows.map((q) => {
              const element = elements.find((e) => e.id === q.elemento_id);
              const available = Number(q.valor) - Number(used[q.id] || 0);
              return <tr key={q.id}>
                <td>{element?.nome || element?.global_id || "#" + q.elemento_id}<p className="muted">{element?.local || ""}</p></td>
                <td>{q.nome || q.tipo}</td><td>{amount(q.valor)} {q.unidade}</td><td>{amount(used[q.id] || 0)} {q.unidade}</td>
                <td><input aria-label={"Alocar quantitativo " + q.id} type="number" min="0" max={Math.max(0,available)} step="any"
                  disabled={available <= 0 || busy} value={allocations[q.id] || ""}
                  onChange={(e) => setAllocations((current) => ({ ...current, [q.id]: e.target.value }))} /></td>
              </tr>;
            })}</tbody></table></div>
            <div className="toolbar"><button type="button" className="secondary" disabled={page === 0} onClick={() => setPage(page-1)}>Anterior</button>
              <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE,sourceCount)} de {sourceCount}</span>
              <button type="button" className="secondary" disabled={(page+1)*PAGE >= sourceCount} onClick={() => setPage(page+1)}>Próxima</button></div>
          </>}
        <p className="muted">{Object.values(allocations).filter((value) => Number(value) > 0).length} fonte(s) selecionada(s). As alocações podem ocupar várias páginas.</p>
        <button className="primary" disabled={busy || !sourceCount}>Criar pacote</button>
      </form>
    </div>}
    <div className="panel editor">
      <h3>Cronograma mestre</h3>
      {!packages.length ? <p className="muted">Nenhum pacote da EAP cadastrado.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Pacote</th><th>Revisão</th><th>Frente / serviço</th><th>Equipe</th><th>Período</th><th>Meta</th><th>Capacidade</th><th>Estado</th><th></th></tr></thead>
          <tbody>{packages.map((p) => <tr key={p.id}>
            <td><strong>{p.codigo}</strong> · {p.titulo}
              {dependencies.filter((d) => d.pacote_id === p.id).map((d) =>
                <p className="muted" key={d.predecessor_id}>Após {packages.find((x) => x.id === d.predecessor_id)?.codigo || "pacote anterior"}</p>)}</td>
            <td>{revisoes.find((r) => r.id === p.importacao_id)?.revisao || p.importacao_id.slice(0,8)}</td>
            <td>{fronts.find((f) => f.id === p.frente_id)?.nome || "#" + p.frente_id} · {services.find((s) => s.id === p.servico_id)?.nome || "#" + p.servico_id}</td>
            <td>{teams.find((t) => t.id === p.equipe_id)?.nome || "#" + p.equipe_id}</td>
            <td>{date(p.inicio)}–{date(p.fim)}</td><td>{amount(p.quantidade_meta)} {p.unidade}</td>
            <td>{p.estado === "rascunho" && canPlan
              ? <><input aria-label={"Horas disponíveis para " + p.codigo} type="number" min="0.01" step="any"
                  value={hoursByPackage[p.id] ?? (p.horas_equipe_previstas ?? "")}
                  onChange={(e) => setHoursByPackage((current) => ({ ...current, [p.id]: e.target.value }))} />
                  <button className="secondary" disabled={busy} onClick={() => saveCapacity(p)}>Salvar horas</button></>
              : <>{amount(p.horas_equipe_previstas)} h</>}
              {Number(p.produtividade_referencia || services.find((item) => item.id === p.servico_id)?.produtividade_referencia) > 0 &&
                <p className="muted">Necessárias: {amount(Number(p.quantidade_meta) /
                  Number(p.produtividade_referencia || services.find((item) => item.id === p.servico_id)?.produtividade_referencia))} h pela produtividade de referência</p>}
            </td>
            <td>{p.substituido_por ? "Substituído" : p.estado === "aprovado" ? "Aprovado" : "Rascunho"}</td>
            <td>{p.estado === "rascunho" && <div className="row-actions">{canApprove && <button className="secondary" disabled={busy || !p.horas_equipe_previstas} onClick={() => approvePackage(p)}>Aprovar</button>}{canPlan && <button className="secondary" disabled={busy} onClick={() => discardDraft(p)}>Descartar rascunho</button>}</div>}</td>
          </tr>)}</tbody></table></div>}
    </div>
    <div className="panel editor">
      <h3>Compromissos semanais do BIM</h3>
      {canPlan && <form onSubmit={createWeek}>
        <div className="form-grid">
          <label>Pacote aprovado <select required value={packageId} onChange={(e) => setPackageId(e.target.value)}><option value="">Selecione</option>{packages.filter((p) => p.estado === "aprovado" && !p.substituido_por).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.titulo}</option>)}</select></label>
          <label>Início da semana <input required type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} /></label>
          <label>Fim da semana <input required type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} /></label>
          <label>Meta da semana <input required type="number" min="0.0001" step="any" value={weekAmount} onChange={(e) => setWeekAmount(e.target.value)} /></label>
        </div>
        {selectedPackage && <p className="muted">Período do pacote: {date(selectedPackage.inicio)}–{date(selectedPackage.fim)}. Já distribuído: {amount(planned)} de {amount(selectedPackage.quantidade_meta)} {selectedPackage.unidade}.</p>}
        <button className="primary" disabled={busy || !selectedPackage}>Criar proposta</button>
      </form>}
      {!weeks.length ? <p className="muted">Nenhuma semana proposta a partir de um pacote BIM.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Pacote</th><th>Semana</th><th>Meta</th><th>Publicação</th><th></th></tr></thead>
          <tbody>{weeks.map((w) => {
            const p = packages.find((item) => item.id === w.pacote_id);
            return <tr key={w.id}>
              <td>{p ? p.codigo + " · " + p.titulo : "Pacote " + w.pacote_id.slice(0,8)}</td>
              <td>{date(w.semana_inicio)}–{editingWeekId === w.id
                ? <input aria-label={"Fim da proposta " + w.id} type="date" value={editWeekEnd}
                    onChange={(e) => setEditWeekEnd(e.target.value)} />
                : date(w.semana_fim)}</td>
              <td>{editingWeekId === w.id
                ? <input aria-label={"Meta da proposta " + w.id} type="number" min="0.0001" step="any"
                    value={editWeekAmount} onChange={(e) => setEditWeekAmount(e.target.value)} />
                : amount(w.quantidade_meta)} {p?.unidade}</td>
              <td>{w.compromisso_id ? "Compromisso #" + w.compromisso_id : "Proposta"}</td>
              <td><div className="row-actions">
                {editingWeekId === w.id ? <>
                  <button className="secondary" disabled={busy} onClick={() => saveWeek(w)}>Salvar</button>
                  <button className="secondary" disabled={busy} onClick={() => setEditingWeekId("")}>Cancelar</button>
                </> : !w.compromisso_id && !p?.substituido_por && <>
                  {canPlan && <button className="secondary" disabled={busy} onClick={() => {
                    setEditingWeekId(w.id); setEditWeekEnd(w.semana_fim);
                    setEditWeekAmount(String(w.quantidade_meta));
                  }}>Editar proposta</button>}
                  {canApprove && <button className="secondary" disabled={busy} onClick={() => publishWeek(w)}>Publicar no planejamento</button>}
                </>}
              </div></td>
            </tr>;
          })}</tbody></table></div>}
    </div>
    <div className="panel editor">
      <h3>Comparar revisões IFC</h3>
      <p className="muted">A comparação usa o GlobalId e a medida declarada no IFC. Identificadores ausentes ou trocados precisam de conferência; nenhum pacote aprovado é alterado automaticamente.</p>
      <div className="form-grid">
        <label>Revisão anterior <select value={baseId} onChange={(e) => { setBaseId(e.target.value); setDifferences([]); }}><option value="">Selecione</option>{concluded.map((r) => <option key={r.id} value={r.id}>{r.revisao}</option>)}</select></label>
        <label>Nova revisão <select value={newId} onChange={(e) => { setNewId(e.target.value); setDifferences([]); }}><option value="">Selecione</option>{concluded.map((r) => <option key={r.id} value={r.id}>{r.revisao}</option>)}</select></label>
      </div>
      <button className="secondary" disabled={busy || concluded.length < 2 || !baseId || !newId || baseId === newId} onClick={compare}>Comparar revisões</button>
      {concluded.length < 2 && <p className="muted">Importe outra revisão concluída para conferir mudanças do projeto.</p>}
      {differences.length > 0 && <>
        <p className="muted">{changed.length} medida(s) com mudança ou pendência de {differences.length} comparadas. Os pacotes da revisão anterior continuam como linha de base; crie um novo pacote para a nova revisão após conferir o impacto.</p>
        <div className="table-wrap responsive-table"><table><thead><tr><th>GlobalId</th><th>Elemento</th><th>Medida</th><th>Anterior</th><th>Nova</th><th>Diferença</th><th>Situação</th></tr></thead>
          <tbody>{differences.filter((d) => d.situacao !== "igual").map((d,index) => <tr key={(d.global_id || "sem-id") + "-" + d.medida + "-" + index}>
            <td>{d.global_id || "Sem GlobalId"}</td>
            <td>{d.elemento_novo || d.elemento_anterior || "—"}
              {d.local_anterior !== d.local_novo && <p className="muted">{d.local_anterior || "—"} → {d.local_novo || "—"}</p>}</td>
            <td>{d.medida}</td><td>{amount(d.valor_anterior)} {d.unidade}</td><td>{amount(d.valor_novo)} {d.unidade}</td>
            <td>{amount(d.delta)} {d.unidade}</td><td>{stateName[d.situacao] || d.situacao}
              {d.observacao && <p className="muted">{d.observacao}</p>}</td>
          </tr>)}</tbody></table></div>
      </>}
    </div>
    <div className="panel editor">
      <h3>Decisão de replanejamento</h3>
      <p className="muted">A linha de base aprovada permanece registrada. Ao substituir, o pacote antigo deixa de receber novas semanas; os compromissos já publicados continuam no histórico.</p>
      {canApprove && concluded.length > 1 && <form onSubmit={recordReplan}>
        <div className="form-grid">
          <label>Pacote da linha de base <select required value={replanPackageId}
            onChange={(e) => { setReplanPackageId(e.target.value); setReplanNewPackageId(""); }}>
            <option value="">Selecione</option>{packages.filter((p) => p.estado === "aprovado" && !p.substituido_por).map((p) =>
              <option key={p.id} value={p.id}>{p.codigo} · {p.titulo}</option>)}
          </select></label>
          <label>Nova revisão <select required value={replanRevisionId}
            onChange={(e) => { setReplanRevisionId(e.target.value); setReplanNewPackageId(""); }}>
            <option value="">Selecione</option>{concluded.filter((r) => r.id !== oldPackage?.importacao_id).map((r) =>
              <option key={r.id} value={r.id}>{r.revisao}</option>)}
          </select></label>
          <label>Decisão <select value={replanDecision} onChange={(e) => setReplanDecision(e.target.value)}>
            <option value="manter">Manter linha de base</option><option value="substituir">Substituir por novo pacote</option>
          </select></label>
          {replanDecision === "substituir" && <label>Novo pacote aprovado <select required value={replanNewPackageId}
            onChange={(e) => setReplanNewPackageId(e.target.value)}>
            <option value="">Selecione</option>{availableNewPackages.map((p) =>
              <option key={p.id} value={p.id}>{p.codigo} · {p.titulo} · {amount(p.quantidade_meta)} {p.unidade}</option>)}
          </select></label>}
          <label>Motivo e decisão técnica <textarea required minLength={5} maxLength={1000}
            value={replanReason} onChange={(e) => setReplanReason(e.target.value)}
            placeholder="Descreva o impacto da revisão e como o saldo de trabalho foi tratado." /></label>
        </div>
        {replanDecision === "substituir" && !availableNewPackages.length && <p className="notice">Crie e aprove antes um pacote da nova revisão, com o mesmo serviço e frente. Aloque apenas o trabalho a planejar na nova linha de base.</p>}
        <button className="primary" disabled={busy || !replanPackageId || !replanRevisionId
          || (replanDecision === "substituir" && !replanNewPackageId)}>Registrar decisão</button>
      </form>}
      {!replans.length ? <p className="muted">Nenhuma decisão registrada entre revisões.</p> :
        <div className="table-wrap responsive-table"><table><thead><tr><th>Registrado em</th><th>Pacote anterior</th><th>Nova revisão</th><th>Decisão</th><th>Motivo</th></tr></thead>
          <tbody>{replans.map((r) => <tr key={r.id}>
            <td>{new Date(r.registrado_em).toLocaleString("pt-BR")}</td>
            <td>{packages.find((p) => p.id === r.pacote_id)?.codigo || r.pacote_id.slice(0,8)}</td>
            <td>{revisoes.find((i) => i.id === r.nova_importacao_id)?.revisao || r.nova_importacao_id.slice(0,8)}</td>
            <td>{r.decisao === "substituir" ? "Substituído por " + (packages.find((p) => p.id === r.pacote_novo_id)?.codigo || "outro pacote") : "Mantido"}</td>
            <td>{r.motivo}</td>
          </tr>)}</tbody></table></div>}
    </div>
  </section>;
}
