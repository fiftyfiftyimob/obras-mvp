import { createClient } from "@supabase/supabase-js";
// Public project identifiers. Authorization is enforced by database RLS.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://mulgoijgvmizboyxmxmg.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_fq3Er2EEo_nHILH3Sg5P1w_89bTkpH4",
);
export function mensagemErro(error: unknown): string {
  const message =
    (error as { message?: string })?.message ||
    "Não foi possível concluir. Tente novamente.";
  const messages: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar.",
    "User already registered": "Este e-mail já possui uma conta.",
    "Failed to fetch": "Sem conexão. Confira sua internet e tente novamente.",
    "Email rate limit exceeded":
      "Limite de e-mails atingido. Aguarde antes de tentar novamente.",
    "Signups not allowed for this instance":
      "O cadastro está temporariamente indisponível.",
  };
  if (message.includes("duplicate key"))
    return "Já existe um registro com esses dados.";
  if (
    message.includes("row-level security") ||
    message.includes("permission denied")
  )
    return "Você não tem acesso a este registro. Entre novamente e tente outra vez.";
  return messages[message] || message;
}
export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
