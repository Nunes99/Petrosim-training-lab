import { getCurrentProfile, getSupabase } from "./supabase-client.js";

const form = document.querySelector("#admin-auth-form");
const submit = document.querySelector("#admin-auth-submit");
const message = document.querySelector("#admin-auth-message");

function setMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}

async function verifyAdministrator(supabase, session) {
  const [{ data: allowed, error }, profile] = await Promise.all([
    supabase.rpc("is_admin"),
    getCurrentProfile(supabase, session.user.id),
  ]);
  if (error || allowed !== true || profile.role !== "admin" || profile.account_status !== "active") {
    await supabase.auth.signOut();
    throw new Error("Credenciais administrativas inválidas ou acesso não autorizado.");
  }
  window.location.replace("/admin");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  setMessage("A validar autorização administrativa…");
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: document.querySelector("#admin-login-email").value.trim(),
      password: document.querySelector("#admin-login-password").value,
    });
    if (error) throw error;
    await verifyAdministrator(supabase, data.session);
  } catch (error) {
    setMessage(
      /invalid login credentials/i.test(error.message || "")
        ? "Credenciais administrativas inválidas."
        : error.message || "Não foi possível validar o acesso.",
      true,
    );
  } finally {
    submit.disabled = false;
  }
});

(async () => {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) await verifyAdministrator(supabase, data.session);
  } catch (error) {
    setMessage(error.message, true);
  }
})();
