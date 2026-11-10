"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import Shell from "../../components/shell";
import { supabase, mensagemErro } from "../../lib/supabase";
type Role = "administrador" | "engenheiro" | "supervisor" | "estagiario" | "encarregado" | "cliente";
type Work = { id: number; nome: string; cidade: string | null; estado: string | null; papel: Role };
const roleLabels: Record<Role, string> = { administrador: "Administrador", engenheiro: "Engenheiro", supervisor: "Supervisor", estagiario: "Estagiário", encarregado: "Encarregado", cliente: "Cliente" };
function SharedWorks() {
  const [rows, setRows] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    supabase.rpc("minhas_obras_compartilhadas").then(({ data, error }) => {
      if (error) setError(mensagemErro(error));
      else setRows((data || []) as Work[]);
      setLoading(false);
    });
  }, []);
  return <>
    <Link className="back" href="/obras"><ArrowLeft size={16} /> Minhas obras</Link>
    <div className="page-heading"><div><p className="eyebrow">ACESSO COMPARTILHADO</p><h1>Obras compartilhadas</h1><p className="muted">Obras liberadas para sua função. Cada acesso é limitado à obra correspondente.</p></div></div>
    {error && <p role="alert" className="alert error">{error}</p>}
    {loading ? <p>Carregando obras…</p> : rows.length === 0 ? <div className="empty"><Building2 size={40} /><h2>Nenhuma obra compartilhada</h2><p>Peça ao gestor para liberar o e-mail da sua conta.</p></div> :
      <div className="work-grid">{rows.map(row => <article className="work-card" key={row.id}><div className="work-card-top"><span className="status green">{roleLabels[row.papel]}</span></div><h2><Link href={`/compartilhadas/${row.id}`}>{row.nome}</Link></h2><p className="location"><MapPin size={15} />{[row.cidade,row.estado].filter(Boolean).join(" / ") || "Local não informado"}</p><div className="card-actions"><Link href={`/compartilhadas/${row.id}`}>Abrir obra</Link></div></article>)}</div>}
  </>;
}
export default function Page() { return <Shell><SharedWorks /></Shell>; }
