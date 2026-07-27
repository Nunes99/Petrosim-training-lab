import { getSupabase } from "./supabase-client.js";

const form = document.querySelector("#auth-form");
const message = document.querySelector("#auth-message");
const submitButton = document.querySelector("#auth-submit");
const modeButton = document.querySelector("#auth-mode");
const title = document.querySelector("#auth-title");
let signUpMode = false;

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

modeButton.addEventListener("click", () => {
  signUpMode = !signUpMode;
  title.textContent = signUpMode ? "Criar conta" : "Entrar";
  submitButton.textContent = signUpMode ? "Criar conta" : "Entrar";
  modeButton.textContent = signUpMode
    ? "Já tenho uma conta"
    : "Criar uma conta";
  setMessage("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setMessage("A processar...");

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  try {
    const supabase = await getSupabase();
    const result = signUpMode
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;

    if (signUpMode && !result.data.session) {
      setMessage("Conta criada. Confirme o e-mail antes de entrar.");
      return;
    }

    window.location.href = "/dashboard";
  } catch (error) {
    setMessage(error.message || "Falha na autenticação.", true);
  } finally {
    submitButton.disabled = false;
  }
});

(async () => {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) window.location.href = "/dashboard";
  } catch (error) {
    setMessage(error.message, true);
  }
})();
