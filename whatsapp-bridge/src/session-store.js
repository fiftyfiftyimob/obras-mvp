import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const bucket = "whatsapp-sessao";

export function createSessionStore(url, serviceRoleKey, dataPath) {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const localFile = (session) => path.join(dataPath, `${session}.zip`);
  const remoteFile = (session) => `${session}.zip`;

  return {
    async sessionExists({ session }) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list("", { search: remoteFile(session), limit: 10 });
      if (error) throw error;
      return (data || []).some((item) => item.name === remoteFile(session));
    },
    async save({ session }) {
      const bytes = await fs.readFile(localFile(session));
      const { error } = await supabase.storage
        .from(bucket)
        .upload(remoteFile(session), bytes, {
          contentType: "application/zip",
          upsert: true,
        });
      if (error) throw error;
    },
    async extract({ session, path: destination }) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(remoteFile(session));
      if (error) throw error;
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, Buffer.from(await data.arrayBuffer()));
    },
    async delete({ session }) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove([remoteFile(session)]);
      if (error) throw error;
    },
  };
}
