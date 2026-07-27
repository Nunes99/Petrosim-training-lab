import { getSupabase } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
let scenarios = [];
let current = 0;
let answers = {};
const start = $("#hse-start");

$("#hse-theory-check").addEventListener("change", (event) => {
  start.disabled = !event.target.checked;
  $("#hse-simulator").classList.toggle("locked", !event.target.checked);
});

async function loadScenarios() {
  try {
    const response = await fetch("/api/hse/scenarios");
    if (!response.ok) throw new Error("Não foi possível carregar os cenários.");
    scenarios = await response.json();
    $("#scenario-count").textContent = `0/${scenarios.length}`;
  } catch (error) {
    $("#hse-message").textContent = error.message;
    $("#hse-message").classList.add("error");
  }
}

function renderCurrent() {
  const scenario = scenarios[current];
  $("#scenario-step").textContent = `Cenário ${current + 1} · decisão em curso`;
  $("#scenario-count").textContent = `${current + 1}/${scenarios.length}`;
  $("#scenario-progress-bar").style.width = `${current / scenarios.length * 100}%`;
  $("#scenario-stage").innerHTML = `
    <article class="immersive-scenario">
      <div class="scenario-visual"><img src="${scenario.image}" alt="Ilustração operacional de ${scenario.title}">
        <span>${scenario.location}</span></div>
      <div class="scenario-console">
        <span class="eyebrow">Seu papel · ${scenario.role}</span>
        <h2>${scenario.title}</h2><p>${scenario.context}</p>
        <div class="signal-strip">${scenario.signals.map((signal) => `<span>${signal}</span>`).join("")}</div>
        <h3>Qual é a sua decisão?</h3>
        <div class="decision-options">${scenario.options.map((option) => `
          <button class="decision-option" type="button" data-answer="${option.id}">
            <strong>${option.label}</strong><span>${option.detail}</span>
          </button>`).join("")}</div>
      </div>
    </article>`;
  document.querySelectorAll(".decision-option").forEach((button) => {
    button.addEventListener("click", () => choose(button.dataset.answer));
  });
}

async function choose(answer) {
  answers[scenarios[current].id] = answer;
  document.querySelectorAll(".decision-option").forEach((button) => {
    button.disabled = true;
    button.classList.toggle("selected", button.dataset.answer === answer);
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  current += 1;
  if (current < scenarios.length) renderCurrent();
  else finish();
}

async function finish() {
  $("#scenario-progress-bar").style.width = "100%";
  $("#scenario-step").textContent = "Simulação concluída";
  $("#scenario-stage").innerHTML = '<div class="scenario-placeholder"><strong>A preparar o debrief…</strong><p>As suas decisões estão a ser comparadas com as barreiras críticas.</p></div>';
  try {
    const response = await fetch("/api/hse/evaluate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Não foi possível avaliar as decisões.");
    $("#hse-results").classList.remove("hidden");
    $("#scenario-stage").innerHTML = '<div class="scenario-placeholder success"><strong>Turno encerrado em segurança</strong><p>Consulte o debrief para compreender a consequência de cada decisão.</p></div>';
    $("#hse-score").textContent = `${data.score} de ${data.total} barreiras preservadas`;
    const levels = { proficient: "Proficiente", developing: "Em desenvolvimento", critical_review: "Revisão necessária" };
    $("#hse-level").textContent = `${levels[data.level]} · ${data.percentage.toFixed(0)}%`;
    $("#hse-feedback").innerHTML = data.feedback.map((item, index) => `
      <article class="feedback-item ${item.correct ? "correct" : "incorrect"}">
        <strong>${item.correct ? "Barreira preservada" : "Decisão com potencial de escalada"} · ${scenarios[index].title}</strong>
        <p>${item.explanation}</p><p class="consequence">Consequência possível: ${item.consequence}</p>
        <span class="risk-badge ${item.residual_risk <= 2 ? "low" : "high"}">
          Risco residual ${item.residual_risk <= 2 ? "baixo" : "elevado"}</span>
      </article>`).join("");
    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await supabase.from("simulations").insert({
        user_id: session.user.id, module: "HSE Decision Trainer", inputs: { answers },
        results: { score: data.score, total: data.total, percentage: data.percentage, level: data.level },
      });
    } catch (saveError) { console.warn("Resultado não guardado:", saveError); }
    $("#hse-results").scrollIntoView({ behavior: "smooth" });
  } catch (error) { $("#hse-message").textContent = error.message; }
}

function reset() {
  current = 0; answers = {};
  $("#hse-results").classList.add("hidden");
  renderCurrent();
  $("#hse-simulator").scrollIntoView({ behavior: "smooth" });
}

start.addEventListener("click", () => { start.classList.add("hidden"); renderCurrent(); });
$("#hse-restart").addEventListener("click", reset);
loadScenarios();
