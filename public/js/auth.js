import { getCurrentProfile, getSupabase } from "./supabase-client.js";

const form = document.querySelector("#auth-form");
const message = document.querySelector("#auth-message");
const submitButton = document.querySelector("#auth-submit");
const nextParameter = new URLSearchParams(window.location.search).get("next");
const nextPage = nextParameter?.startsWith("/") && !nextParameter.startsWith("//")
  ? nextParameter
  : "/dashboard";

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function routeAuthenticatedUser(supabase, session) {
  const profile = await getCurrentProfile(supabase, session.user.id);
  if (profile.account_status !== "active") {
    await supabase.auth.signOut();
    throw new Error("Esta conta está suspensa. Contacte a administração.");
  }
  if (profile.role === "admin") {
    await supabase.auth.signOut();
    throw new Error("Contas administrativas devem entrar pelo Portal de Administração.");
  }
  window.location.replace(nextPage.startsWith("/admin") ? "/dashboard" : nextPage);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setMessage("A validar credenciais…");

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  try {
    const supabase = await getSupabase();
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    await routeAuthenticatedUser(supabase, result.data.session);
  } catch (error) {
    const invalid = /invalid login credentials/i.test(error.message || "");
    setMessage(
      invalid ? "E-mail ou palavra-passe incorretos." : error.message || "Não foi possível iniciar sessão.",
      true,
    );
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#forgot-password").addEventListener("click", async () => {
  const email = document.querySelector("#email").value.trim();
  if (!email) {
    setMessage("Introduza primeiro o seu e-mail.", true);
    document.querySelector("#email").focus();
    return;
  }
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/profile?recovery=1`,
    });
    if (error) throw error;
    setMessage("Enviámos as instruções de recuperação para o seu e-mail.");
  } catch (error) {
    setMessage(error.message || "Não foi possível enviar a recuperação.", true);
  }
});

(async () => {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) await routeAuthenticatedUser(supabase, data.session);
  } catch (error) {
    setMessage(error.message || "Não foi possível validar a sessão.", true);
  }
})();
