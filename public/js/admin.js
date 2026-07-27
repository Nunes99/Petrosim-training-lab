import { formatDate, getCurrentProfile, requireSession } from "./supabase-client.js";

let supabase;
let session;
let currentProfile;
let profiles = [];
let simulations = [];
let simulationCount = 0;
let modules = [];
let certificates = [];
let accessGrants = [];
let auditLogs = [];
let certificateTemplates = [];
let printRequests = [];
let selectedAccessUserId = null;
let selectedDetailUserId = null;

const roleLabels = { student: "Estudante", instructor: "Formador", admin: "Administrador" };
const statusLabels = { active: "Ativo", suspended: "Suspenso" };
const printRequestStatusLabels = {
  awaiting_proof: "Sem comprovativo",
  pending: "Em análise",
  approved: "Liberado",
  rejected: "Rejeitado",
};
const difficultyLabels = { foundation: "Fundamental", intermediate: "Intermédio", advanced: "Avançado" };
const moduleLabels = {
  "Reservoir Reserves Lab": "Laboratório de Reservas",
  "Petroleum Economics Lab": "Laboratório de Economia do Petróleo",
  "HSE Decision Trainer": "Simulador de Decisões de Segurança",
};
const viewLabels = {
  overview: "Visão geral",
  users: "Utilizadores",
  access: "Permissões",
  modules: "Laboratórios",
  certificates: "Certificações",
  activity: "Auditoria",
};
const auditLabels = {
  "user.role_changed": "Função de utilizador alterada",
  "user.status_changed": "Estado de conta alterado",
  "user.profile_updated": "Perfil de utilizador atualizado",
  "user.account_deleted": "Conta de utilizador eliminada",
  "lab.access_changed": "Permissão de laboratório alterada",
  "certificate.print_approved": "Impressão de certificado liberada",
  "certificate.print_rejected": "Comprovativo de pagamento rejeitado",
};
const defaultCertificateAssets = {
  logo_path: "/assets/certificates/default/lmtwebnairs-logo.png",
  product_logo_path: "",
  director_signature_path: "/assets/certificates/default/director-signature.png",
  academic_stamp_path: "/assets/certificates/default/academic-stamp.png",
  coordinator_signature_path: "/assets/certificates/default/coordinator-signature.png",
  institutional_seal_path: "/assets/certificates/default/institutional-seal.png",
};
const certificateAssetFields = [
  {
    column: "logo_path", input: "#asset-logo", preview: "#preview-logo",
    livePreview: "#template-preview-logo",
  },
  {
    column: "product_logo_path", input: "#asset-product-logo",
    preview: "#preview-product-logo", livePreview: "#template-preview-product-logo",
  },
  {
    column: "director_signature_path", input: "#asset-director-signature",
    preview: "#preview-director-signature", livePreview: "#template-preview-left-signature",
  },
  {
    column: "academic_stamp_path", input: "#asset-academic-stamp",
    preview: "#preview-academic-stamp", livePreview: "#template-preview-left-stamp",
  },
  {
    column: "coordinator_signature_path", input: "#asset-coordinator-signature",
    preview: "#preview-coordinator-signature", livePreview: "#template-preview-right-signature",
  },
  {
    column: "institutional_seal_path", input: "#asset-institutional-seal",
    preview: "#preview-institutional-seal", livePreview: "#template-preview-right-stamp",
  },
];
const buttonIcons = {
  Guardar: "save",
  Detalhes: "person",
  Acessos: "key",
  Suspender: "block",
  Reativar: "refresh",
  Retirar: "publish",
  Publicar: "publish",
  Editar: "edit",
  Eliminar: "delete",
  Visualizar: "workspace_premium",
};

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase();

function initials(value) {
  return String(value || "Administrador").split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]).join("").toUpperCase();
}

function setStatus(text, success = false) {
  const element = document.querySelector("#admin-status");
  element.textContent = text;
  element.classList.toggle("success", success);
}

function setMessage(selector, text, error = false) {
  const element = document.querySelector(selector);
  element.textContent = text;
  element.classList.toggle("error", error);
}

function button(label, className, handler) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  const iconName = buttonIcons[label];
  if (iconName) {
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconName;
    element.append(icon);
  }
  element.append(document.createTextNode(label));
  element.addEventListener("click", handler);
  return element;
}

function emptyTableRow(columnCount, message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.className = "admin-table-empty";
  cell.textContent = message;
  row.append(cell);
  return row;
}

function setView(name) {
  document.querySelectorAll("[data-admin-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.adminView === name);
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === name);
  });
  document.querySelector("#current-admin-view").textContent = viewLabels[name] || name;
  if (name === "access") renderAccessUsers();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function profileById(id) {
  return profiles.find((profile) => profile.id === id);
}

function moduleById(id) {
  return modules.find((module) => module.id === id);
}

function moduleAccessFor(profile, module) {
  if (profile.role === "admin") {
    return { allowed: true, source: "Acesso administrativo" };
  }
  const accessLevel = profile.role === "instructor" ? "trainer" : "student";
  const grant = accessGrants.find((item) => (
    item.user_id === profile.id
    && item.module_id === module.id
    && item.access_level === accessLevel
  ));
  const now = Date.now();
  const grantIsCurrent = grant
    && (!grant.starts_at || new Date(grant.starts_at).getTime() <= now)
    && (!grant.expires_at || new Date(grant.expires_at).getTime() > now);
  if (grant) {
    return {
      allowed: Boolean(grant.is_allowed && grantIsCurrent && module.is_published),
      source: grantIsCurrent ? "Permissão individual" : "Permissão expirada ou futura",
    };
  }
  if (accessLevel === "trainer") {
    return { allowed: false, source: "Sem atribuição de formador" };
  }
  return {
    allowed: Boolean(module.default_student_access && module.is_published),
    source: module.default_student_access ? "Acesso padrão" : "Acesso não atribuído",
  };
}

function renderUserDetailLabs(profile) {
  const container = document.querySelector("#user-details-labs");
  container.replaceChildren();
  modules.forEach((module) => {
    const access = moduleAccessFor(profile, module);
    const item = document.createElement("article");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = module.title;
    const meta = document.createElement("span");
    meta.textContent = `${module.category} · ${access.source}`;
    const status = document.createElement("span");
    status.className = `status-pill ${access.allowed ? "success" : "blocked"}`;
    status.textContent = access.allowed ? "Disponível" : "Sem acesso";
    copy.append(title, meta);
    item.append(copy, status);
    container.append(item);
  });
}

function setSelectValue(selector, value) {
  const select = document.querySelector(selector);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function refreshUserDetailCounts(userId) {
  const [simulationsResult, certificatesResult] = await Promise.all([
    supabase.from("simulations").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("certificates").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (selectedDetailUserId !== userId) return;
  if (!simulationsResult.error) {
    document.querySelector("#user-details-simulations").textContent =
      simulationsResult.count ?? 0;
  }
  if (!certificatesResult.error) {
    document.querySelector("#user-details-certificates").textContent =
      certificatesResult.count ?? 0;
  }
}

function openUserDetails(profile) {
  if (!profile) return;
  selectedDetailUserId = profile.id;
  document.querySelector("#user-details-public-id").textContent =
    profile.public_id || "ID não atribuído";
  document.querySelector("#user-details-full-name").value =
    profile.full_name || profile.display_name || "";
  document.querySelector("#user-details-email").value = profile.email || "";
  document.querySelector("#user-details-phone").value = profile.phone || "";
  document.querySelector("#user-details-country").value = profile.country || "";
  document.querySelector("#user-details-city").value = profile.city || "";
  document.querySelector("#user-details-education-area").value = profile.education_area || "";
  document.querySelector("#user-details-institution").value = profile.institution || "";
  document.querySelector("#user-details-job-title").value = profile.job_title || "";
  document.querySelector("#user-details-bio").value = profile.bio || "";
  setSelectValue("#user-details-professional-status", profile.professional_status || "student");
  setSelectValue("#user-details-role", profile.role);
  setSelectValue("#user-details-status", profile.account_status);
  document.querySelector("#user-details-created").textContent = formatDate(profile.created_at);
  document.querySelector("#user-details-updated").textContent = formatDate(profile.updated_at);
  document.querySelector("#user-details-simulations").textContent = "…";
  document.querySelector("#user-details-certificates").textContent = "…";
  const accountStatus = document.querySelector("#user-details-account-status");
  accountStatus.className = `status-pill ${profile.account_status === "active" ? "success" : "blocked"}`;
  accountStatus.textContent = statusLabels[profile.account_status] || profile.account_status;
  const deleteButton = document.querySelector("#user-details-delete");
  deleteButton.disabled = profile.id === session.user.id;
  deleteButton.title = deleteButton.disabled
    ? "A conta administrativa em uso não pode ser eliminada."
    : "Eliminar permanentemente esta conta e os respetivos dados.";
  document.querySelector("#user-details-manage-access").disabled = profile.role === "admin";
  renderUserDetailLabs(profile);
  setMessage("#user-details-message", "");
  const dialog = document.querySelector("#user-details-dialog");
  if (!dialog.open) dialog.showModal();
  refreshUserDetailCounts(profile.id).catch(() => {
    if (selectedDetailUserId !== profile.id) return;
    document.querySelector("#user-details-simulations").textContent =
      simulations.filter((item) => item.user_id === profile.id).length;
    document.querySelector("#user-details-certificates").textContent =
      certificates.filter((item) => item.user_id === profile.id).length;
  });
}

async function saveUserDetails(event) {
  event.preventDefault();
  const profile = profileById(selectedDetailUserId);
  if (!profile) return;
  const submit = document.querySelector("#user-details-save");
  submit.disabled = true;
  setMessage("#user-details-message", "A guardar alterações…");
  const role = document.querySelector("#user-details-role").value;
  const accountStatus = document.querySelector("#user-details-status").value;
  try {
    const { error: profileError } = await supabase.rpc("admin_update_user_profile", {
      p_target_user_id: profile.id,
      p_full_name: document.querySelector("#user-details-full-name").value.trim(),
      p_role: role,
      p_account_status: accountStatus,
      p_phone: document.querySelector("#user-details-phone").value.trim(),
      p_country: document.querySelector("#user-details-country").value.trim(),
      p_city: document.querySelector("#user-details-city").value.trim(),
      p_professional_status: document.querySelector("#user-details-professional-status").value,
      p_education_area: document.querySelector("#user-details-education-area").value.trim(),
      p_institution: document.querySelector("#user-details-institution").value.trim(),
      p_job_title: document.querySelector("#user-details-job-title").value.trim(),
      p_bio: document.querySelector("#user-details-bio").value.trim(),
    });
    if (profileError) throw profileError;
    await loadAdminData({ preserveView: true });
    openUserDetails(profileById(profile.id));
    setMessage("#user-details-message", "Dados do utilizador atualizados com sucesso.");
  } catch (error) {
    setMessage("#user-details-message", error.message || "Não foi possível atualizar o utilizador.", true);
  } finally {
    submit.disabled = false;
  }
}

async function deleteUserAccount() {
  const profile = profileById(selectedDetailUserId);
  if (!profile || profile.id === session.user.id) return;
  const displayName = profile.full_name || profile.display_name || profile.email;
  if (!window.confirm(
    `Eliminar permanentemente a conta de “${displayName}”? Esta ação remove perfil, acessos, simulações e certificações e não pode ser anulada.`,
  )) return;
  const action = document.querySelector("#user-details-delete");
  action.disabled = true;
  setMessage("#user-details-message", "A eliminar utilizador…");
  const { error } = await supabase.rpc("admin_delete_user_account", {
    p_target_user_id: profile.id,
  });
  if (error) {
    action.disabled = false;
    setMessage("#user-details-message", error.message || "Não foi possível eliminar o utilizador.", true);
    return;
  }
  selectedDetailUserId = null;
  selectedAccessUserId = null;
  document.querySelector("#user-details-dialog").close();
  await loadAdminData({ preserveView: true });
  setStatus("Utilizador eliminado", true);
}

function renderOverview() {
  const students = profiles.filter((profile) => profile.role === "student").length;
  const instructors = profiles.filter((profile) => profile.role === "instructor").length;
  const administrators = profiles.filter((profile) => profile.role === "admin").length;
  const active = profiles.filter((profile) => profile.account_status === "active").length;
  const published = modules.filter((module) => module.is_published).length;
  document.querySelector("#user-count").textContent = profiles.length;
  document.querySelector("#student-count").textContent = students;
  document.querySelector("#instructor-count").textContent = instructors;
  document.querySelector("#certificate-total").textContent = certificates.length;
  document.querySelector("#admin-simulation-count").textContent = simulationCount;
  document.querySelector("#admin-module-count").textContent = modules.length;
  document.querySelector("#active-user-summary").textContent = `${active} contas ativas`;
  document.querySelector("#published-module-summary").textContent = `${published} publicados`;

  const distribution = document.querySelector("#role-distribution");
  distribution.innerHTML = "";
  [
    ["Estudantes", students, "student"],
    ["Formadores", instructors, "instructor"],
    ["Administradores", administrators, "admin"],
  ].forEach(([label, count, className]) => {
    const row = document.createElement("div");
    row.className = "role-distribution-row";
    const heading = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = count;
    heading.append(name, value);
    const track = document.createElement("div");
    const fill = document.createElement("i");
    fill.className = className;
    fill.style.width = `${profiles.length ? Math.max(count / profiles.length * 100, count ? 4 : 0) : 0}%`;
    track.append(fill);
    row.append(heading, track);
    distribution.append(row);
  });

  renderSimulationFeed(document.querySelector("#overview-activity"), simulations.slice(0, 6));
}

function userSearchText(profile) {
  return normalize([
    profile.public_id, profile.full_name, profile.display_name, profile.email, profile.institution,
    profile.education_area, profile.job_title,
  ].join(" "));
}

async function changeRole(profile, select, save) {
  if (profile.id === session.user.id || select.value === profile.role) return;
  save.disabled = true;
  const { error } = await supabase.rpc("admin_set_user_role", {
    target_user_id: profile.id,
    new_role: select.value,
  });
  if (error) {
    save.disabled = false;
    window.alert(`Não foi possível alterar a função: ${error.message}`);
    return;
  }
  await loadAdminData({ preserveView: true });
}

async function changeAccountStatus(profile, action) {
  const newStatus = profile.account_status === "active" ? "suspended" : "active";
  const verb = newStatus === "suspended" ? "suspender" : "reativar";
  if (!window.confirm(`Confirma que pretende ${verb} a conta de ${profile.full_name || profile.email}?`)) return;
  action.disabled = true;
  const { error } = await supabase.rpc("admin_set_account_status", {
    target_user_id: profile.id,
    new_status: newStatus,
  });
  if (error) {
    action.disabled = false;
    window.alert(`Não foi possível alterar o estado: ${error.message}`);
    return;
  }
  await loadAdminData({ preserveView: true });
}

function createUserRow(profile) {
  const row = document.createElement("tr");
  const identityCell = document.createElement("td");
  const identity = document.createElement("div");
  identity.className = "table-user";
  const avatar = document.createElement("span");
  avatar.textContent = initials(profile.full_name || profile.display_name);
  const userCopy = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = profile.full_name || profile.display_name || "Utilizador";
  const email = document.createElement("small");
  email.textContent = profile.email || "E-mail não sincronizado";
  const publicId = document.createElement("code");
  publicId.className = "user-public-id-line";
  publicId.textContent = `ID público: ${profile.public_id || "não atribuído"}`;
  userCopy.append(name, email, publicId);
  identity.append(avatar, userCopy);
  identityCell.append(identity);

  const contextCell = document.createElement("td");
  const institution = document.createElement("strong");
  institution.textContent = profile.institution || "Não indicado";
  const area = document.createElement("small");
  area.textContent = profile.education_area || profile.job_title || "Perfil por completar";
  contextCell.append(institution, area);

  const roleCell = document.createElement("td");
  const roleSelect = document.createElement("select");
  roleSelect.className = "table-select";
  roleSelect.setAttribute("aria-label", `Função de ${name.textContent}`);
  Object.entries(roleLabels).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = profile.role === value;
    roleSelect.append(option);
  });
  roleSelect.disabled = profile.id === session.user.id;
  roleCell.append(roleSelect);

  const statusCell = document.createElement("td");
  const status = document.createElement("span");
  status.className = `account-status ${profile.account_status}`;
  status.textContent = statusLabels[profile.account_status] || profile.account_status;
  statusCell.append(status);

  const dateCell = document.createElement("td");
  dateCell.textContent = formatDate(profile.created_at);

  const actionsCell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "table-actions";
  const details = button("Detalhes", "button secondary compact", () => openUserDetails(profile));
  const save = button("Guardar", "button secondary compact", () => changeRole(profile, roleSelect, save));
  save.disabled = profile.id === session.user.id;
  const access = button("Acessos", "button secondary compact", () => {
    selectedAccessUserId = profile.id;
    setView("access");
    renderAccessUsers();
    renderAccessMatrix(profile);
  });
  const statusButton = button(
    profile.account_status === "active" ? "Suspender" : "Reativar",
    `button compact ${profile.account_status === "active" ? "danger" : "secondary"}`,
    () => changeAccountStatus(profile, statusButton),
  );
  statusButton.disabled = profile.id === session.user.id;
  actions.append(details, save, access, statusButton);
  actionsCell.append(actions);
  row.append(identityCell, contextCell, roleCell, statusCell, dateCell, actionsCell);
  return row;
}

function renderUsers() {
  const query = normalize(document.querySelector("#user-search").value);
  const role = document.querySelector("#user-role-filter").value;
  const status = document.querySelector("#user-status-filter").value;
  const filtered = profiles.filter((profile) => (
    (!query || userSearchText(profile).includes(query))
    && (!role || profile.role === role)
    && (!status || profile.account_status === status)
  ));
  document.querySelector("#user-results-count").textContent = `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`;
  const body = document.querySelector("#user-admin-table");
  body.replaceChildren(...(filtered.length
    ? filtered.map(createUserRow)
    : [emptyTableRow(6, "Nenhum utilizador corresponde aos filtros.")]));
}

function renderAccessUsers() {
  const query = normalize(document.querySelector("#access-user-search").value);
  const eligible = profiles.filter((profile) => profile.role !== "admin" && (
    !query || userSearchText(profile).includes(query)
  ));
  const list = document.querySelector("#access-user-list");
  list.innerHTML = "";
  if (!eligible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhum estudante ou formador encontrado.";
    list.append(empty);
    return;
  }
  eligible.forEach((profile) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `access-user-option ${selectedAccessUserId === profile.id ? "active" : ""}`;
    const avatar = document.createElement("span");
    avatar.textContent = initials(profile.full_name || profile.display_name);
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = profile.full_name || profile.display_name || "Utilizador";
    const meta = document.createElement("small");
    meta.textContent = `${roleLabels[profile.role]} · ${profile.email || "sem e-mail"}`;
    copy.append(name, meta);
    item.append(avatar, copy);
    item.addEventListener("click", () => {
      selectedAccessUserId = profile.id;
      renderAccessUsers();
      renderAccessMatrix(profile);
    });
    list.append(item);
  });
}

async function saveLabAccess(profile, module, checkbox, expiry, save) {
  save.disabled = true;
  setMessage("#access-message", "A guardar permissão…");
  const expiryValue = expiry.value ? new Date(`${expiry.value}T23:59:59`).toISOString() : null;
  const { error } = await supabase.rpc("admin_set_lab_access", {
    target_user_id: profile.id,
    target_module_id: module.id,
    access_kind: profile.role === "instructor" ? "trainer" : "student",
    allowed: checkbox.checked,
    access_expires_at: expiryValue,
  });
  save.disabled = false;
  if (error) {
    setMessage("#access-message", error.message, true);
    return;
  }
  setMessage("#access-message", `Permissão de ${module.title} atualizada.`);
  await loadAdminData({ preserveView: true });
  renderAccessMatrix(profileById(profile.id));
}

function renderAccessMatrix(profile) {
  if (!profile) return;
  document.querySelector("#access-selection-empty").classList.add("hidden");
  document.querySelector("#access-selection").classList.remove("hidden");
  document.querySelector("#access-selected-name").textContent = profile.full_name || profile.display_name || "Utilizador";
  document.querySelector("#access-selected-context").textContent =
    `${profile.email || "Sem e-mail"} · ${profile.institution || "Instituição não indicada"}`;
  document.querySelector("#access-selected-role").textContent = roleLabels[profile.role] || profile.role;
  const accessLevel = profile.role === "instructor" ? "trainer" : "student";
  const list = document.querySelector("#access-module-list");
  list.innerHTML = "";
  modules.forEach((module) => {
    const grant = accessGrants.find((item) => (
      item.user_id === profile.id && item.module_id === module.id && item.access_level === accessLevel
    ));
    const inherited = accessLevel === "student" ? module.default_student_access : false;
    const row = document.createElement("article");
    row.className = "access-module-row";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = module.title;
    const meta = document.createElement("span");
    meta.textContent = `${module.category} · ${module.is_published ? "Publicado" : "Rascunho"} · ${
      grant ? "Permissão individual" : accessLevel === "trainer" ? "Não atribuído" : `Padrão: ${inherited ? "permitido" : "bloqueado"}`
    }`;
    copy.append(title, meta);
    const controls = document.createElement("div");
    controls.className = "access-row-controls";
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "permission-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = grant ? grant.is_allowed : inherited;
    const toggleText = document.createElement("span");
    toggleText.textContent = "Acesso";
    toggleLabel.append(checkbox, toggleText);
    const expiry = document.createElement("input");
    expiry.type = "date";
    expiry.className = "access-expiry";
    expiry.setAttribute("aria-label", `Validade de ${module.title}`);
    if (grant?.expires_at) expiry.value = grant.expires_at.slice(0, 10);
    const save = button("Guardar", "button secondary compact", () => (
      saveLabAccess(profile, module, checkbox, expiry, save)
    ));
    controls.append(toggleLabel, expiry, save);
    row.append(copy, controls);
    list.append(row);
  });
}

function resetModuleForm() {
  const form = document.querySelector("#module-form");
  form.reset();
  document.querySelector("#module-id").value = "";
  document.querySelector("#module-duration").value = 45;
  document.querySelector("#module-sort-order").value = 100;
  document.querySelector("#module-passing-score").value = 70;
  document.querySelector("#module-category").value = "Engenharia de Reservatórios";
  document.querySelector("#module-default-access").checked = true;
  document.querySelector("#module-certificate").checked = true;
  document.querySelector("#module-form-title").textContent = "Novo laboratório";
  document.querySelector("#module-submit").textContent = "Guardar laboratório";
  document.querySelector("#module-cancel").classList.add("hidden");
  setMessage("#module-message", "");
}

function editModule(module) {
  document.querySelector("#module-id").value = module.id;
  document.querySelector("#module-title").value = module.title;
  document.querySelector("#module-slug").value = module.slug;
  document.querySelector("#module-description").value = module.description;
  document.querySelector("#module-category").value = module.category;
  document.querySelector("#module-duration").value = module.duration_minutes;
  document.querySelector("#module-difficulty").value = module.difficulty;
  document.querySelector("#module-sort-order").value = module.sort_order;
  document.querySelector("#module-passing-score").value = module.passing_score;
  document.querySelector("#module-published").checked = module.is_published;
  document.querySelector("#module-default-access").checked = module.default_student_access;
  document.querySelector("#module-certificate").checked = module.certificate_enabled;
  document.querySelector("#module-form-title").textContent = "Editar laboratório";
  document.querySelector("#module-submit").textContent = "Atualizar laboratório";
  document.querySelector("#module-cancel").classList.remove("hidden");
  document.querySelector("#module-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function togglePublication(module, action) {
  action.disabled = true;
  const { error } = await supabase.from("training_modules")
    .update({ is_published: !module.is_published }).eq("id", module.id);
  if (error) {
    action.disabled = false;
    window.alert(error.message);
    return;
  }
  await loadAdminData({ preserveView: true });
}

async function deleteModule(module, action) {
  if (!window.confirm(`Eliminar permanentemente “${module.title}”? Certificados associados impedem a eliminação.`)) return;
  action.disabled = true;
  const { error } = await supabase.from("training_modules").delete().eq("id", module.id);
  if (error) {
    action.disabled = false;
    window.alert(`Não foi possível eliminar: ${error.message}`);
    return;
  }
  resetModuleForm();
  await loadAdminData({ preserveView: true });
}

function renderModules() {
  const query = normalize(document.querySelector("#module-search").value);
  const publication = document.querySelector("#module-status-filter").value;
  const filtered = modules.filter((module) => (
    (!query || normalize(`${module.title} ${module.category} ${module.slug}`).includes(query))
    && (!publication || (publication === "published" ? module.is_published : !module.is_published))
  ));
  const list = document.querySelector("#module-admin-list");
  list.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhum laboratório corresponde aos filtros.";
    list.append(empty);
    return;
  }
  filtered.forEach((module) => {
    const item = document.createElement("article");
    item.className = "professional-module-item";
    const marker = document.createElement("span");
    marker.className = `module-publish-marker ${module.is_published ? "published" : ""}`;
    marker.textContent = module.is_published ? "Publicado" : "Rascunho";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = module.title;
    const meta = document.createElement("span");
    meta.textContent = `${module.category} · ${difficultyLabels[module.difficulty]} · ${module.duration_minutes} min`;
    const policy = document.createElement("small");
    policy.textContent = `${module.default_student_access ? "Acesso padrão ativo" : "Acesso por atribuição"} · ${
      module.certificate_enabled ? `Certificação ≥ ${module.passing_score}%` : "Sem certificação"
    }`;
    copy.append(title, meta, policy);
    const actions = document.createElement("div");
    actions.className = "table-actions";
    const publication = button(
      module.is_published ? "Retirar" : "Publicar",
      "button secondary compact",
      () => togglePublication(module, publication),
    );
    const edit = button("Editar", "button secondary compact", () => editModule(module));
    const remove = button("Eliminar", "button danger compact", () => deleteModule(module, remove));
    actions.append(publication, edit, remove);
    item.append(marker, copy, actions);
    list.append(item);
  });
}

function modulePayload() {
  return {
    title: document.querySelector("#module-title").value.trim(),
    slug: document.querySelector("#module-slug").value.trim().toLowerCase(),
    description: document.querySelector("#module-description").value.trim(),
    category: document.querySelector("#module-category").value.trim(),
    duration_minutes: Number(document.querySelector("#module-duration").value),
    difficulty: document.querySelector("#module-difficulty").value,
    sort_order: Number(document.querySelector("#module-sort-order").value),
    passing_score: Number(document.querySelector("#module-passing-score").value),
    is_published: document.querySelector("#module-published").checked,
    default_student_access: document.querySelector("#module-default-access").checked,
    certificate_enabled: document.querySelector("#module-certificate").checked,
  };
}

async function saveModule(event) {
  event.preventDefault();
  const submit = document.querySelector("#module-submit");
  submit.disabled = true;
  setMessage("#module-message", "A guardar laboratório…");
  const id = document.querySelector("#module-id").value;
  const query = id
    ? supabase.from("training_modules").update(modulePayload()).eq("id", id)
    : supabase.from("training_modules").insert(modulePayload());
  const { error } = await query;
  submit.disabled = false;
  if (error) {
    setMessage("#module-message", error.code === "23505" ? "O identificador já está em uso." : error.message, true);
    return;
  }
  resetModuleForm();
  setMessage("#module-message", id ? "Laboratório atualizado." : "Laboratório criado.");
  await loadAdminData({ preserveView: true });
}

function certificateSearchText(certificate) {
  const profile = profileById(certificate.user_id);
  const module = certificate.training_modules || moduleById(certificate.module_id);
  return normalize(`${certificate.certificate_code} ${profile?.full_name} ${profile?.email} ${module?.title}`);
}

function renderCertificates() {
  const query = normalize(document.querySelector("#certificate-search").value);
  const moduleId = document.querySelector("#certificate-module-filter").value;
  const filtered = certificates.filter((certificate) => (
    (!query || certificateSearchText(certificate).includes(query))
    && (!moduleId || certificate.module_id === moduleId)
  ));
  document.querySelector("#certificate-results-count").textContent =
    `${filtered.length} certificado${filtered.length === 1 ? "" : "s"}`;
  const body = document.querySelector("#certificate-admin-table");
  const rows = filtered.map((certificate) => {
    const row = document.createElement("tr");
    const profile = profileById(certificate.user_id);
    const module = certificate.training_modules || moduleById(certificate.module_id);
    [certificate.certificate_code, profile?.full_name || profile?.display_name || "Utilizador",
      module?.title || "Laboratório", `${certificate.final_score}%`, formatDate(certificate.issued_at)]
      .forEach((value, index) => {
        const cell = document.createElement("td");
        if (index === 0) {
          const code = document.createElement("code");
          code.textContent = value;
          cell.append(code);
        } else cell.textContent = value;
        row.append(cell);
      });
    const actionCell = document.createElement("td");
    const link = document.createElement("a");
    link.className = "button secondary compact";
    link.href = `/certificate?id=${encodeURIComponent(certificate.id)}`;
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "workspace_premium";
    link.append(icon, document.createTextNode("Visualizar"));
    actionCell.append(link);
    row.append(actionCell);
    return row;
  });
  body.replaceChildren(...(rows.length ? rows : [emptyTableRow(6, "Nenhum certificado corresponde aos filtros.")]));
}

function printRequestSearchText(request) {
  const profile = profileById(request.user_id);
  const certificate = certificates.find((item) => item.id === request.certificate_id);
  const module = moduleById(request.module_id);
  return normalize(`${profile?.full_name} ${profile?.email} ${profile?.public_id} ${
    certificate?.certificate_code
  } ${module?.title}`);
}

async function openPaymentProof(request) {
  if (!request.proof_path) return;
  const { data, error } = await supabase.storage
    .from("certificate-payment-proofs")
    .createSignedUrl(request.proof_path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function reviewPrintRequest(request, status) {
  const approved = status === "approved";
  if (!window.confirm(
    approved
      ? "Liberar a impressão deste certificado?"
      : "Rejeitar este comprovativo e permitir um novo envio?"
  )) return;
  const note = approved ? "" : window.prompt("Motivo da rejeição:", "") ?? "";
  if (!approved && !note.trim()) return;
  const { error } = await supabase.rpc("admin_review_certificate_print_request", {
    p_request_id: request.id,
    p_status: status,
    p_admin_note: note.trim() || null,
  });
  if (error) throw error;
  await loadAdminData({ preserveView: true });
}

function renderPrintRequests() {
  const query = normalize(document.querySelector("#print-request-search").value);
  const status = document.querySelector("#print-request-status-filter").value;
  const filtered = printRequests.filter((request) => (
    (!query || printRequestSearchText(request).includes(query))
    && (!status || request.status === status)
  ));
  document.querySelector("#print-request-results-count").textContent =
    `${filtered.length} ${filtered.length === 1 ? "solicitação" : "solicitações"}`;
  const body = document.querySelector("#print-request-admin-table");
  const rows = filtered.map((request) => {
    const row = document.createElement("tr");
    const profile = profileById(request.user_id);
    const certificate = certificates.find((item) => item.id === request.certificate_id);
    const module = moduleById(request.module_id);
    const values = [
      profile?.full_name || profile?.display_name || "Utilizador",
      `${certificate?.certificate_code || "—"} · ${module?.title || "Laboratório"}`,
      `${Number(request.amount).toLocaleString("pt-PT")} ${request.currency}`,
    ];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    const statusCell = document.createElement("td");
    const marker = document.createElement("span");
    marker.className = `status-pill ${request.status === "approved" ? "success" : request.status === "rejected" ? "blocked" : ""}`;
    marker.textContent = printRequestStatusLabels[request.status] || request.status;
    statusCell.append(marker);
    row.append(statusCell);

    const proofCell = document.createElement("td");
    if (request.proof_path) {
      const proofButton = document.createElement("button");
      proofButton.className = "button secondary compact";
      proofButton.type = "button";
      proofButton.textContent = "Abrir";
      proofButton.addEventListener("click", () => openPaymentProof(request).catch(handleError));
      proofCell.append(proofButton);
    } else proofCell.textContent = "Não enviado";
    row.append(proofCell);

    const actionCell = document.createElement("td");
    actionCell.className = "table-actions";
    if (request.status === "pending") {
      const approve = document.createElement("button");
      approve.className = "button secondary compact";
      approve.type = "button";
      approve.textContent = "Liberar";
      approve.addEventListener("click", () => reviewPrintRequest(request, "approved").catch(handleError));
      const reject = document.createElement("button");
      reject.className = "button danger compact";
      reject.type = "button";
      reject.textContent = "Rejeitar";
      reject.addEventListener("click", () => reviewPrintRequest(request, "rejected").catch(handleError));
      actionCell.append(approve, reject);
    } else actionCell.textContent = request.admin_note || "—";
    row.append(actionCell);
    return row;
  });
  body.replaceChildren(...(rows.length ? rows : [emptyTableRow(6, "Nenhuma solicitação corresponde aos filtros.")]));
}

function renderSimulationFeed(container, items) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Ainda não existe atividade registada.";
    container.append(empty);
    return;
  }
  items.forEach((simulation) => {
    const item = document.createElement("article");
    item.className = "feed-item";
    const marker = document.createElement("span");
    marker.className = "feed-marker simulation material-symbols-outlined";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = "science";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = moduleLabels[simulation.module] || simulation.module;
    const profile = profileById(simulation.user_id);
    const meta = document.createElement("span");
    meta.textContent = `${profile?.full_name || profile?.display_name || "Utilizador"} · ${formatDate(simulation.created_at)}`;
    copy.append(title, meta);
    item.append(marker, copy);
    container.append(item);
  });
}

function renderActivity() {
  renderSimulationFeed(document.querySelector("#activity-list"), simulations);
  const container = document.querySelector("#audit-log-list");
  container.innerHTML = "";
  if (!auditLogs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Ainda não existem alterações administrativas registadas.";
    container.append(empty);
    return;
  }
  auditLogs.forEach((log) => {
    const item = document.createElement("article");
    item.className = "feed-item";
    const marker = document.createElement("span");
    marker.className = "feed-marker audit material-symbols-outlined";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = "history";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = auditLabels[log.action] || log.action;
    const actor = profileById(log.actor_id);
    const target = profileById(log.target_user_id);
    const module = moduleById(log.module_id);
    const meta = document.createElement("span");
    meta.textContent = `${actor?.full_name || actor?.email || "Administrador"} · ${
      target?.full_name
      || module?.title
      || log.metadata?.full_name
      || log.metadata?.public_id
      || "Plataforma"
    } · ${formatDate(log.created_at)}`;
    copy.append(title, meta);
    item.append(marker, copy);
    container.append(item);
  });
}

function populateCertificateModuleFilter() {
  const select = document.querySelector("#certificate-module-filter");
  const current = select.value;
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Todos";
  select.append(all);
  modules.forEach((module) => {
    const option = document.createElement("option");
    option.value = module.id;
    option.textContent = module.title;
    select.append(option);
  });
  select.value = current;
}

function certificateAssetUrl(path) {
  if (!path) return "";
  if (path.startsWith("/") || /^https?:\/\//i.test(path)) return path;
  return supabase.storage.from("certificate-assets").getPublicUrl(path).data.publicUrl;
}

function defaultCertificateTemplate(moduleId) {
  return {
    module_id: moduleId,
    layout_style: "qualification",
    print_access_mode: "free",
    print_fee: 0,
    print_currency: "MZN",
    payment_account_name: "",
    payment_account_number: "",
    payment_instructions: "",
    issuer_name: "LMTWEBNAIRS",
    certificate_title: "Certificado de Qualificação",
    qualification_label: "Qualificação profissional",
    location_text: "Cidade de Maputo, Moçambique",
    verification_base_url: `${window.location.origin}/certificate`,
    director_name: "Direção Académica",
    director_title: "Diretor Académico",
    coordinator_name: "Coordenação do Programa",
    coordinator_title: "Coordenador do Programa",
    product_credit_text: "PetroSimLab, produto da LMTWEB, desenvolvido pela LEMOTE.",
    program_topics: ["Conteúdo técnico aplicado", "Simulação e interpretação de resultados"],
    ...defaultCertificateAssets,
  };
}

function selectedCertificateTemplate() {
  const moduleId = document.querySelector("#template-module").value;
  return certificateTemplates.find((template) => template.module_id === moduleId)
    || defaultCertificateTemplate(moduleId);
}

function setCertificateAssetPreview(field, path) {
  const url = certificateAssetUrl(path);
  [field.preview, field.livePreview].forEach((selector) => {
    const image = document.querySelector(selector);
    if (url) image.src = url;
    else image.removeAttribute("src");
    image.classList.toggle("empty", !url);
  });
}

function updateCertificateTemplatePreview() {
  const layoutStyle = document.querySelector("#template-layout-style").value;
  const preview = document.querySelector(".template-preview-frame");
  preview.dataset.layoutStyle = layoutStyle;
  document.querySelector("#template-preview-title").textContent =
    layoutStyle === "classic"
      ? "Certificado de conclusão"
      : document.querySelector("#template-title").value || "Certificado de Qualificação";
  const module = moduleById(document.querySelector("#template-module").value);
  document.querySelector("#template-preview-module").textContent =
    module?.title || "Laboratório PetroSimLab";
  document.querySelector("#template-preview-product-credit").textContent =
    document.querySelector("#template-product-credit").value
    || "PetroSimLab, produto da LMTWEB, desenvolvido pela LEMOTE.";
}

function updatePrintPolicyFields() {
  const paid = document.querySelector("#template-print-access").value === "paid";
  [
    "#template-print-fee",
    "#template-payment-account-name",
    "#template-payment-account-number",
  ].forEach((selector) => {
    document.querySelector(selector).required = paid;
  });
  document.querySelector(".certificate-payment-policy").classList.toggle("is-paid", paid);
}

function fillCertificateTemplateForm(moduleId) {
  const template = certificateTemplates.find((item) => item.module_id === moduleId)
    || defaultCertificateTemplate(moduleId);
  document.querySelector("#template-layout-style").value =
    template.layout_style === "classic" ? "classic" : "qualification";
  document.querySelector("#template-print-access").value =
    template.print_access_mode === "paid" ? "paid" : "free";
  document.querySelector("#template-print-fee").value = template.print_fee ?? 0;
  document.querySelector("#template-print-currency").value = template.print_currency || "MZN";
  document.querySelector("#template-payment-account-name").value =
    template.payment_account_name || "";
  document.querySelector("#template-payment-account-number").value =
    template.payment_account_number || "";
  document.querySelector("#template-payment-instructions").value =
    template.payment_instructions || "";
  document.querySelector("#template-issuer").value = template.issuer_name || "";
  document.querySelector("#template-title").value = template.certificate_title || "";
  document.querySelector("#template-qualification").value = template.qualification_label || "";
  document.querySelector("#template-location").value = template.location_text || "";
  document.querySelector("#template-verification-url").value = template.verification_base_url || "";
  document.querySelector("#template-director-name").value = template.director_name || "";
  document.querySelector("#template-director-title").value = template.director_title || "";
  document.querySelector("#template-coordinator-name").value = template.coordinator_name || "";
  document.querySelector("#template-coordinator-title").value = template.coordinator_title || "";
  document.querySelector("#template-product-credit").value =
    template.product_credit_text || "PetroSimLab, produto da LMTWEB, desenvolvido pela LEMOTE.";
  document.querySelector("#template-topics").value = (template.program_topics || []).join("\n");
  certificateAssetFields.forEach((field) => {
    document.querySelector(field.input).value = "";
    setCertificateAssetPreview(field, template[field.column] || defaultCertificateAssets[field.column]);
  });
  updateCertificateTemplatePreview();
  updatePrintPolicyFields();
  setMessage("#template-message", template.id
    ? "Configuração carregada."
    : "Este laboratório utilizará a identidade institucional padrão.");
}

function populateCertificateTemplateModules() {
  const select = document.querySelector("#template-module");
  const current = select.value;
  select.replaceChildren();
  modules.forEach((module) => {
    const option = document.createElement("option");
    option.value = module.id;
    option.textContent = module.title;
    select.append(option);
  });
  select.value = modules.some((module) => module.id === current)
    ? current
    : modules[0]?.id || "";
  if (select.value) fillCertificateTemplateForm(select.value);
}

async function uploadCertificateAsset(file, module, column) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error(`Formato inválido em ${file.name}. Utilize PNG, JPEG ou WebP.`);
  }
  if (file.size > 3 * 1024 * 1024) {
    throw new Error(`${file.name} ultrapassa o limite de 3 MB.`);
  }
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${module.slug}/${column}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("certificate-assets").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

async function saveCertificateTemplate(event) {
  event.preventDefault();
  const submit = document.querySelector("#template-submit");
  const moduleId = document.querySelector("#template-module").value;
  const module = moduleById(moduleId);
  if (!module) {
    setMessage("#template-message", "Selecione um laboratório.", true);
    return;
  }
  const existing = certificateTemplates.find((template) => template.module_id === moduleId);
  const paidPrinting = document.querySelector("#template-print-access").value === "paid";
  const printFee = Number(document.querySelector("#template-print-fee").value || 0);
  const accountName = document.querySelector("#template-payment-account-name").value.trim();
  const accountNumber = document.querySelector("#template-payment-account-number").value.trim();
  if (paidPrinting && (printFee <= 0 || !accountName || !accountNumber)) {
    setMessage(
      "#template-message",
      "Para exigir pagamento, indique um valor, o titular e o número da conta.",
      true,
    );
    return;
  }
  const payload = {
    module_id: moduleId,
    layout_style: document.querySelector("#template-layout-style").value,
    print_access_mode: paidPrinting ? "paid" : "free",
    print_fee: paidPrinting ? printFee : 0,
    print_currency: document.querySelector("#template-print-currency").value,
    payment_account_name: accountName || null,
    payment_account_number: accountNumber || null,
    payment_instructions:
      document.querySelector("#template-payment-instructions").value.trim() || null,
    issuer_name: document.querySelector("#template-issuer").value.trim(),
    certificate_title: document.querySelector("#template-title").value.trim(),
    qualification_label: document.querySelector("#template-qualification").value.trim(),
    location_text: document.querySelector("#template-location").value.trim(),
    verification_base_url: document.querySelector("#template-verification-url").value.trim(),
    director_name: document.querySelector("#template-director-name").value.trim(),
    director_title: document.querySelector("#template-director-title").value.trim(),
    coordinator_name: document.querySelector("#template-coordinator-name").value.trim(),
    coordinator_title: document.querySelector("#template-coordinator-title").value.trim(),
    product_credit_text: document.querySelector("#template-product-credit").value.trim(),
    program_topics: document.querySelector("#template-topics").value.split(/\r?\n/)
      .map((topic) => topic.trim()).filter(Boolean),
    updated_by: session.user.id,
  };
  certificateAssetFields.forEach((field) => {
    payload[field.column] = existing?.[field.column] || defaultCertificateAssets[field.column];
  });

  submit.disabled = true;
  setMessage("#template-message", "A enviar elementos e guardar a configuração…");
  try {
    for (const field of certificateAssetFields) {
      const file = document.querySelector(field.input).files[0];
      if (file) payload[field.column] = await uploadCertificateAsset(file, module, field.column);
    }
    const query = existing
      ? supabase.from("certificate_templates").update(payload).eq("id", existing.id)
      : supabase.from("certificate_templates").insert(payload);
    const { error } = await query;
    if (error) throw error;
    await loadAdminData({ preserveView: true });
    document.querySelector("#template-module").value = moduleId;
    fillCertificateTemplateForm(moduleId);
    setMessage("#template-message", "Identidade do certificado guardada com sucesso.");
  } catch (error) {
    setMessage("#template-message", error.message || "Não foi possível guardar o modelo.", true);
  } finally {
    submit.disabled = false;
  }
}

function renderAll() {
  renderOverview();
  renderUsers();
  renderAccessUsers();
  if (selectedAccessUserId) renderAccessMatrix(profileById(selectedAccessUserId));
  renderModules();
  populateCertificateModuleFilter();
  renderCertificates();
  renderPrintRequests();
  populateCertificateTemplateModules();
  renderActivity();
}

async function loadAdminData({ preserveView = false } = {}) {
  setStatus("A atualizar…");
  const [
    profilesResult, simulationsResult, modulesResult, certificatesResult,
    grantsResult, auditResult, templatesResult, printRequestsResult,
  ] =
    await Promise.all([
      supabase.from("profiles")
        .select("id,public_id,email,display_name,full_name,phone,country,city,professional_status,education_area,institution,job_title,bio,avatar_path,role,account_status,created_at,updated_at")
        .order("created_at", { ascending: false }),
      supabase.from("simulations").select("id,user_id,module,module_slug,created_at", { count: "exact" })
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("training_modules").select("*").order("sort_order").order("created_at"),
      supabase.from("certificates")
        .select("id,user_id,module_id,certificate_code,final_score,issued_at,training_modules(title,slug)")
        .order("issued_at", { ascending: false }),
      supabase.from("lab_access_grants").select("*"),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("certificate_templates").select("*").order("created_at"),
      supabase.from("certificate_print_requests").select("*").order("created_at", { ascending: false }),
    ]);
  const error = [
    profilesResult, simulationsResult, modulesResult, certificatesResult,
    grantsResult, auditResult, templatesResult, printRequestsResult,
  ].find((result) => result.error)?.error;
  if (error) {
    throw new Error(`${error.message}. Confirme que executou a versão atualizada de database/schema.sql no Supabase.`);
  }
  profiles = profilesResult.data || [];
  simulations = simulationsResult.data || [];
  simulationCount = simulationsResult.count ?? simulations.length;
  modules = modulesResult.data || [];
  certificates = certificatesResult.data || [];
  accessGrants = grantsResult.data || [];
  auditLogs = auditResult.data || [];
  certificateTemplates = templatesResult.data || [];
  printRequests = printRequestsResult.data || [];
  const refreshedAdmin = profileById(session.user.id);
  if (refreshedAdmin) {
    currentProfile = refreshedAdmin;
    document.querySelector("#admin-name").textContent =
      refreshedAdmin.full_name || refreshedAdmin.display_name || "Administrador";
    document.querySelector("#admin-email").textContent =
      refreshedAdmin.email || session.user.email;
    document.querySelector("#admin-public-id").textContent =
      `ID público: ${refreshedAdmin.public_id || "não atribuído"}`;
    document.querySelector("#admin-initials").textContent =
      initials(refreshedAdmin.full_name || refreshedAdmin.display_name);
  }
  renderAll();
  setStatus("Acesso autorizado", true);
  if (!preserveView) setView("overview");
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function bindEvents() {
  document.querySelectorAll("[data-admin-view]").forEach((item) => {
    item.addEventListener("click", () => setView(item.dataset.adminView));
  });
  document.querySelectorAll("[data-open-view]").forEach((item) => {
    item.addEventListener("click", () => setView(item.dataset.openView));
  });
  ["#user-search", "#user-role-filter", "#user-status-filter"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", renderUsers);
  });
  document.querySelector("#access-user-search").addEventListener("input", renderAccessUsers);
  ["#module-search", "#module-status-filter"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", renderModules);
  });
  ["#certificate-search", "#certificate-module-filter"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", renderCertificates);
  });
  ["#print-request-search", "#print-request-status-filter"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", renderPrintRequests);
  });
  document.querySelector("#global-admin-search").addEventListener("input", (event) => {
    document.querySelector("#user-search").value = event.target.value;
    setView("users");
    renderUsers();
  });
  document.querySelector("#module-form").addEventListener("submit", saveModule);
  document.querySelector("#user-details-form").addEventListener("submit", saveUserDetails);
  ["#user-details-close", "#user-details-cancel"].forEach((selector) => {
    document.querySelector(selector).addEventListener("click", () => {
      document.querySelector("#user-details-dialog").close();
    });
  });
  document.querySelector("#user-details-delete").addEventListener("click", () => {
    deleteUserAccount().catch(handleError);
  });
  document.querySelector("#user-details-manage-access").addEventListener("click", () => {
    const profile = profileById(selectedDetailUserId);
    if (!profile || profile.role === "admin") return;
    selectedAccessUserId = profile.id;
    document.querySelector("#user-details-dialog").close();
    setView("access");
    renderAccessUsers();
    renderAccessMatrix(profile);
  });
  document.querySelector("#certificate-template-form").addEventListener("submit", saveCertificateTemplate);
  document.querySelector("#template-module").addEventListener("change", (event) => {
    fillCertificateTemplateForm(event.target.value);
  });
  document.querySelector("#template-layout-style").addEventListener(
    "change",
    updateCertificateTemplatePreview,
  );
  document.querySelector("#template-print-access").addEventListener(
    "change",
    updatePrintPolicyFields,
  );
  ["#template-title", "#template-issuer", "#template-product-credit"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", updateCertificateTemplatePreview);
  });
  certificateAssetFields.forEach((field) => {
    document.querySelector(field.input).addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) {
        setCertificateAssetPreview(field, selectedCertificateTemplate()[field.column]);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      [field.preview, field.livePreview].forEach((selector) => {
        document.querySelector(selector).src = objectUrl;
      });
    });
  });
  document.querySelector("#module-cancel").addEventListener("click", resetModuleForm);
  document.querySelector("#new-module-button").addEventListener("click", () => {
    resetModuleForm();
    document.querySelector("#module-title").focus();
  });
  document.querySelector("#module-title").addEventListener("input", (event) => {
    const slug = document.querySelector("#module-slug");
    if (!document.querySelector("#module-id").value && !slug.dataset.manual) {
      slug.value = slugify(event.target.value);
    }
  });
  document.querySelector("#module-slug").addEventListener("input", (event) => {
    event.target.dataset.manual = event.target.value ? "true" : "";
  });
  document.querySelector("#refresh-admin").addEventListener("click", () => {
    loadAdminData({ preserveView: true }).catch(handleError);
  });
  document.querySelector("#sign-out").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.replace("/admin/login");
  });
}

async function init() {
  try {
    const auth = await requireSession("/admin/login");
    supabase = auth.supabase;
    session = auth.session;
    const [profile, adminCheck] = await Promise.all([
      getCurrentProfile(supabase, session.user.id),
      supabase.rpc("is_admin"),
    ]);
    if (adminCheck.error || adminCheck.data !== true || profile.role !== "admin" || profile.account_status !== "active") {
      await supabase.auth.signOut();
      window.location.replace("/admin/login");
      return;
    }
    currentProfile = profile;
    document.querySelector("#admin-name").textContent = profile.full_name || profile.display_name || "Administrador";
    document.querySelector("#admin-email").textContent = profile.email || session.user.email;
    document.querySelector("#admin-public-id").textContent =
      `ID público: ${profile.public_id || "não atribuído"}`;
    document.querySelector("#admin-initials").textContent = initials(profile.full_name || profile.display_name);
    document.querySelector("#overview-date").textContent = new Intl.DateTimeFormat("pt-PT", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    }).format(new Date());
    bindEvents();
    await loadAdminData();
    document.body.classList.add("auth-ready");
  } catch (error) {
    handleError(error);
  }
}

function handleError(error) {
  document.body.dataset.authError = error.message || "Não foi possível carregar a administração.";
  document.body.classList.add("auth-error");
  setStatus("Administração indisponível");
}

init();
