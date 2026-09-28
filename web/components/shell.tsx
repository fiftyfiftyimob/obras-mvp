"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HardHat, Building2, LogOut, Users } from "lucide-react";
import { supabase, mensagemErro } from "../lib/supabase";
import { pendingReports, syncReports } from "../lib/offline-reports";
export default function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("Gestor");
  const [error, setError] = useState("");
  const [uid, setUid] = useState("");
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!live) return;
      if (error || !data.user) {
        router.replace("/login");
        return;
      }
      setName(data.user.user_metadata.nome || "Gestor");
      setUid(data.user.id);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION"))
        router.replace("/login");
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [router]);
  useEffect(() => {
    if (!uid) return;
    const refresh = () => { setOnline(navigator.onLine); setPendingCount(pendingReports(uid).length); };
    const onOnline = () => { refresh(); void syncReports(uid); };
    refresh(); void syncReports(uid);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", refresh);
    window.addEventListener("obras-pending-change", refresh);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("obras-pending-change", refresh);
    };
  }, [uid]);
  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) setError(mensagemErro(error));
    else router.replace("/login");
  }
  if (!ready) return <main className="loading">Carregando seu espaço…</main>;
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/obras">
          <HardHat size={27} />
          <span>
            obras<span className="brand-dot">.</span>
          </span>
        </Link>
        <Link className="top-link" href="/obras">
          <Building2 size={17} /> Minhas obras
        </Link>
        <Link className="top-link" href="/compartilhadas"><Users size={17} /> Compartilhadas</Link>
        <div className="account">
          <span className="avatar">{name.charAt(0).toUpperCase()}</span>
          <span>{name}</span>
          <button
            className="icon-button"
            onClick={logout}
            title="Sair"
            aria-label="Sair"
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {(!online || pendingCount > 0) && <p className="connection-banner" role="status">{!online ? "Sem conexão. Apontamentos do encarregado poderão ficar pendentes neste dispositivo." : `${pendingCount} apontamento(s) aguardando sincronização neste dispositivo.`}</p>}
      <main className="workspace">{children}</main>
      <footer className="footer">Obras · Gestão de produção</footer>
    </>
  );
}
