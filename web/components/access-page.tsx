"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import Shell from "./shell";
import { supabase, mensagemErro } from "../lib/supabase";

type Access = { usuario_id: string; email: string; papel: "encarregado" | "cliente"; criado_em: string };
function AccessContent({ id }: { id: number }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Access[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"encarregado" | "cliente">("encarregado");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    const [work, access] = await Promise.all([
      supabase.from("obras").select("nome").eq("id", id).single(),
      supabase.rpc("listar_acessos_obra", { p_obra: id }),
    ]);
    if (work.error || access.error) setError(mensagemErro(work.error || access.error));
    else { setName(work.data.nome); setRows((access.data || []) as Access[]); }
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  async function grant(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const result = await supabase.rpc("conceder_acesso_obra", { p_obra: id, p_email: email.trim(), p_papel: role });
    if (result.error) setError(mensagemErro(result.error));
    else { setEmail(""); setNotice("Acesso concedido. A pessoa já pode abrir Obras compartilhadas."); await load(); }
    setBusy(false);
  }
  async function revoke(row: Access) {
    if (!window.confirm(`Remover o acesso de ${row.email} a esta obra?`)) return;
    setBusy(true); setError(""); setNotice("");
    const result = await supabase.rpc("revogar_acesso_obra", { p_obra: id, p_usuario: row.usuario_id });
    if (result.error) setError(mensagemErro(result.error));
    else { setNotice("Acesso removido."); await load(); }
    setBusy(false);
  }
  return <>
    <Link className="back" href={`/obras/${id}`}><ArrowLeft size={16} /> Voltar à obra</Link>
    <div className="page-heading"><div><p className="eyebrow">PERMISSÕES POR OBRA</p><h1>Acessos · {name || "Obra"}</h1><p className="muted">Convide contas já cadastradas e com e-mail confirmado.</p></div></div>
    {error && <p className="alert error" role="alert">{error} <button onClick={load}>Tentar novamente</button></p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    <form className="panel editor access-form" onSubmit={grant}>
      <h2>Conceder acesso</h2>
      <div className="filters">
        <label>E-mail da conta<input type="email" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@exemplo.com" /></label>
        <label>Perfil<select value={role} onChange={e => setRole(e.target.value as "encarregado" | "cliente")}><option value="encarregado">Encarregado · apontar execução</option><option value="cliente">Cliente · consultar</option></select></label>
        <button className="primary" disabled={busy || loading}>Conceder acesso</button>
      </div>
      <p className="muted">O gestor mantém a aprovação de conclusões e a administração da obra. O cliente não vê dados pessoais dos colaboradores.</p>
    </form>
    <section className="panel editor access-list"><h2>Pessoas com acesso</h2>
      {loading ? <p>Carregando acessos…</p> : rows.length === 0 ? <div className="empty"><Users size={36} /><p>Nenhum acesso compartilhado.</p></div> :
      <ul>{rows.map(row => <li key={row.usuario_id}><div><strong>{row.email}</strong><small>{row.papel === "cliente" ? "Cliente · consulta" : "Encarregado · execução"}</small></div><button className="secondary" disabled={busy} onClick={() => revoke(row)}>Remover</button></li>)}</ul>}
    </section>
  </>;
}
export default function AccessPage({ id }: { id: number }) { return <Shell><AccessContent id={id} /></Shell>; }
