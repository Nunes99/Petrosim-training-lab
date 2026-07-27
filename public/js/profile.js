import { formatDate, getCurrentProfile, requireSession } from "./supabase-client.js";

const statusLabels = {
  student: "Estudante",
  professor: "Professor ou docente",
  researcher: "Investigador",
  employee: "Funcionário",
  technician: "Técnico",
  engineer: "Engenheiro",
  manager: "Gestor",
  consultant: "Consultor",
  job_seeker: "À procura de oportunidade",
  other: "Outro",
};

let supabase;
let session;
let profile;

function initials(name) {
  return (name || "PetroSim")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function setFormMessage(selector, text, error = false) {
  const element = document.querySelector(selector);
  element.textContent = text;
  element.classList.toggle("error", error);
}

function fillProfile(data) {
  document.querySelector("#profile-full-name").value = data.full_name || data.display_name || "";
  document.querySelector("#profile-email").value = data.email || session.user.email || "";
  document.querySelector("#profile-phone").value = data.phone || "";
  document.querySelector("#profile-country").value = data.country || "Moçambique";
  document.querySelector("#profile-city").value = data.city || "";
  document.querySelector("#profile-professional-status").value = data.professional_status || "student";
  document.querySelector("#profile-education-area").value = data.education_area || "";
  document.querySelector("#profile-institution").value = data.institution || "";
  document.querySelector("#profile-job-title").value = data.job_title || "";
  document.querySelector("#profile-bio").value = data.bio || "";
  document.querySelector("#profile-heading-name").textContent = data.full_name || data.display_name || "Formando";
  document.querySelector("#profile-heading-context").textContent =
    `${statusLabels[data.professional_status] || "Formando"} · ${data.institution || "Instituição não indicada"}`;
  document.querySelector("#profile-initials").textContent = initials(data.full_name || data.display_name);
  ["#profile-country", "#profile-professional-status"].forEach((selector) => {
    document.querySelector(selector).dispatchEvent(new Event("change", { bubbles: true }));
  });

  const completionFields = [
    data.full_name, data.phone, data.country, data.city, data.professional_status,
    data.education_area, data.institution, data.job_title, data.bio,
  ];
  const percentage = Math.round(completionFields.filter(Boolean).length / completionFields.length * 100);
  document.querySelector("#profile-completion").textContent = `Perfil ${percentage}% completo`;
}

function renderCertificates(certificates) {
  const container = document.querySelector("#profile-certificates");
  container.innerHTML = "";
  if (!certificates.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Ainda não existem certificações. Conclua um laboratório elegível para receber a primeira.";
    container.append(empty);
    return;
  }
  certificates.forEach((certificate) => {
    const card = document.createElement("article");
    card.className = "certificate-card";
    const seal = document.createElement("span");
    seal.className = "certificate-seal material-symbols-outlined";
    seal.setAttribute("aria-hidden", "true");
    seal.textContent = "workspace_premium";
    const content = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Certificação PetroSimLab";
    const title = document.createElement("h3");
    title.textContent = certificate.training_modules?.title || "Laboratório concluído";
    const meta = document.createElement("p");
    meta.textContent = `${certificate.final_score}% · Emitido em ${formatDate(certificate.issued_at)}`;
    const code = document.createElement("code");
    code.textContent = certificate.certificate_code;
    const link = document.createElement("a");
    link.className = "button secondary compact";
    link.href = `/certificate?id=${encodeURIComponent(certificate.id)}`;
    const linkIcon = document.createElement("span");
    linkIcon.className = "material-symbols-outlined";
    linkIcon.setAttribute("aria-hidden", "true");
    linkIcon.textContent = "workspace_premium";
    link.append(linkIcon, document.createTextNode("Ver certificado"));
    content.append(eyebrow, title, meta, code, link);
    card.append(seal, content);
    container.append(card);
  });
}

async function loadCertificates() {
  const { data, error } = await supabase
    .from("certificates")
    .select("id,certificate_code,final_score,issued_at,training_modules(title,category,duration_minutes)")
    .order("issued_at", { ascending: false });
  if (error) throw error;
  renderCertificates(data || []);
}

document.querySelector("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = document.querySelector("#profile-save");
  submit.disabled = true;
  setFormMessage("#profile-message", "A guardar alterações…");
  const fullName = document.querySelector("#profile-full-name").value.trim();
  const payload = {
    display_name: fullName,
    full_name: fullName,
    phone: document.querySelector("#profile-phone").value.trim(),
    country: document.querySelector("#profile-country").value,
    city: document.querySelector("#profile-city").value.trim(),
    professional_status: document.querySelector("#profile-professional-status").value,
    education_area: document.querySelector("#profile-education-area").value.trim(),
    institution: document.querySelector("#profile-institution").value.trim(),
    job_title: document.querySelector("#profile-job-title").value.trim(),
    bio: document.querySelector("#profile-bio").value.trim(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("profiles").update(payload).eq("id", session.user.id);
  submit.disabled = false;
  if (error) {
    setFormMessage("#profile-message", error.message, true);
    return;
  }
  profile = { ...profile, ...payload };
  fillProfile(profile);
  setFormMessage("#profile-message", "Perfil atualizado com sucesso.");
});

document.querySelector("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#new-password").value;
  const confirmation = document.querySelector("#confirm-new-password").value;
  if (password !== confirmation) {
    setFormMessage("#password-message", "As palavras-passe não coincidem.", true);
    return;
  }
  const submit = document.querySelector("#password-submit");
  submit.disabled = true;
  setFormMessage("#password-message", "A atualizar a segurança…");
  const { error } = await supabase.auth.updateUser({ password });
  submit.disabled = false;
  if (error) {
    setFormMessage("#password-message", error.message, true);
    return;
  }
  event.currentTarget.reset();
  setFormMessage("#password-message", "Palavra-passe atualizada com sucesso.");
});

document.querySelector("#sign-out-others").addEventListener("click", async () => {
  const button = document.querySelector("#sign-out-others");
  button.disabled = true;
  const { error } = await supabase.auth.signOut({ scope: "others" });
  button.disabled = false;
  setFormMessage(
    "#password-message",
    error ? error.message : "As outras sessões foram terminadas.",
    Boolean(error),
  );
});

async function init() {
  try {
    const auth = await requireSession();
    supabase = auth.supabase;
    session = auth.session;
    profile = await getCurrentProfile(supabase, session.user.id);
    if (profile.role === "admin") {
      window.location.replace("/admin");
      return;
    }
    if (profile.account_status !== "active") {
      await supabase.auth.signOut();
      window.location.replace("/login?status=suspended");
      return;
    }
    document.querySelector("#profile-sidebar-email").textContent = session.user.email;
    fillProfile(profile);
    await loadCertificates();
    document.body.classList.add("auth-ready");
    document.querySelector("#profile-sign-out").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.replace("/");
    });
  } catch (error) {
    document.body.dataset.authError = error.message || "Não foi possível carregar o perfil.";
    document.body.classList.add("auth-error");
  }
}

init();
