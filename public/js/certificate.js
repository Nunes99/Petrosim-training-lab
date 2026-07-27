import { requireSession } from "./supabase-client.js";

async function init() {
  const certificateId = new URLSearchParams(window.location.search).get("id");
  if (!certificateId) throw new Error("Certificado não indicado.");

  const { supabase } = await requireSession();
  const { data: certificate, error } = await supabase
    .from("certificates")
    .select("id,user_id,certificate_code,final_score,issued_at,training_modules(title,description,duration_minutes)")
    .eq("id", certificateId)
    .single();
  if (error || !certificate) throw new Error("Certificado inexistente ou sem autorização de acesso.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name,display_name")
    .eq("id", certificate.user_id)
    .single();
  if (profileError) throw profileError;

  document.querySelector("#certificate-student").textContent =
    profile.full_name || profile.display_name || "Formando PetroSimLab";
  document.querySelector("#certificate-module").textContent =
    certificate.training_modules?.title || "Laboratório PetroSimLab";
  document.querySelector("#certificate-description").textContent =
    certificate.training_modules?.description || "Programa de formação técnica aplicada.";
  document.querySelector("#certificate-score").textContent = `${certificate.final_score}%`;
  document.querySelector("#certificate-date").textContent = new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit", month: "long", year: "numeric",
  }).format(new Date(certificate.issued_at));
  document.querySelector("#certificate-duration").textContent =
    `${certificate.training_modules?.duration_minutes || "—"} minutos`;
  document.querySelector("#certificate-code").textContent = certificate.certificate_code;
  document.body.classList.add("auth-ready");
}

document.querySelector("#print-certificate").addEventListener("click", () => window.print());

init().catch((error) => {
  document.querySelector("#certificate-error").textContent = error.message;
  document.body.dataset.authError = error.message;
  document.body.classList.add("auth-error");
});
