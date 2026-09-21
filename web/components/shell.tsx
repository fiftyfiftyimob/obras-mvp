"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HardHat, Building2, LogOut, MessageCircle } from "lucide-react";
import { supabase, mensagemErro } from "../lib/supabase";
export default function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("Gestor");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!live) return;
      if (error || !data.user) {
        router.replace("/login");
        return;
      }
      setName(data.user.user_metadata.nome || "Gestor");
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
        <Link className="top-link" href="/configuracoes/whatsapp">
          <MessageCircle size={17} /> WhatsApp
        </Link>
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
      <main className="workspace">{children}</main>
      <footer className="footer">Obras · Gestão de produção</footer>
    </>
  );
}
