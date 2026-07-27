import { formatDate, requireSession } from "./supabase-client.js";

let supabase;
let currentUserId;
let modulesById = new Map();
let profilesById = new Map();

const moduleLabels = {
  "Reservoir Reserves Lab": "Laboratório de Reservas",
  "Petroleum Economics Lab": "Laboratório de Economia do Petróleo",
  "HSE Decision Trainer": "Simulador de Decisões de Segurança",
};
const difficultyLabels = {
  foundation: "Fundamental",
  intermediate: "Intermédio",
  advanced: "Avançado",
};
const roleLabels = {
  student: "Estudante",
  instructor: "Formador",
  admin: "Administrador",
};

function setMessage(text, error = false) {
  const element = document.querySelector("#module-message");
  element.textContent = text;
  element.classList.toggle("error", error);
}

function setStatus(text, success = false) {
  const status = document.querySelector("#admin-status");
  status.textContent = text;
  status.classList.toggle("success", success);
}

function emptyState(message) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

function actionButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function resetModuleForm() {
  const form = document.querySelector("#module-form");
  form.reset();
  document.querySelector("#module-id").value = "";
  document.querySelector("#module-duration").value = 45;
  document.querySelector("#module-sort-order").value = 100;
  document.querySelector("#module-category").value = "Engenharia de Reservatórios";
  document.querySelector("#module-form-title").textContent = "Novo Laboratório";
  document.querySelector("#module-submit").textContent = "Guardar Laboratório";
  document.querySelector("#module-cancel").classList.add("hidden");
  setMessage("");
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
  document.querySelector("#module-published").checked = module.is_published;
  document.querySelector("#module-form-title").textContent = "Editar Laboratório";
  document.querySelector("#module-submit").textContent = "Atualizar Laboratório";
  document.querySelector("#module-cancel").classList.remove("hidden");
  document.querySelector("#module-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function togglePublication(module, button) {
  button.disabled = true;
  const { error } = await supabase
    .from("training_modules")
    .update({
      is_published: !module.is_published,
      updated_at: new Date().toISOString(),
    })
    .eq("id", module.id);
  if (error) {
    setMessage(`Não foi possível alterar a publicação: ${error.message}`, true);
    button.disabled = false;
    return;
  }
  setMessage(module.is_published ? "Laboratório retirado da publicação." : "Laboratório publicado.");
  await loadAdminData();
}

async function deleteModule(module, button) {
  const confirmed = window.confirm(`Eliminar permanentemente “${module.title}”?`);
  if (!confirmed) return;
  button.disabled = true;
  const { error } = await supabase.from("training_modules").delete().eq("id", module.id);
  if (error) {
    setMessage(`Não foi possível eliminar: ${error.message}`, true);
    button.disabled = false;
    return;
  }
  if (document.querySelector("#module-id").value === module.id) resetModuleForm();
  setMessage("Laboratório eliminado.");
  await loadAdminData();
}

function createAdminModule(module) {
  const item = document.createElement("article");
  item.className = "admin-list-item admin-module-item";

  const info = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = module.title;
  const detail = document.createElement("span");
  detail.textContent = `${module.category} · ${difficultyLabels[module.difficulty] || module.difficulty} · ${module.duration_minutes} min · ordem ${module.sort_order}`;
  const slug = document.createElement("small");
  slug.textContent = module.slug;
  info.append(title, detail, slug);

  const actions = document.createElement("div");
  actions.className = "admin-actions";
  const publication = actionButton(
    module.is_published ? "Publicado" : "Rascunho",
    `status-pill admin-action ${module.is_published ? "success" : ""}`,
    (event) => togglePublication(module, event.currentTarget),
  );
  const edit = actionButton("Editar", "button secondary compact", () => editModule(module));
  const remove = actionButton(
    "Eliminar",
    "button danger compact",
    (event) => deleteModule(module, event.currentTarget),
  );
  actions.append(publication, edit, remove);
  item.append(info, actions);
  return item;
}

async function changeRole(profile, select, button) {
  if (profile.id === currentUserId || select.value === profile.role) return;
  button.disabled = true;
  const { error } = await supabase.rpc("admin_set_user_role", {
    target_user_id: profile.id,
    new_role: select.value,
  });
  if (error) {
    button.disabled = false;
    setMessage(`Não foi possível alterar a função: ${error.message}`, true);
    return;
  }
  setMessage(`Função de ${profile.display_name || "utilizador"} atualizada.`);
  await loadAdminData();
}

function createAdminUser(profile) {
  const item = document.createElement("article");
  item.className = "admin-list-item admin-user-item";

  const info = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = profile.display_name || `Utilizador ${profile.id.slice(0, 8)}`;
  const detail = document.createElement("span");
  detail.textContent = `${roleLabels[profile.role] || profile.role} · registado em ${formatDate(profile.created_at)}`;
  const id = document.createElement("small");
  id.textContent = profile.id;
  info.append(title, detail, id);

  const controls = document.createElement("div");
  controls.className = "admin-user-controls";
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Função de ${title.textContent}`);
  Object.entries(roleLabels).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = profile.role === value;
    select.append(option);
  });
  const ownAccount = profile.id === currentUserId;
  select.disabled = ownAccount;
  const save = actionButton(
    ownAccount ? "Conta Atual" : "Guardar Função",
    "button secondary compact",
    (event) => changeRole(profile, select, event.currentTarget),
  );
  save.disabled = ownAccount;
  controls.append(select, save);
  item.append(info, controls);
  return item;
}

function createActivity(simulation) {
  const item = document.createElement("article");
  item.className = "history-item";
  const info = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = moduleLabels[simulation.module] || simulation.module;
  const detail = document.createElement("span");
  detail.textContent = formatDate(simulation.created_at);
  info.append(title, detail);
  const user = document.createElement("span");
  user.className = "status-pill";
  const profile = profilesById.get(simulation.user_id);
  user.textContent = profile?.display_name || `Utilizador ${simulation.user_id.slice(0, 8)}`;
  item.append(info, user);
  return item;
}

function renderAdminData(profiles, simulations, modules) {
  profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  modulesById = new Map(modules.map((module) => [module.id, module]));

  document.querySelector("#user-count").textContent = profiles.length;
  document.querySelector("#admin-simulation-count").textContent = simulations.count ?? simulations.data.length;
  document.querySelector("#admin-module-count").textContent = modules.length;
  document.querySelector("#published-module-count").textContent = modules.filter((module) => module.is_published).length;
  document.querySelector("#module-list-status").textContent = `${modules.length} configurados`;

  const moduleList = document.querySelector("#module-admin-list");
  moduleList.replaceChildren(...(modules.length
    ? modules.map(createAdminModule)
    : [emptyState("Ainda não existem laboratórios configurados.")]));

  const userList = document.querySelector("#user-admin-list");
  userList.replaceChildren(...(profiles.length
    ? profiles.map(createAdminUser)
    : [emptyState("Ainda não existem utilizadores registados.")]));

  const activityList = document.querySelector("#activity-list");
  activityList.replaceChildren(...(simulations.data.length
    ? simulations.data.map(createActivity)
    : [emptyState("Ainda não existe atividade registada.")]));
}

async function loadAdminData() {
  setStatus("A atualizar...");
  const [profilesResult, simulationsResult, modulesResult] = await Promise.all([
    supabase.from("profiles").select("id, display_name, role, created_at").order("created_at", { ascending: false }),
    supabase.from("simulations").select("id, user_id, module, created_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(20),
    supabase.from("training_modules").select("*").order("sort_order").order("created_at"),
  ]);

  const error = profilesResult.error || simulationsResult.error || modulesResult.error;
  if (error) throw error;
  renderAdminData(profilesResult.data || [], simulationsResult, modulesResult.data || []);
  setStatus("Acesso autorizado", true);
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
    is_published: document.querySelector("#module-published").checked,
    updated_at: new Date().toISOString(),
  };
}

async function saveModule(event) {
  event.preventDefault();
  const submit = document.querySelector("#module-submit");
  submit.disabled = true;
  setMessage("A guardar...");
  const id = document.querySelector("#module-id").value;
  const query = id
    ? supabase.from("training_modules").update(modulePayload()).eq("id", id)
    : supabase.from("training_modules").insert(modulePayload());
  const { error } = await query;
  submit.disabled = false;
  if (error) {
    const duplicate = error.code === "23505" ? "O identificador já está em uso." : error.message;
    setMessage(duplicate, true);
    return;
  }
  const successMessage = id ? "Laboratório atualizado com sucesso." : "Laboratório criado com sucesso.";
  resetModuleForm();
  setMessage(successMessage);
  await loadAdminData();
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function init() {
  try {
    const auth = await requireSession();
    supabase = auth.supabase;
    currentUserId = auth.session.user.id;

    const { data: profile, error } = await supabase
      .from("profiles").select("role").eq("id", currentUserId).single();
    if (error) throw new Error(`Não foi possível validar o perfil administrativo: ${error.message}`);
    if (profile?.role !== "admin") {
      document.body.dataset.authError = "Acesso reservado aos administradores. A redirecionar…";
      document.body.classList.add("auth-error");
      window.setTimeout(() => window.location.replace("/dashboard"), 900);
      return;
    }

    document.querySelector("#admin-email").textContent = auth.session.user.email;
    document.body.classList.add("auth-ready");
    document.querySelector("#module-form").addEventListener("submit", saveModule);
    document.querySelector("#module-cancel").addEventListener("click", resetModuleForm);
    document.querySelector("#refresh-admin").addEventListener("click", () => loadAdminData().catch(handleError));
    document.querySelector("#module-title").addEventListener("input", (event) => {
      const slug = document.querySelector("#module-slug");
      if (!document.querySelector("#module-id").value && !slug.dataset.manual) {
        slug.value = slugify(event.target.value);
      }
    });
    document.querySelector("#module-slug").addEventListener("input", (event) => {
      event.target.dataset.manual = event.target.value ? "true" : "";
    });
    document.querySelector("#sign-out").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.replace("/");
    });
    await loadAdminData();
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
