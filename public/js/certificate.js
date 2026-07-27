import { requireSession } from "./supabase-client.js";

const defaultAssets = {
  logo_path: "/assets/certificates/default/lmtwebnairs-logo.png",
  product_logo_path: "",
  director_signature_path: "/assets/certificates/default/director-signature.png",
  academic_stamp_path: "/assets/certificates/default/academic-stamp.png",
  coordinator_signature_path: "/assets/certificates/default/coordinator-signature.png",
  institutional_seal_path: "/assets/certificates/default/institutional-seal.png",
};
let paymentContext = null;

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

function updatePrintDateTime() {
  document.querySelector("#certificate-print-datetime").textContent =
    new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
}

function setPrintAuthorized(authorized) {
  document.body.classList.toggle("print-authorized", authorized);
  document.querySelector("#print-certificate").disabled = !authorized;
}

function renderPaymentRequest(request) {
  const panel = document.querySelector("#certificate-payment-panel");
  panel.classList.remove("hidden");
  const status = document.querySelector("#certificate-payment-status");
  const form = document.querySelector("#certificate-payment-form");
  const description = document.querySelector("#certificate-payment-description");
  const statusCopy = {
    awaiting_proof: "Aguardando comprovativo",
    pending: "Comprovativo em análise",
    rejected: "Comprovativo rejeitado",
    approved: "Impressão liberada",
  };
  status.textContent = statusCopy[request.status] || request.status;
  status.className = `status-pill ${
    request.status === "approved" ? "success" : request.status === "rejected" ? "blocked" : ""
  }`;
  document.querySelector("#certificate-payment-amount").textContent =
    `${Number(request.amount).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${request.currency}`;
  document.querySelector("#certificate-payment-account-name").textContent =
    request.payment_account_name;
  document.querySelector("#certificate-payment-account-number").textContent =
    request.payment_account_number;
  document.querySelector("#certificate-payment-instructions").textContent =
    request.payment_instructions || "";
  form.classList.toggle("hidden", !["awaiting_proof", "rejected"].includes(request.status));
  if (request.status === "pending") {
    description.textContent =
      "O comprovativo foi enviado. A impressão será liberada após a validação administrativa.";
  } else if (request.status === "rejected") {
    description.textContent =
      `O comprovativo foi rejeitado${request.admin_note ? `: ${request.admin_note}` : "."} Envie um novo ficheiro.`;
  } else if (request.status === "approved") {
    description.textContent = "Pagamento validado. A impressão oficial está liberada.";
  }
  setPrintAuthorized(request.status === "approved");
}

async function configurePrintAccess(supabase, session, certificate, printPolicy) {
  setPrintAuthorized(false);
  if (session.user.id !== certificate.user_id || printPolicy.print_access_mode !== "paid") {
    document.querySelector("#certificate-payment-panel").classList.add("hidden");
    setPrintAuthorized(true);
    return;
  }
  const { data: existing, error: requestError } = await supabase
    .from("certificate_print_requests")
    .select("*")
    .eq("certificate_id", certificate.id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (requestError) throw requestError;
  let request = existing;
  if (!request) {
    const { data, error } = await supabase.rpc("create_certificate_print_request", {
      p_certificate_id: certificate.id,
    });
    if (error) throw error;
    request = data;
  }
  paymentContext = { supabase, session, certificate, request };
  renderPaymentRequest(request);
}

async function submitPaymentProof(event) {
  event.preventDefault();
  if (!paymentContext?.request) return;
  const file = document.querySelector("#certificate-payment-proof").files[0];
  const message = document.querySelector("#certificate-payment-message");
  const submit = document.querySelector("#certificate-payment-submit");
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) {
    message.textContent = "Utilize PNG, JPEG, WebP ou PDF.";
    message.classList.add("error");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    message.textContent = "O comprovativo não pode ultrapassar 5 MB.";
    message.classList.add("error");
    return;
  }
  submit.disabled = true;
  message.classList.remove("error");
  message.textContent = "A enviar comprovativo…";
  try {
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
      || (file.type === "application/pdf" ? "pdf" : "png");
    const path = `${paymentContext.session.user.id}/${paymentContext.request.id}/proof-${
      Date.now()
    }.${extension}`;
    const { error: uploadError } = await paymentContext.supabase.storage
      .from("certificate-payment-proofs")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await paymentContext.supabase.rpc(
      "submit_certificate_payment_proof",
      { p_request_id: paymentContext.request.id, p_proof_path: path },
    );
    if (error) throw error;
    paymentContext.request = data;
    renderPaymentRequest(data);
    message.textContent = "Comprovativo enviado para análise.";
    document.querySelector("#certificate-payment-proof").value = "";
  } catch (error) {
    message.textContent = error.message || "Não foi possível enviar o comprovativo.";
    message.classList.add("error");
  } finally {
    submit.disabled = false;
  }
}

async function init() {
  const parameters = new URLSearchParams(window.location.search);
  const certificateId = parameters.get("id");
  const certificateCode = parameters.get("code");
  if (!certificateId && !certificateCode) throw new Error("Certificado não indicado.");

  const { supabase, session } = await requireSession();
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
    supabase.from("certificate_templates").select("*").eq("module_id", certificate.module_id).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (templateResult.error) throw templateResult.error;
  const profile = profileResult.data;
  const liveTemplate = templateResult.data || {};
  const template = needsLiveTemplate ? { ...liveTemplate, ...snapshot } : snapshot;
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
  await configurePrintAccess(supabase, session, certificate, liveTemplate);
  updatePrintDateTime();
  document.body.classList.add("auth-ready");
}

document.querySelector("#print-certificate").addEventListener("click", () => {
  if (!document.body.classList.contains("print-authorized")) return;
  updatePrintDateTime();
  window.print();
});
document.querySelector("#certificate-model-select").addEventListener("change", (event) => {
  applyCertificateModel(event.target.value, true);
});
document.querySelector("#certificate-payment-form").addEventListener("submit", submitPaymentProof);
window.addEventListener("beforeprint", updatePrintDateTime);

init().catch((error) => {
  document.querySelector("#certificate-error").textContent = error.message;
  document.body.dataset.authError = error.message;
  document.body.classList.add("auth-error");
});
