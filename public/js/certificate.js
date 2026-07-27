import { requireSession } from "./supabase-client.js";

const defaultAssets = {
  logo_path: "/assets/certificates/default/lmtwebnairs-logo.png",
  product_logo_path: "",
  director_signature_path: "/assets/certificates/default/director-signature.png",
  academic_stamp_path: "/assets/certificates/default/academic-stamp.png",
  coordinator_signature_path: "/assets/certificates/default/coordinator-signature.png",
  institutional_seal_path: "/assets/certificates/default/institutional-seal.png",
};

function assetUrl(supabase, path, fallback) {
  const value = path || fallback;
  if (!value) return "";
  if (value.startsWith("/") || /^https?:\/\//i.test(value)) return value;
  return supabase.storage.from("certificate-assets").getPublicUrl(value).data.publicUrl;
}

function setImage(selector, source) {
  const image = document.querySelector(selector);
  if (source) image.src = source;
  else image.removeAttribute("src");
  image.classList.toggle("hidden", !source);
  return Boolean(source);
}

function setText(selectors, value) {
  selectors.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
}

function loadQrCodes(source) {
  return Promise.all([...document.querySelectorAll("[data-certificate-qr]")].map((image) => (
    new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener(
        "error",
        () => reject(new Error("Não foi possível gerar o QR de verificação.")),
        { once: true },
      );
      image.src = source;
    })
  )));
}

function applyCertificateModel(requestedModel, syncUrl = false) {
  const model = requestedModel === "classic" ? "classic" : "qualification";
  const qualification = document.querySelector("#qualification-certificate");
  const classic = document.querySelector("#classic-certificate");
  qualification.classList.toggle("hidden", model !== "qualification");
  qualification.setAttribute("aria-hidden", String(model !== "qualification"));
  classic.classList.toggle("hidden", model !== "classic");
  classic.setAttribute("aria-hidden", String(model !== "classic"));
  document.querySelector("#certificate-model-select").value = model;
  document.body.dataset.certificateModel = model;

  if (syncUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("model", model);
    window.history.replaceState({}, "", url);
  }
}

async function init() {
  const parameters = new URLSearchParams(window.location.search);
  const certificateId = parameters.get("id");
  const certificateCode = parameters.get("code");
  if (!certificateId && !certificateCode) throw new Error("Certificado não indicado.");

  const { supabase } = await requireSession();
  let certificateQuery = supabase
    .from("certificates")
    .select(
      "id,user_id,module_id,certificate_code,final_score,issued_at,template_snapshot,training_modules(title,description,duration_minutes)"
    );
  certificateQuery = certificateId
    ? certificateQuery.eq("id", certificateId)
    : certificateQuery.eq("certificate_code", certificateCode);
  const { data: certificate, error } = await certificateQuery.single();
  if (error || !certificate) throw new Error("Certificado inexistente ou sem autorização de acesso.");

  const snapshot = certificate.template_snapshot || {};
  const needsLiveTemplate = !Object.keys(snapshot).length
    || !Object.hasOwn(snapshot, "product_credit_text")
    || !Object.hasOwn(snapshot, "product_logo_path")
    || !Object.hasOwn(snapshot, "layout_style");
  const [profileResult, templateResult] = await Promise.all([
    supabase.from("profiles").select("full_name,display_name").eq("id", certificate.user_id).single(),
    needsLiveTemplate
      ? supabase.from("certificate_templates").select("*").eq("module_id", certificate.module_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (templateResult.error) throw templateResult.error;
  const profile = profileResult.data;
  const template = needsLiveTemplate
    ? { ...(templateResult.data || {}), ...snapshot }
    : snapshot;
  const issuedDate = new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit", month: "long", year: "numeric",
  }).format(new Date(certificate.issued_at));
  const verificationBase = template.verification_base_url || `${window.location.origin}/certificate`;
  const separator = verificationBase.includes("?") ? "&" : "?";
  const verificationUrl = `${verificationBase}${separator}code=${encodeURIComponent(certificate.certificate_code)}`;
  const studentName = profile.full_name || profile.display_name || "Formando PetroSimLab";
  const moduleTitle = certificate.training_modules?.title || "Laboratório PetroSimLab";
  const moduleDescription = certificate.training_modules?.description
    || "Programa de formação técnica aplicada.";
  const duration = `${certificate.training_modules?.duration_minutes || "—"} minutos`;
  const finalScore = `${certificate.final_score}%`;
  const productCredit = template.product_credit_text
    || "PetroSimLab, produto da LMTWEB, desenvolvido pela LEMOTE.";

  setText(["#certificate-student", "#classic-certificate-student"], studentName);
  setText(["#certificate-module", "#classic-certificate-module"], moduleTitle);
  setText(["#certificate-description", "#classic-certificate-description"], moduleDescription);
  setText(["#certificate-score", "#classic-certificate-score"], finalScore);
  setText(["#certificate-date", "#classic-certificate-date"], issuedDate);
  setText(["#certificate-duration", "#classic-certificate-duration"], duration);
  setText(["#certificate-code", "#classic-certificate-code"], certificate.certificate_code);
  document.querySelector("#certificate-register").textContent = certificate.certificate_code;
  document.querySelector("#certificate-issuer").textContent = template.issuer_name || "LMTWEBNAIRS";
  document.querySelector("#certificate-title").textContent =
    template.certificate_title || "Certificado de Qualificação";
  document.querySelector("#certificate-qualification").textContent =
    template.qualification_label || "Qualificação profissional";
  document.querySelector("#certificate-location").textContent =
    template.location_text || "Cidade de Maputo, Moçambique";
  document.querySelector("#certificate-director-name").textContent =
    template.director_name || "Direção Académica";
  document.querySelector("#certificate-director-title").textContent =
    template.director_title || "Diretor Académico";
  document.querySelector("#certificate-coordinator-name").textContent =
    template.coordinator_name || "Coordenação do Programa";
  document.querySelector("#certificate-coordinator-title").textContent =
    template.coordinator_title || "Coordenador do Programa";
  setText(["#certificate-product-credit", "#classic-product-credit"], productCredit);
  const qrSource = `/api/certificates/qr?target=${encodeURIComponent(verificationUrl)}`;

  const topics = template.program_topics?.length
    ? template.program_topics
    : ["Conteúdo técnico aplicado", "Simulação e interpretação de resultados"];
  const topicList = document.querySelector("#certificate-topics");
  topicList.replaceChildren(...topics.map((topic) => {
    const item = document.createElement("li");
    item.textContent = topic;
    return item;
  }));

  setImage("#certificate-logo", assetUrl(supabase, template.logo_path, defaultAssets.logo_path));
  const productLogoSource = assetUrl(
    supabase,
    template.product_logo_path,
    defaultAssets.product_logo_path,
  );
  setImage(
    "#certificate-product-logo",
    productLogoSource,
  );
  const hasClassicLogo = setImage("#classic-product-logo", productLogoSource);
  document.querySelector("#classic-brandmark").classList.toggle("hidden", hasClassicLogo);
  setImage(
    "#certificate-left-signature",
    assetUrl(supabase, template.director_signature_path, defaultAssets.director_signature_path),
  );
  setImage(
    "#certificate-left-stamp",
    assetUrl(supabase, template.academic_stamp_path, defaultAssets.academic_stamp_path),
  );
  setImage(
    "#certificate-right-signature",
    assetUrl(supabase, template.coordinator_signature_path, defaultAssets.coordinator_signature_path),
  );
  setImage(
    "#certificate-right-stamp",
    assetUrl(supabase, template.institutional_seal_path, defaultAssets.institutional_seal_path),
  );
  const requestedModel = parameters.get("model") || template.layout_style || "qualification";
  applyCertificateModel(requestedModel);
  await loadQrCodes(qrSource);
  document.body.classList.add("auth-ready");
}

document.querySelector("#print-certificate").addEventListener("click", () => window.print());
document.querySelector("#certificate-model-select").addEventListener("change", (event) => {
  applyCertificateModel(event.target.value, true);
});

init().catch((error) => {
  document.querySelector("#certificate-error").textContent = error.message;
  document.body.dataset.authError = error.message;
  document.body.classList.add("auth-error");
});
