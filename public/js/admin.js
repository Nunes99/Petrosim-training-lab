import { formatDate, requireSession } from "./supabase-client.js";

let supabase;
const moduleLabels = {
  "Reservoir Reserves Lab": "Laboratório de Reservas",
  "Petroleum Economics Lab": "Laboratório de Economia do Petróleo",
  "HSE Decision Trainer": "Simulador de Decisões de Segurança",
};

function setMessage(text, error = false) {
  const element = document.querySelector("#module-message");
  element.textContent = text;
  element.classList.toggle("error", error);
}

function createAdminModule(module) {
  const item = document.createElement("article");
  item.className = "admin-list-item";
  const info = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = module.title;
  const detail = document.createElement("span");
  detail.textContent = `${module.category} · ${module.duration_minutes} min`;
  info.append(title, detail);

  const action = document.createElement("button");
  action.className = `status-pill ${module.is_published ? "success" : ""}`;
  action.type = "button";
  action.textContent = module.is_published ? "Publicado" : "Rascunho";
  action.addEventListener("click", async () => {
    const { error } = await supabase
      .from("training_modules")
      .update({ is_published: !module.is_published })
      .eq("id", module.id);
    if (!error) await loadAdminData();
  });
  item.append(info, action);
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
  user.textContent = simulation.user_id.slice(0, 8);
  item.append(info, user);
  return item;
}

async function loadAdminData() {
  const [users, simulations, modules] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("simulations").select("id, user_id, module, created_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(10),
    supabase.from("training_modules").select("*").order("sort_order"),
  ]);

  if (users.error || simulations.error || modules.error) {
    throw users.error || simulations.error || modules.error;
  }

  document.querySelector("#user-count").textContent = users.count ?? 0;
  document.querySelector("#admin-simulation-count").textContent = simulations.count ?? 0;
  document.querySelector("#admin-module-count").textContent = modules.data.length;
  document.querySelector("#admin-status").textContent = "Acesso autorizado";
  document.querySelector("#admin-status").classList.add("success");

  const moduleList = document.querySelector("#module-admin-list");
  moduleList.innerHTML = "";
  modules.data.forEach((module) => moduleList.append(createAdminModule(module)));

  const activityList = document.querySelector("#activity-list");
  activityList.innerHTML = "";
  simulations.data.forEach((simulation) => activityList.append(createActivity(simulation)));
}

async function init() {
  try {
    const auth = await requireSession();
    supabase = auth.supabase;
    document.querySelector("#admin-email").textContent = auth.session.user.email;

    const { data: profile, error } = await supabase
      .from("profiles").select("role").eq("id", auth.session.user.id).single();
    if (error || profile?.role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }

    await loadAdminData();
    document.querySelector("#module-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("A guardar...");
      const payload = {
        title: document.querySelector("#module-title").value.trim(),
        slug: document.querySelector("#module-slug").value.trim().toLowerCase(),
        description: document.querySelector("#module-description").value.trim(),
        category: document.querySelector("#module-category").value.trim(),
        duration_minutes: Number(document.querySelector("#module-duration").value),
        is_published: document.querySelector("#module-published").checked,
      };
      const { error: insertError } = await supabase.from("training_modules").insert(payload);
      if (insertError) {
        setMessage(insertError.message, true);
        return;
      }
      event.target.reset();
      document.querySelector("#module-duration").value = 45;
      setMessage("Laboratório guardado com sucesso.");
      await loadAdminData();
    });

    document.querySelector("#sign-out").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "/";
    });
  } catch (error) {
    document.querySelector("#admin-status").textContent = "Acesso indisponível";
    setMessage(error.message || "Não foi possível carregar a administração.", true);
  }
}

init();
