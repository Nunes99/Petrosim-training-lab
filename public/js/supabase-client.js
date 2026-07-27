import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let clientPromise;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = fetch("/api/config").then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar a configuração.");
      const config = await response.json();
      if (!config.configured) {
        throw new Error("Supabase não configurado. Contacte a administração.");
      }
      return createClient(config.supabase_url, config.supabase_anon_key);
    });
  }
  return clientPromise;
}

export async function requireSession(redirect = "/login") {
  const supabase = await getSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.href = redirect;
    throw new Error("Sessão necessária.");
  }
  return { supabase, session };
}

export function formatDate(value) {
  if (!value) return "Sem atividade";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
