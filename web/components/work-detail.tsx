"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Layers3,
  Users,
  CalendarDays,
  ClipboardList,
  ChartNoAxesCombined,
  RefreshCw,
  Printer,
} from "lucide-react";
import Shell from "./shell";
import Editor, { Row, Field } from "./editor";
import WhatsAppDispatch from "./whatsapp-dispatch";
import { supabase, mensagemErro, hoje } from "../lib/supabase";
import {
  Data,
  loadData,
  names,
  fieldsFor,
  lookup,
  date,
  labels,
  progress,
  hours,
} from "../lib/operacional";
const tabs = [
  ["resumo", "Visão geral", ChartNoAxesCombined],
  ["compromissos_semanais", "Planejamento", CalendarDays],
  ["tarefas", "Tarefas", ClipboardList],
  ["rdos", "Diário de obra", ClipboardList],
  ["frentes", "Frentes", Layers3],
  ["colaboradores", "Pessoas", Users],
  ["equipes", "Equipes", Users],
  ["servicos", "Serviços", ClipboardList],
] as const;
function Detail({ id }: { id: number }) {
  const [obra, setObra] = useState<Row | null>(null);
  const [data, setData] = useState<Data>({});
  const [tab, setTab] = useState("resumo");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ table: string; row: Row } | null>(
    null,
  );
  const [event, setEvent] = useState<{ task: Row; tipo: string } | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const [dispatch, setDispatch] = useState<Row | null>(null);
  const [rdo, setRdo] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const load = useCallback(async () => {
    try {
      setError("");
      const [o, d] = await Promise.all([
        supabase.from("obras").select("*").eq("id", id).single(),
        loadData(id),
      ]);
      if (o.error) throw o.error;
      setObra(o.data);
      setData(d);
    } catch (e) {
      setError(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(row: Row) {
    if (!editor) return;
    const t = editor.table;
    const original = editor.row;
    if (t === "tarefas" && !row.equipe_id && !row.colaborador_id)
      throw new Error("Selecione uma equipe ou colaborador.");
    if (t === "compromissos_semanais" && row.semana_fim < row.semana_inicio)
      throw new Error("A data final deve ser igual ou posterior ao início.");
    if (row.servico_id) {
      const s = data.servicos.find((s) => s.id === row.servico_id);
      if (!s) throw new Error("Selecione um serviço.");
      row.unidade = s.unidade;
    }
    if (t === "rdos_itens" && original.tarefa_id && Number(row.quantidade_realizada) <= 0)
      throw new Error("Informe uma quantidade executada maior que zero.");
    if (t === "colaboradores" && row.cpf) {
      const digits = row.cpf.replace(/\D/g, "");
      if (digits.length !== 11)
        throw new Error("O CPF deve conter 11 números.");
      row.cpf = digits;
    }
    if (!original.id) {
      if (
        [
          "frentes",
          "colaboradores",
          "equipes",
          "compromissos_semanais",
          "tarefas",
          "rdos",
        ].includes(t)
      )
        row.obra_id = id;
      if (t === "servicos") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Entre novamente.");
        row.dono_id = user.id;
      }
      if (t === "rdos_itens") {
        row.rdo_id = rdo;
        if (original.tarefa_id) row.tarefa_id = original.tarefa_id;
      }
    }
    const result = original.id
      ? await supabase
          .from(t)
          .update(row)
          .eq("id", original.id)
          .select()
          .single()
      : await supabase.from(t).insert(row).select().single();
    if (result.error) throw result.error;
    setNotice("Registro salvo.");
    await load();
  }
  async function createOption(
    field: Field,
    input: { nome: string; unidade?: string },
  ) {
    const table = field.quickCreate?.table;
    if (!table) throw new Error("Este campo não permite cadastro rápido.");
    const existing = (data[table] || []).find(
      (row) => row.nome?.trim().toLowerCase() === input.nome.toLowerCase(),
    );
    if (existing) return { value: existing.id, label: existing.nome };

    let payload: Row;
    if (table === "frentes") {
      const highestLevel = (data.frentes || []).reduce(
        (highest, row) => Math.max(highest, Number(row.nivel || 0)),
        0,
      );
      payload = { obra_id: id, nome: input.nome, nivel: highestLevel + 1 };
    } else if (table === "equipes") {
      payload = { obra_id: id, nome: input.nome };
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Entre novamente.");
      payload = {
        dono_id: user.id,
        nome: input.nome,
        unidade: input.unidade || "un",
      };
    }

    const result = await supabase.from(table).insert(payload).select().single();
    if (result.error) throw result.error;
    setData((current) => ({
      ...current,
      [table]: [...(current[table] || []), result.data],
    }));
    return { value: result.data.id, label: result.data.nome };
  }
  async function archive(table: string, row: Row) {
    if (
      !confirm(
        `${row.ativo ? "Arquivar" : "Restaurar"} este registro? O histórico será preservado.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from(table)
        .update({ ativo: !row.ativo })
        .eq("id", row.id)
        .select()
        .single();
      if (error) throw error;
      await load();
    } catch (e) {
      setError(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  }
  async function endMembership(row: Row) {
    setBusy(true);
    try {
      if (row.data_inicio > hoje())
        throw new Error("O vínculo ainda não começou.");
      const { error } = await supabase
        .from("equipe_colaboradores")
        .update({ ativo: false, data_fim: hoje() })
        .eq("id", row.id)
        .select()
        .single();
      if (error) throw error;
      await load();
    } catch (e) {
      setError(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggleRdoTask(task: Row, checked: boolean) {
    if (!rdoRow) return;
    setError("");
    if (checked && progress(data, task) <= 0) {
      if (!discardForm()) return;
      setEditor({
        table: "rdos_itens",
        row: {
          tarefa_id: task.id,
          frente_id: task.frente_id,
          servico_id: task.servico_id,
          equipe_id: task.equipe_id || null,
          quantidade_realizada: 0,
        },
      });
      setNotice("Informe a quantidade realmente executada para incluir a tarefa no diário.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    try {
      if (checked) {
        const { error } = await supabase.from("rdos_itens").insert({
          rdo_id: rdoRow.id,
          tarefa_id: task.id,
          frente_id: task.frente_id,
          servico_id: task.servico_id,
          equipe_id: task.equipe_id || null,
          quantidade_realizada: progress(data, task),
          unidade: task.unidade,
          observacao: task.observacao || null,
        });
        if (error) throw error;
        setNotice("Tarefa incluída no Diário de obra.");
      } else {
        const { error } = await supabase
          .from("rdos_itens")
          .delete()
          .eq("rdo_id", rdoRow.id)
          .eq("tarefa_id", task.id);
        if (error) throw error;
        setNotice("Tarefa retirada do Diário de obra.");
      }
      await load();
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveEvent(row: Row) {
    if (!event) return;
    const { error } = await supabase.rpc("registrar_evolucao", {
      p_tarefa: event.task.id,
      p_tipo: event.tipo,
      p_quantidade: row.quantidade_realizada || 0,
      p_motivo: row.motivo_impedimento || null,
      p_observacao: row.observacao || null,
    });
    if (error) throw error;
    setNotice("Execução registrada no histórico.");
    await load();
  }
  function discardForm() {
    if (formDirty && !window.confirm("Descartar as alterações deste formulário?")) return false;
    setFormDirty(false);
    return true;
  }
  function changeTab(value: string) {
    if (!discardForm()) return;
    setTab(value);
    if (value !== "tarefas") setAttentionOnly(false);
    setEditor(null);
    setEvent(null);
    setHistory(null);
    setDispatch(null);
    setRdo(null);
    setShowArchived(false);
    setError("");
    setNotice("");
  }
  function open(table: string, row: Row = {}) {
    if (!discardForm()) return;
    setEditor({
      table,
      row: {
        nivel: 0,
        data: hoje(),
        data_inicio: hoje(),
        semana_inicio: hoje(),
        semana_fim: hoje(),
        ...row,
      },
    });
    setEvent(null);
    setNotice("");
  }
  if (loading) return <p>Carregando obra…</p>;
  if (!obra)
    return (
      <div className="empty">
        <h1>Obra indisponível</h1>
        <p>
          {error || "Esta obra não foi encontrada ou não pertence à sua conta."}
        </p>
        <Link href="/obras">Voltar para minhas obras</Link>
      </div>
    );
  const tasks = data.tarefas || [];
  const needsAttention = (task: Row) =>
    task.status === "bloqueada" ||
    task.status === "aguardando_validacao" ||
    (task.data < hoje() && task.status !== "concluida");
  const attentionCount = tasks.filter(needsAttention).length;
  const filtered = tasks.filter(
    (t) =>
      (!from || t.data >= from) &&
      (!to || t.data <= to) &&
      (!status || t.status === status) &&
      (!attentionOnly || needsAttention(t)),
  );
  const nextStep = !data.frentes.some((r) => r.ativo)
    ? { text: "Comece cadastrando uma frente de serviço para organizar o trabalho.", tab: "frentes", action: "Cadastrar frente" }
    : !data.colaboradores.some((r) => r.ativo)
      ? { text: "Cadastre as pessoas que participarão da execução.", tab: "colaboradores", action: "Cadastrar pessoa" }
      : !data.equipes.some((r) => r.ativo)
        ? { text: "Monte uma equipe para distribuir o trabalho.", tab: "equipes", action: "Cadastrar equipe" }
        : tasks.length === 0
          ? { text: "Planeje a semana e distribua as primeiras tarefas.", tab: "compromissos_semanais", action: "Planejar a semana" }
          : attentionCount > 0
            ? { text: "Há tarefas atrasadas, bloqueadas ou aguardando aprovação.", tab: "tarefas", action: "Ver pendências" }
            : { text: "O trabalho está em dia. Confira as tarefas ou prepare o próximo planejamento.", tab: "tarefas", action: "Ver tarefas" };
  const rdoRow = data.rdos?.find((r) => r.id === rdo);
  const rdoItems = rdoRow
    ? data.rdos_itens.filter((item) => item.rdo_id === rdoRow.id)
    : [];
  const rdoTasks = rdoRow
    ? tasks.filter((task) => task.data === rdoRow.data)
    : [];
  const events =
    history === null
      ? []
      : data.evolucoes_tarefa.filter((e) => e.tarefa_id === history);
  const canEdit = obra.ativo;
  function rowActions(table: string, row: Row) {
    if (!canEdit || (table === "servicos" && !row.dono_id)) return null;
    return (
      <div className="row-actions">
        <button disabled={busy} onClick={() => open(table, row)}>
          Editar
        </button>
        {"ativo" in row && (
          <button disabled={busy} onClick={() => archive(table, row)}>
            {row.ativo ? "Arquivar" : "Restaurar"}
          </button>
        )}
      </div>
    );
  }
  function renderTable(table: string, rows: Row[]) {
    if (rows.length === 0)
      return (
        <div className="empty">
          <Layers3 size={36} />
          <h2>Nenhum item em {names[table].toLowerCase()}</h2>
          <p>Use a ação “Adicionar” desta seção para cadastrar o primeiro item.</p>
        </div>
      );
    const columns: Record<string, [string, (r: Row) => React.ReactNode][]> = {
      frentes: [
        ["Frente", (r) => r.nome],
        ["Nível", (r) => r.nivel],
        ["Descrição", (r) => r.descricao || "—"],
      ],
      colaboradores: [
        ["Nome", (r) => r.nome],
        ["Função", (r) => r.funcao],
        ["Telefone", (r) => r.telefone || "—"],
        [
          "Equipe principal",
          (r) => lookup(data, "equipes", r.equipe_principal_id),
        ],
      ],
      equipes: [
        ["Equipe", (r) => r.nome],
        ["Descrição", (r) => r.descricao || "—"],
        [
          "Integrantes",
          (r) =>
            data.equipe_colaboradores.filter(
              (m) =>
                m.equipe_id === r.id &&
                m.ativo &&
                m.data_inicio <= hoje() &&
                (!m.data_fim || m.data_fim >= hoje()),
            ).length,
        ],
      ],
      servicos: [
        [
          "Serviço",
          (r) => (
            <>
              {r.nome}
              {!r.dono_id && <small> · Catálogo padrão</small>}
            </>
          ),
        ],
        ["Unidade", (r) => r.unidade],
        ["Referência / hora", (r) => r.produtividade_referencia ?? "—"],
      ],
      compromissos_semanais: [
        ["Período", (r) => `${date(r.semana_inicio)} a ${date(r.semana_fim)}`],
        [
          "Serviço / frente",
          (r) => (
            <>
              {lookup(data, "servicos", r.servico_id)}
              <small style={{ display: "block" }}>
                {lookup(data, "frentes", r.frente_id)}
              </small>
            </>
          ),
        ],
        ["Equipe", (r) => lookup(data, "equipes", r.equipe_id)],
        ["Meta", (r) => `${r.quantidade_meta} ${r.unidade}`],
        [
          "Realizado",
          (r) =>
            `${tasks.filter((t) => t.compromisso_semanal_id === r.id).reduce((n, t) => n + progress(data, t), 0)} ${r.unidade}`,
        ],
      ],
      rdos: [
        ["Data", (r) => date(r.data)],
        ["Clima", (r) => r.clima || "—"],
        ["Observação", (r) => r.observacao_geral || "—"],
      ],
      rdos_itens: [
        ["Frente", (r) => lookup(data, "frentes", r.frente_id)],
        ["Serviço", (r) => lookup(data, "servicos", r.servico_id)],
        ["Equipe", (r) => lookup(data, "equipes", r.equipe_id)],
        ["Executado", (r) => `${r.quantidade_realizada} ${r.unidade}`],
        ["Observação", (r) => r.observacao || "—"],
      ],
    };
    return (
      <div className="panel table-wrap responsive-table">
        <table>
          <thead>
            <tr>
              {columns[table].map(([c]) => (
                <th key={c}>{c}</th>
              ))}
              {rows.some((r) => "ativo" in r) && <th>Status</th>}
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {columns[table].map(([c, fn]) => (
                  <td key={c} data-label={c}>{fn(r)}</td>
                ))}
                {"ativo" in r && (
                  <td data-label="Status">
                    <span className="status">
                      {r.ativo ? "Ativo" : "Arquivado"}
                    </span>
                  </td>
                )}
                <td data-label="Ações">
                  {rowActions(table, r)}
                  {table === "rdos" && (
                    <button
                      className="secondary"
                      onClick={() => {
                        if (!discardForm()) return;
                        setRdo(r.id);
                        setEditor(null);
                      }}
                    >
                      Abrir diário
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <>
      <Link className="back" href="/obras" onClick={(event) => {
        if (!discardForm()) event.preventDefault();
      }}>
        <ArrowLeft size={16} /> Todas as obras
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ESPAÇO DA OBRA</p>
          <h1>{obra.nome}</h1>
          <p className="muted">
            {[obra.endereco, obra.cidade, obra.estado]
              .filter(Boolean)
              .join(" · ") || "Local não informado"}
          </p>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      {!canEdit && (
        <p className="notice">
          Obra arquivada. Restaure em Minhas obras para retomar os registros.
        </p>
      )}
      <label className="module-picker" htmlFor="module-select">
        Área da obra
        <select id="module-select" value={tab} onChange={(event) => changeTab(event.target.value)}>
          <optgroup label="Acompanhar">
            <option value="resumo">Visão geral</option>
          </optgroup>
          <optgroup label="Operar">
            <option value="compromissos_semanais">Planejamento</option>
            <option value="tarefas">Tarefas</option>
            <option value="rdos">Diário de obra</option>
          </optgroup>
          <optgroup label="Cadastros">
            <option value="frentes">Frentes</option>
            <option value="colaboradores">Pessoas</option>
            <option value="equipes">Equipes</option>
            <option value="servicos">Serviços</option>
          </optgroup>
        </select>
      </label>
      <nav className="tabs" aria-label="Módulos da obra">
        {tabs.map(([value, label, Icon]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            className={tab === value ? "active" : ""}
            onClick={() => changeTab(value)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {tab !== "resumo" && (
        <div className="section-heading">
          <div>
            <h2>{rdoRow ? `Diário de ${date(rdoRow.data)}` : names[tab]}</h2>
            <p className="muted">
              {tab === "tarefas"
                ? "Defina onde cada equipe trabalhará e prepare as mensagens do dia."
                : tab === "equipes"
                  ? "Monte equipes e acompanhe a composição ao longo do tempo."
                  : tab === "servicos"
                    ? "Use os serviços padrão ou crie seu próprio catálogo."
                    : "Informações organizadas para acompanhar a obra."}
            </p>
          </div>
          {canEdit && (
            <button
              className="primary"
              onClick={() => open(rdoRow ? "rdos_itens" : tab)}
            >
              <Plus size={16} />
              {rdoRow ? "Adicionar item" : ({
                frentes: "Nova frente",
                colaboradores: "Nova pessoa",
                equipes: "Nova equipe",
                servicos: "Novo serviço",
                compromissos_semanais: "Novo compromisso",
                tarefas: "Nova tarefa",
                rdos: "Novo diário",
              } as Record<string, string>)[tab]}
            </button>
          )}
        </div>
      )}
      {editor && (
        <Editor
          key={`${editor.table}-${editor.row.id || "new"}`}
          title={`${editor.row.id ? "Editar" : "Cadastrar"} · ${names[editor.table]}`}
          fields={fieldsFor(editor.table, data)}
          initial={editor.row}
          onSave={save}
          onCreateOption={createOption}
          onDirtyChange={setFormDirty}
          onCancel={() => setEditor(null)}
        />
      )}
      {editor?.table === "tarefas" && (
        <p className="notice">
          A unidade acompanha o serviço. Ao vincular um compromisso semanal, use
          a mesma frente, serviço e equipe, dentro do período planejado.
        </p>
      )}
      {event && (
        <Editor
          key={`${event.task.id}-${event.tipo}`}
          title={`${labels[event.tipo]} · ${lookup(data, "servicos", event.task.servico_id)}`}
          fields={
            [
              ...(["inicio", "retomada"].includes(event.tipo)
                ? []
                : [
                    {
                      name: "quantidade_realizada",
                      label: `Quantidade produzida desde o último registro (${event.task.unidade})`,
                      type: "number",
                      min: "0",
                      step: "any",
                      required: true,
                    },
                  ]),
              ...(event.tipo === "impedimento"
                ? [
                    {
                      name: "motivo_impedimento",
                      label: "Motivo",
                      required: true,
                      options: [
                        "falta_material",
                        "falta_ferramenta",
                        "frente_ocupada",
                        "projeto_pendente",
                        "chuva",
                        "espera_equipe",
                        "seguranca",
                        "outro",
                      ].map((x) => ({ value: x, label: labels[x] })),
                    },
                  ]
                : []),
              { name: "observacao", label: "Observação", type: "textarea" },
            ] as Field[]
          }
          initial={{ quantidade_realizada: 0 }}
          onSave={saveEvent}
          onDirtyChange={setFormDirty}
          onCancel={() => setEvent(null)}
        />
      )}
      {tab === "resumo" && (
        <>
          <div className="stats">
            {[
              [
                "Frentes ativas",
                data.frentes.filter((r) => r.ativo).length,
                "Áreas de execução",
              ],
              [
                "Pessoas ativas",
                data.colaboradores.filter((r) => r.ativo).length,
                "Colaboradores cadastrados",
              ],
              [
                "Tarefas concluídas",
                `${tasks.filter((t) => t.status === "concluida").length}/${tasks.length}`,
                "Em todo o período",
              ],
              [
                "Atenção necessária",
                attentionCount,
                "Bloqueadas ou atrasadas",
              ],
            ].map(([label, value, desc]) => (
              <div className="panel stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{desc}</small>
                {label === "Atenção necessária" && attentionCount > 0 && (
                  <button className="inline-link" onClick={() => {
                    setFrom(""); setTo(""); setStatus(""); setAttentionOnly(true); setTab("tarefas");
                  }}>Ver pendências</button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="panel editor">
              <h2>Seu próximo passo</h2>
              <p className="muted">{nextStep.text}</p>
              <button className="primary" onClick={() => {
                if (nextStep.tab === "tarefas" && attentionCount > 0) {
                  setFrom(""); setTo(""); setStatus(""); setAttentionOnly(true);
                }
                if (nextStep.tab === "tarefas" && attentionCount === 0) {
                  setFrom(""); setTo(""); setStatus(""); setAttentionOnly(false);
                }
                setTab(nextStep.tab);
              }}>{nextStep.action}</button>
            </div>
          )}
          <div className="panel editor">
            <h2>Produção por serviço</h2>
            <p className="muted">
              Quantidades não são somadas entre unidades diferentes. Horas
              contam apenas os intervalos em execução.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Meta total</th>
                    <th>Executado</th>
                    <th>Horas previstas</th>
                    <th>Horas reais</th>
                  </tr>
                </thead>
                <tbody>
                  {data.servicos
                    .filter((s) => tasks.some((t) => t.servico_id === s.id))
                    .map((s) => {
                      const group = tasks.filter((t) => t.servico_id === s.id);
                      return (
                        <tr key={s.id}>
                          <td>{s.nome}</td>
                          <td>
                            {group.reduce(
                              (n, t) => n + Number(t.quantidade_meta),
                              0,
                            )}{" "}
                            {s.unidade}
                          </td>
                          <td>
                            {group.reduce((n, t) => n + progress(data, t), 0)}{" "}
                            {s.unidade}
                          </td>
                          <td>
                            {group
                              .reduce(
                                (n, t) => n + Number(t.horas_previstas || 0),
                                0,
                              )
                              .toFixed(1)}
                          </td>
                          <td>
                            {group
                              .reduce((n, t) => n + hours(data, t), 0)
                              .toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {tasks.length === 0 && (
              <p className="muted">
                Os indicadores aparecem quando você cadastrar tarefas.
              </p>
            )}
          </div>
        </>
      )}
      {["frentes", "colaboradores", "equipes", "servicos"].includes(tab) && (
        <>
          <div className="toolbar">
            <button
              className="secondary"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "Mostrar apenas ativos" : "Incluir arquivados"}
            </button>
          </div>
          {renderTable(
            tab,
            data[tab].filter((r) => showArchived || r.ativo),
          )}
        </>
      )}
      {tab === "equipes" && (
        <>
          <div className="section-heading">
            <h2>Composição das equipes</h2>
            {canEdit && (
              <button
                className="secondary"
                onClick={() => open("equipe_colaboradores")}
              >
                Vincular colaborador
              </button>
            )}
          </div>
          <div className="panel table-wrap responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Equipe</th>
                  <th>Colaborador</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.equipe_colaboradores.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Equipe">{lookup(data, "equipes", m.equipe_id)}</td>
                    <td data-label="Colaborador">{lookup(data, "colaboradores", m.colaborador_id)}</td>
                    <td data-label="Início">{date(m.data_inicio)}</td>
                    <td data-label="Fim">{date(m.data_fim)}</td>
                    <td data-label="Ação">
                      {m.ativo && canEdit ? (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => endMembership(m)}
                        >
                          Encerrar vínculo
                        </button>
                      ) : (
                        "Encerrado"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.equipe_colaboradores.length && (
              <p style={{ padding: 20 }} className="muted">
                Nenhum vínculo registrado.
              </p>
            )}
          </div>
        </>
      )}
      {tab === "compromissos_semanais" && renderTable(tab, data[tab])}
      {tab === "tarefas" && (
        <>
          {dispatch && obra && (
            <WhatsAppDispatch
              key={dispatch.id}
              task={dispatch}
              data={data}
              obraNome={obra.nome}
              onClose={() => setDispatch(null)}
            />
          )}
          <div className="filters">
            <label>
              De
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos</option>
                {[
                  "nao_iniciada",
                  "em_execucao",
                  "pausada",
                  "bloqueada",
                  "aguardando_validacao",
                  "concluida",
                ].map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              onClick={() => {
                setFrom(hoje());
                setTo(hoje());
                setAttentionOnly(false);
              }}
            >
              Hoje
            </button>
            <button
              className="secondary"
              onClick={() => {
                setFrom("");
                setTo("");
                setStatus("");
                setAttentionOnly(false);
              }}
            >
              Limpar
            </button>
            <button
              className={attentionOnly ? "primary" : "secondary"}
              aria-pressed={attentionOnly}
              onClick={() => setAttentionOnly(!attentionOnly)}
            >
              Só pendências
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="empty">
              <h2>{attentionOnly ? "Nenhuma pendência encontrada" : "Nenhuma tarefa neste período"}</h2>
              <p>{attentionOnly ? "As tarefas atrasadas, bloqueadas ou aguardando aprovação aparecerão aqui." : "Cadastre tarefas ou ajuste os filtros."}</p>
            </div>
          ) : (
            filtered.map((t) => (
              <article className="panel editor" key={t.id}>
                <div className="section-heading">
                  <div>
                    <small>
                      {date(t.data)} · {t.turno || "Dia inteiro"}
                    </small>
                    <h2>{lookup(data, "servicos", t.servico_id)}</h2>
                    <p className="muted">
                      {lookup(data, "frentes", t.frente_id)} ·{" "}
                      {t.equipe_id
                        ? lookup(data, "equipes", t.equipe_id)
                        : lookup(data, "colaboradores", t.colaborador_id)}
                    </p>
                  </div>
                  <span
                    className={
                      "status " + (t.status === "concluida" ? "green" : "")
                    }
                  >
                    {labels[t.status]}
                  </span>
                </div>
                <div className="task-metrics">
                  <span>
                    <strong>{progress(data, t)}</strong> / {t.quantidade_meta}{" "}
                    {t.unidade} executados
                  </span>
                  <span>
                    {hours(data, t).toFixed(1)} h reais ·{" "}
                    {t.horas_previstas ?? "—"} h previstas
                  </span>
                </div>
                <progress
                  max={Math.max(Number(t.quantidade_meta), progress(data, t))}
                  value={progress(data, t)}
                  aria-label="Progresso da tarefa"
                />
                {t.observacao && <p className="muted">{t.observacao}</p>}
                <div className="task-actions" style={{ marginTop: 20 }}>
                  {canEdit && t.status !== "concluida" && (
                    <button
                      className="primary"
                      onClick={() => {
                        setDispatch(t);
                        setNotice("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Preparar mensagens
                    </button>
                  )}
                  {canEdit &&
                    (t.status === "nao_iniciada"
                      ? ["inicio", "impedimento"]
                      : t.status === "em_execucao"
                        ? ["pausa", "conclusao", "impedimento"]
                        : t.status === "pausada"
                          ? ["retomada", "impedimento"]
                          : t.status === "bloqueada"
                            ? ["retomada"]
                            : t.status === "aguardando_validacao"
                              ? ["conclusao", "retomada"]
                            : []
                    ).map((tipo) => (
                      <button
                        className={
                          tipo === "inicio" || tipo === "retomada"
                            ? "primary"
                            : "secondary"
                        }
                        key={tipo}
                        onClick={() => {
                          if (!discardForm()) return;
                          setEvent({ task: t, tipo });
                          setEditor(null);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        {t.status === "aguardando_validacao"
                          ? tipo === "conclusao"
                            ? "Aprovar conclusão"
                            : "Reabrir tarefa"
                          : labels[tipo]}
                      </button>
                    ))}
                  <button
                    className="secondary"
                    onClick={() => setHistory(history === t.id ? null : t.id)}
                  >
                    Histórico
                  </button>
                  {canEdit && t.status === "nao_iniciada" && (
                    <button
                      className="secondary"
                      onClick={() => open("tarefas", t)}
                    >
                      Editar
                    </button>
                  )}
                </div>
                {history === t.id && (
                  <>
                    <ul className="timeline">
                      {events.length === 0 ? (
                        <li>Nenhum evento registrado.</li>
                      ) : (
                        events.map((e) => (
                          <li key={e.id}>
                            <strong>{labels[e.tipo] || e.tipo}</strong>
                            <small>
                              {new Date(e.timestamp + "Z").toLocaleString(
                                "pt-BR",
                              )}
                            </small>
                            <span>
                              Produção: {e.quantidade_realizada || 0} {t.unidade}
                              {e.motivo_impedimento
                                ? ` · ${labels[e.motivo_impedimento]}`
                                : ""}
                            </span>
                            {e.observacao && <p>{e.observacao}</p>}
                          </li>
                        ))
                      )}
                    </ul>
                    {data.evidencias_tarefa
                      ?.filter((e) => e.tarefa_id === t.id)
                      .map((e) => (
                        <p className="notice" key={e.id}>
                          Foto do operário · {new Date(e.criado_em).toLocaleString("pt-BR")}
                          {e.legenda ? ` · ${e.legenda}` : ""}{" "}
                          {e.url && (
                            <a className="text-link-inline" href={e.url} target="_blank" rel="noreferrer">
                              Abrir foto
                            </a>
                          )}
                        </p>
                      ))}
                  </>
                )}
              </article>
            ))
          )}
        </>
      )}
      {tab === "rdos" && !rdoRow && renderTable("rdos", data.rdos)}
      {tab === "rdos" && rdoRow && (
        <>
          <div className="toolbar">
            <button
              className="secondary"
              onClick={() => {
                setRdo(null);
                setEditor(null);
              }}
            >
              Voltar aos diários
            </button>
            <button className="secondary" onClick={() => window.print()}>
              <Printer size={16} />
              Imprimir diário
            </button>
          </div>
          <div className="panel editor rdo-print-heading">
            <h2>
              {obra.nome} · {date(rdoRow.data)}
            </h2>
            <p>Clima: {rdoRow.clima || "Não informado"}</p>
            <p>{rdoRow.observacao_geral || "Sem observação geral."}</p>
          </div>
          <section className="panel editor">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PREENCHIMENTO RÁPIDO</p>
                <h2>Tarefas planejadas para este dia</h2>
                <p className="muted">
                  Marque as tarefas executadas. Os dados serão copiados para o
                  diário e poderão ser editados abaixo.
                </p>
              </div>
              <span className="status green">
                {rdoTasks.filter((task) => rdoItems.some((item) => item.tarefa_id === task.id)).length}/{rdoTasks.length} marcadas
              </span>
            </div>
            <div className="rdo-checklist">
              {rdoTasks.map((task) => {
                const item = rdoItems.find(
                  (candidate) => candidate.tarefa_id === task.id,
                );
                const suggested = progress(data, task);
                return (
                  <label className="rdo-check" key={task.id}>
                    <input
                      type="checkbox"
                      checked={Boolean(item)}
                      disabled={busy || !canEdit}
                      onChange={(event) =>
                        void toggleRdoTask(task, event.target.checked)
                      }
                    />
                    <span>
                      <strong>{lookup(data, "servicos", task.servico_id)}</strong>
                      <small>
                        {lookup(data, "frentes", task.frente_id)} · {task.equipe_id
                          ? lookup(data, "equipes", task.equipe_id)
                          : lookup(data, "colaboradores", task.colaborador_id)} ·{" "}
                        {suggested} {task.unidade}
                      </small>
                    </span>
                  </label>
                );
              })}
              {rdoTasks.length === 0 && (
                <p className="muted">
                  Nenhuma tarefa foi planejada para esta data. Use “Adicionar
                  item” para fazer um registro manual.
                </p>
              )}
            </div>
          </section>
          {renderTable(
            "rdos_itens",
            rdoItems,
          )}
          <p className="notice">
            Tarefas com produção apontada usam a quantidade registrada. Para
            tarefas sem apontamento, informe a quantidade realmente executada
            antes de incluí-las no diário.
          </p>
        </>
      )}
    </>
  );
}
export default function WorkDetail({ id }: { id: number }) {
  return (
    <Shell>
      <Detail key={id} id={id} />
    </Shell>
  );
}
