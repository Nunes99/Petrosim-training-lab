import { formatDate, getCurrentProfile, requireSession } from "./supabase-client.js";

const status = document.querySelector("#dashboard-status");
const list = document.querySelector("#simulation-list");
const moduleLabels = {
  "Reservoir Reserves Lab": "Laboratório de Reservas",
  "Petroleum Economics Lab": "Laboratório de Economia do Petróleo",
  "HSE Decision Trainer": "Simulador de Decisões de Segurança",
};
const moduleRoutes = {
  "reservoir-reserves": "/labs/reserves",
  "petroleum-economics": "/labs/economics",
  "hse-decision-trainer": "/labs/hse",
};
const moduleIcons = {
  "reservoir-reserves": "science",
  "petroleum-economics": "account_balance",
  "hse-decision-trainer": "health_and_safety",
};
const difficultyLabels = {
  foundation: "Fundamental",
  intermediate: "Intermédio",
  advanced: "Avançado",
};

function renderEmpty(message) {
  list.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  list.append(empty);
}

function renderSimulation(simulation) {
  const item = document.createElement("article");
  item.className = "history-item";

  const info = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = moduleLabels[simulation.module] || simulation.module;
  const date = document.createElement("span");
  date.textContent = formatDate(simulation.created_at);
  info.append(title, date);

  const result = document.createElement("div");
  result.className = "history-result";
  const value = document.createElement("strong");
  value.textContent = simulation.results?.recoverable_reserves_stb
    ? new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(
        simulation.results.recoverable_reserves_stb
      )
    : "Concluída";
  const label = document.createElement("span");
  label.textContent = simulation.results?.recoverable_reserves_stb
    ? "reservas recuperáveis (STB)"
    : "simulação";
  result.append(value, label);
  item.append(info, result);
  return item;
}

function renderModules(modules) {
  const grid = document.querySelector("#student-module-grid");
  grid.innerHTML = "";
  if (!modules.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Ainda não tem laboratórios atribuídos. Contacte a administração ou o seu formador.";
    grid.append(empty);
    return;
  }
  modules.forEach((module, index) => {
    const card = document.createElement("article");
    card.className = `module-card ${index === 0 ? "active" : ""}`;
    const icon = document.createElement("span");
    icon.className = "module-outline-icon material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = moduleIcons[module.slug] || "science";
    const number = document.createElement("span");
    number.className = "module-number";
    number.textContent = `${String(index + 1).padStart(2, "0")} · ${module.category}`;
    const title = document.createElement("h3");
    title.textContent = module.title;
    const description = document.createElement("p");
    description.textContent = module.description;
    const metadata = document.createElement("div");
    metadata.className = "module-card-meta";
    metadata.textContent = `${difficultyLabels[module.difficulty] || module.difficulty} · ${module.duration_minutes} min`;
    const link = document.createElement("a");
    link.className = "module-status";
    link.href = moduleRoutes[module.slug] || "/dashboard";
    link.textContent = moduleRoutes[module.slug] ? "Abrir laboratório" : "Conteúdo em preparação";
    card.append(icon, number, title, description, metadata, link);
    grid.append(card);
  });
}

async function init() {
  try {
    const { supabase, session } = await requireSession();
    document.querySelector("#user-email").textContent = session.user.email;
    const profile = await getCurrentProfile(supabase, session.user.id);
    if (profile.role === "admin") {
      window.location.replace("/admin");
      return;
    }
    if (profile.account_status !== "active") {
      await supabase.auth.signOut();
      window.location.replace("/login?status=suspended");
      return;
    }

    const [simulationsResult, modulesResult, certificatesResult] = await Promise.all([
      supabase.from("simulations").select("id,module,module_slug,results,created_at").order("created_at", { ascending: false }),
      supabase.from("training_modules")
        .select("id,slug,title,description,category,duration_minutes,difficulty")
        .order("sort_order"),
      supabase.from("certificates").select("id", { count: "exact", head: true }),
    ]);

    const dataError = simulationsResult.error || modulesResult.error || certificatesResult.error;
    if (dataError) throw dataError;
    const simulations = simulationsResult.data || [];
    const modules = modulesResult.data || [];

    document.querySelector("#student-name").textContent =
      profile.full_name || profile.display_name || session.user.email.split("@")[0];
    document.querySelector("#simulation-count").textContent = simulations.length;
    document.querySelector("#module-count").textContent = modules.length;
    document.querySelector("#certificate-count").textContent = certificatesResult.count ?? 0;
    document.querySelector("#last-activity").textContent = simulations[0]
      ? formatDate(simulations[0].created_at).split(",")[0]
      : "Sem atividade";
    renderModules(modules);

    status.textContent = simulations.length ? "Atualizado" : "Sem registos";
    list.innerHTML = "";
    if (!simulations.length) {
      renderEmpty("Ainda não realizou simulações. Inicie o primeiro laboratório.");
    } else {
      simulations.slice(0, 10).forEach((simulation) => list.append(renderSimulation(simulation)));
    }

    document.querySelector("#sign-out").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "/";
    });
    document.body.classList.add("auth-ready");
  } catch (error) {
    status.textContent = "Erro ao carregar";
    document.body.dataset.authError = error.message || "Não foi possível carregar o painel.";
    document.body.classList.add("auth-error");
    renderEmpty(error.message || "Não foi possível carregar o painel.");
  }
}

init();
