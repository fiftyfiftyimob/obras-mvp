import { supabase } from "./supabase";
export type PendingReport = {
  id: string; obraId: number; tarefaId: number; tipo: string; quantidade: number;
  motivo: string | null; observacao: string | null; criadoEm: string; erro?: string;
};
const key = (uid: string) => `obras:apontamentos:${uid}`;
const changed = () => window.dispatchEvent(new Event("obras-pending-change"));
export function pendingReports(uid: string): PendingReport[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(uid)) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string" && Number.isInteger(item.tarefaId) && Number.isInteger(item.obraId)) : [];
  } catch { return []; }
}
function write(uid: string, rows: PendingReport[]) {
  localStorage.setItem(key(uid), JSON.stringify(rows));
  changed();
}
export function queueReport(uid: string, item: PendingReport) {
  const rows = pendingReports(uid);
  if (!rows.some((row) => row.id === item.id)) write(uid, [...rows, item]);
}
export function discardReport(uid: string, id: string) {
  write(uid, pendingReports(uid).filter((row) => row.id !== id));
}
export function isNetworkFailure(error: unknown) {
  const message = String((error as { message?: string })?.message || error || "").toLowerCase();
  return !navigator.onLine || message.includes("failed to fetch") || message.includes("network") || message.includes("fetch failed");
}
const running = new Map<string, Promise<void>>();
export function syncReports(uid: string): Promise<void> {
  const prior = running.get(uid);
  if (prior) return prior;
  const run = (async () => {
    if (!navigator.onLine) return;
    for (const item of pendingReports(uid)) {
      let error: { message: string } | null = null;
      try {
        const result = await supabase.rpc("registrar_apontamento_sincronizado", {
          p_tarefa: item.tarefaId, p_tipo: item.tipo, p_quantidade: item.quantidade,
          p_motivo: item.motivo, p_observacao: item.observacao, p_chave: item.id,
        });
        error = result.error;
      } catch (cause) {
        error = { message: String((cause as { message?: string })?.message || cause) };
      }
      if (!error) {
        discardReport(uid, item.id);
      } else {
        const rows = pendingReports(uid);
        write(uid, rows.map((row) => row.id === item.id ? { ...row, erro: error.message } : row));
        if (isNetworkFailure(error)) break;
      }
    }
  })().finally(() => { running.delete(uid); });
  running.set(uid, run);
  return run;
}
