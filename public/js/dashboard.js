import { formatDate, requireSession } from "./supabase-client.js";

const status = document.querySelector("#dashboard-status");
const list = document.querySelector("#simulation-list");

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
  title.textContent = simulation.module;
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

async function init() {
  try {
    const { supabase, session } = await requireSession();
    document.querySelector("#user-email").textContent = session.user.email;

    const [profileResult, simulationsResult, modulesResult] = await Promise.all([
      supabase.from("profiles").select("display_name, role").eq("id", session.user.id).single(),
      supabase.from("simulations").select("id, module, results, created_at").order("created_at", { ascending: false }),
      supabase.from("training_modules").select("id", { count: "exact", head: true }).eq("is_published", true),
    ]);

    if (simulationsResult.error) throw simulationsResult.error;
    const simulations = simulationsResult.data || [];
    const profile = profileResult.data;

    document.querySelector("#student-name").textContent =
      profile?.display_name || session.user.email.split("@")[0];
    document.querySelector("#simulation-count").textContent = simulations.length;
    document.querySelector("#module-count").textContent = modulesResult.count ?? 0;
    document.querySelector("#last-activity").textContent = simulations[0]
      ? formatDate(simulations[0].created_at).split(",")[0]
      : "Sem atividade";

    if (profile?.role === "admin") {
      document.querySelector("#admin-link").classList.remove("hidden");
    }

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
  } catch (error) {
    status.textContent = "Erro ao carregar";
    renderEmpty(error.message || "Não foi possível carregar o painel.");
  }
}

init();
