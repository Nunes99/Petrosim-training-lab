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
let selectedAccessUserId = null;

const roleLabels = { student: "Estudante", instructor: "Formador", admin: "Administrador" };
const statusLabels = { active: "Ativo", suspended: "Suspenso" };
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
  "lab.access_changed": "Permissão de laboratório alterada",
};
const buttonIcons = {
  Guardar: "save",
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
    profile.full_name, profile.display_name, profile.email, profile.institution,
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
  userCopy.append(name, email);
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
  actions.append(save, access, statusButton);
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
      target?.full_name || module?.title || "Plataforma"
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

function renderAll() {
  renderOverview();
  renderUsers();
  renderAccessUsers();
  if (selectedAccessUserId) renderAccessMatrix(profileById(selectedAccessUserId));
  renderModules();
  populateCertificateModuleFilter();
  renderCertificates();
  renderActivity();
}

async function loadAdminData({ preserveView = false } = {}) {
  setStatus("A atualizar…");
  const [profilesResult, simulationsResult, modulesResult, certificatesResult, grantsResult, auditResult] =
    await Promise.all([
      supabase.from("profiles")
        .select("id,email,display_name,full_name,phone,country,city,professional_status,education_area,institution,job_title,role,account_status,created_at,updated_at")
        .order("created_at", { ascending: false }),
      supabase.from("simulations").select("id,user_id,module,module_slug,created_at", { count: "exact" })
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("training_modules").select("*").order("sort_order").order("created_at"),
      supabase.from("certificates")
        .select("id,user_id,module_id,certificate_code,final_score,issued_at,training_modules(title,slug)")
        .order("issued_at", { ascending: false }),
      supabase.from("lab_access_grants").select("*"),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
  const error = [
    profilesResult, simulationsResult, modulesResult, certificatesResult, grantsResult, auditResult,
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
  document.querySelector("#global-admin-search").addEventListener("input", (event) => {
    document.querySelector("#user-search").value = event.target.value;
    setView("users");
    renderUsers();
  });
  document.querySelector("#module-form").addEventListener("submit", saveModule);
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
