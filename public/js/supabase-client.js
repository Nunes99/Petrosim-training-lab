import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let clientPromise;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = fetch("/api/config")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Não foi possível carregar a configuração.");
        }

        const config = await response.json();
        if (!config.configured) {
          throw new Error(
            "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY."
          );
        }

        return createClient(config.supabase_url, config.supabase_anon_key);
      });
  }

  return clientPromise;
}
