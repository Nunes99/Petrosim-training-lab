import { getSupabase } from "./supabase-client.js";

const form = document.querySelector("#registration-form");
const submit = document.querySelector("#registration-submit");
const message = document.querySelector("#registration-message");

function setMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#registration-password").value;
  const confirmation = document.querySelector("#password-confirmation").value;
  if (password !== confirmation) {
    setMessage("As palavras-passe não coincidem.", true);
    return;
  }

  submit.disabled = true;
  setMessage("A criar o seu perfil…");
  const metadata = {
    full_name: document.querySelector("#full-name").value.trim(),
    phone: document.querySelector("#phone").value.trim(),
    country: document.querySelector("#country").value,
    city: document.querySelector("#city").value.trim(),
    professional_status: document.querySelector("#professional-status").value,
    education_area: document.querySelector("#education-area").value,
    institution: document.querySelector("#institution").value.trim(),
    job_title: document.querySelector("#job-title").value.trim(),
  };

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email: document.querySelector("#registration-email").value.trim(),
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
    if (!data.session) {
      form.reset();
      setMessage("Conta criada. Confirme o seu e-mail antes de iniciar sessão.");
      return;
    }
    window.location.replace("/dashboard");
  } catch (error) {
    setMessage(error.message || "Não foi possível criar a conta.", true);
  } finally {
    submit.disabled = false;
  }
});
