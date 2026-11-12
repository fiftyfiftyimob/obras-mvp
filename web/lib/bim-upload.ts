import { supabase } from "./supabase";

const CHUNK_SIZE = 6 * 1024 * 1024;
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mulgoijgvmizboyxmxmg.supabase.co";
const endpoint = projectUrl.replace(".supabase.co", ".storage.supabase.co") + "/storage/v1/upload/resumable";

function metadata(fields: Record<string, string>) {
  return Object.entries(fields).map(([key, value]) =>
    key + " " + btoa(String.fromCharCode(...Array.from(new TextEncoder().encode(value))))
  ).join(",");
}

async function authenticatedHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Entre novamente para enviar o IFC.");
  return { Authorization: "Bearer " + data.session.access_token, "Tus-Resumable": "1.0.0" };
}

async function checked(response: Response) {
  if (!response.ok) throw new Error("Falha no envio do IFC (" + response.status + "): " + (await response.text()).slice(0, 180));
  return response;
}

export async function uploadIfc(file: File, path: string, importId: string, onProgress: (percent: number) => void) {
  if (file.size <= CHUNK_SIZE) {
    const { error } = await supabase.storage.from("modelos-bim").upload(path, file, {
      contentType: "application/octet-stream", upsert: false,
    });
    if (error) throw error;
    onProgress(100);
    return;
  }
  const headers = await authenticatedHeaders();
  const key = "bim-tus-" + importId;
  let url = localStorage.getItem(key);
  let offset = 0;
  if (url) {
    const old = new URL(url, endpoint);
    if (old.origin !== new URL(endpoint).origin) throw new Error("Endereço de envio inválido.");
    const response = await fetch(old, { method: "HEAD", headers });
    if (response.ok) offset = Number(response.headers.get("Upload-Offset") || "0");
    else { localStorage.removeItem(key); url = null; }
  }
  if (!url) {
    const response = await checked(await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, "Upload-Length": String(file.size),
        "Upload-Metadata": metadata({
          bucketName: "modelos-bim", objectName: path,
          contentType: "application/octet-stream", cacheControl: "3600",
        }) },
    }));
    const location = response.headers.get("Location");
    if (!location) throw new Error("O servidor não retornou o endereço do envio.");
    const created = new URL(location, endpoint);
    if (created.origin !== new URL(endpoint).origin) throw new Error("Endereço de envio inválido.");
    url = created.href;
    localStorage.setItem(key, url);
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size)
    throw new Error("Posição de retomada do envio inválida.");
  while (offset < file.size) {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
        response = await checked(await fetch(url, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": String(offset) },
          body: chunk,
        }));
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        const head = await checked(await fetch(url, { method: "HEAD", headers }));
        offset = Number(head.headers.get("Upload-Offset") || offset);
      }
    }
    offset = Number(response?.headers.get("Upload-Offset") || Math.min(offset + CHUNK_SIZE, file.size));
    onProgress(Math.round(offset / file.size * 100));
  }
  localStorage.removeItem(key);
}
