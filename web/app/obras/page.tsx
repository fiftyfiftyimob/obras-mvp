"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowUpRight, MapPin, Building2, Search } from "lucide-react";
import Shell from "../../components/shell";
import Editor, { Row, Field } from "../../components/editor";
import { supabase, mensagemErro } from "../../lib/supabase";
const fields: Field[] = [
  { name: "nome", label: "Nome da obra", required: true },
  { name: "endereco", label: "Endereço" },
  { name: "cidade", label: "Cidade" },
  { name: "estado", label: "Estado (UF)", maxLength: 2 },
  { name: "cliente_nome", label: "Nome do cliente" },
  { name: "cliente_contato", label: "Contato do cliente" },
];
function Obras() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sharedCount, setSharedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  async function load() {
    setError("");
    const [owned, shared] = await Promise.all([
      supabase.from("obras").select("*").order("criado_em", { ascending: false }),
      supabase.rpc("minhas_obras_compartilhadas"),
    ]);
    if (owned.error || shared.error) setError(mensagemErro(owned.error || shared.error));
    if (!owned.error) setRows(owned.data || []);
    if (!shared.error) setSharedCount((shared.data || []).length);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(row: Row) {
    if (row.estado && !/^[A-Za-z]{2}$/.test(row.estado))
      throw new Error("Informe a sigla do estado com duas letras.");
    row.estado = row.estado?.toUpperCase() || null;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Entre novamente.");
    const result = editor?.id
      ? await supabase
          .from("obras")
          .update(row)
          .eq("id", editor.id)
          .select()
          .single()
      : await supabase
          .from("obras")
          .insert({ ...row, dono_id: user.id })
          .select()
          .single();
    if (result.error) throw result.error;
    await load();
  }
  async function archive(row: Row) {
    if (
      !confirm(
        `${row.ativo ? "Arquivar" : "Restaurar"} a obra ${row.nome}? Os registros serão preservados.`,
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase
      .from("obras")
      .update({ ativo: !row.ativo })
      .eq("id", row.id)
      .select()
      .single();
    if (error) setError(mensagemErro(error));
    else await load();
    setBusy(false);
  }
  function discardForm() {
    if (formDirty && !window.confirm("Descartar as alterações desta obra?")) return false;
    setFormDirty(false);
    return true;
  }
  const visible = rows.filter(
    (r) =>
      r.ativo !== archived &&
      [r.nome, r.cidade, r.estado, r.cliente_nome]
        .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())),
  );
  const sharedOnly = rows.length === 0 && sharedCount > 0 && !archived && !search;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU PORTFÓLIO</p>
          <h1>
            Minhas obras
            <span className="count">{rows.filter((r) => r.ativo).length}</span>
          </h1>
          <p className="muted">
            Tudo o que acontece nas suas obras, em um só lugar.
          </p>
        </div>
        <button className="primary" onClick={() => { if (discardForm()) setEditor({}); }}>
          <Plus size={18} /> Nova obra
        </button>
      </div>
      <div className="summary-strip">
        <Building2 />
        <div>
          <strong>{rows.filter((r) => r.ativo).length} obras ativas</strong>
          <span>Organize frentes, pessoas e entregas em cada obra.</span>
        </div>
        <Link className="secondary pending-entry" href="/pendencias">Ver pendências</Link>
        <Link className="secondary agenda-entry" href="/agenda">Agenda diária</Link>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Buscar obra"
            placeholder="Buscar obra, cidade ou cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className={archived ? "primary" : "secondary"}
          onClick={() => setArchived(!archived)}
        >
          {archived ? "Ver ativas" : "Ver arquivadas"}
        </button>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
          <button onClick={load}>Tentar novamente</button>
        </p>
      )}
      {editor && (
        <Editor
          title={editor.id ? "Editar obra" : "Nova obra"}
          fields={fields}
          initial={editor}
          onSave={save}
          onDirtyChange={setFormDirty}
          onCancel={() => setEditor(null)}
        />
      )}
      {loading ? (
        <p>Carregando obras…</p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <Building2 size={40} />
          <h2>
            {search
              ? "Nenhuma obra encontrada"
              : archived
                ? "Nenhuma obra arquivada"
                : sharedOnly
                  ? "Você recebeu acesso a obras"
                  : "Sua primeira obra começa aqui"}
          </h2>
          <p>{search ? "Tente outro nome, cidade ou cliente." : archived ? "As obras arquivadas aparecerão aqui." : sharedOnly ? `Você tem acesso a ${sharedCount} obra(s) compartilhada(s).` : "Cadastre a obra e organize as próximas etapas."}</p>
          {sharedOnly && <Link className="primary" href="/compartilhadas">Abrir obras compartilhadas</Link>}
          {!archived && !search && !sharedOnly && (
            <button className="primary" onClick={() => { if (discardForm()) setEditor({}); }}>
              Cadastrar obra
            </button>
          )}
        </div>
      ) : (
        <div className="work-grid">
          {visible.map((r, i) => (
            <article className="work-card" key={r.id}>
              <div className="work-card-top">
                <span className="work-number">
                  OBRA {String(i + 1).padStart(2, "0")}
                </span>
                <span className={"status " + (r.ativo ? "green" : "")}>
                  {r.ativo ? "Ativa" : "Arquivada"}
                </span>
              </div>
              <h2>
                <Link href={`/obras/${r.id}`}>{r.nome}</Link>
              </h2>
              <p className="location">
                <MapPin size={15} />
                {[r.cidade, r.estado].filter(Boolean).join(" / ") ||
                  "Local não informado"}
              </p>
              <div className="work-client">
                <small>CLIENTE</small>
                <span>{r.cliente_nome || "Não informado"}</span>
              </div>
              <div className="card-actions">
                <button onClick={() => { if (discardForm()) setEditor(r); }}>Editar</button>
                <button disabled={busy} onClick={() => archive(r)}>
                  {r.ativo ? "Arquivar" : "Restaurar"}
                </button>
                <Link href={`/obras/${r.id}`}>
                  Abrir obra <ArrowUpRight size={18} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export default function Page() {
  return (
    <Shell>
      <Obras />
    </Shell>
  );
}
