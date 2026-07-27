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
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = redirect === "/login"
      ? `/login?next=${encodeURIComponent(current)}`
      : redirect;
    window.location.replace(target);
    throw new Error("Sessão necessária.");
  }
  return { supabase, session };
}

export async function authenticatedFetch(resource, options = {}) {
  const { supabase, session } = await requireSession();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(resource, { ...options, headers });
  if (response.status === 401) {
    await supabase.auth.signOut();
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`/login?next=${encodeURIComponent(current)}`);
    throw new Error("A sua sessão expirou. Inicie sessão novamente.");
  }
  return response;
}

export async function initializeRestrictedPage() {
  const auth = await requireSession();
  document.querySelectorAll("[data-user-email]").forEach((node) => {
    node.textContent = auth.session.user.email || "Utilizador autenticado";
  });
  const signOut = document.querySelector("#lab-sign-out");
  if (signOut) {
    signOut.addEventListener("click", async () => {
      signOut.disabled = true;
      await auth.supabase.auth.signOut();
      window.location.replace("/");
    });
  }
  document.body.classList.add("auth-ready");
  return auth;
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
