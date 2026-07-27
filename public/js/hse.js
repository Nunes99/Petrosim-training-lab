import { getSupabase } from "./supabase-client.js";

const form = document.querySelector("#hse-form");
const list = document.querySelector("#scenario-list");
const message = document.querySelector("#hse-message");
const submitButton = document.querySelector("#hse-submit");
let scenarios = [];

document.querySelector("#hse-theory-check").addEventListener("change", (event) => {
  submitButton.disabled = !event.target.checked;
});

function renderScenario(scenario, index) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "scenario-card";
  const legend = document.createElement("legend");
  legend.textContent = `Cenário ${index + 1} · ${scenario.title}`;
  const context = document.createElement("p");
  context.textContent = scenario.context;
  fieldset.append(legend, context);

  scenario.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "scenario-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = scenario.id;
    input.value = option.id;
    input.required = true;
    const text = document.createElement("span");
    text.textContent = option.label;
    label.append(input, text);
    fieldset.append(label);
  });
  return fieldset;
}

async function loadScenarios() {
  try {
    const response = await fetch("/api/hse/scenarios");
    if (!response.ok) throw new Error("Não foi possível carregar os cenários.");
    scenarios = await response.json();
    scenarios.forEach((scenario, index) => list.append(renderScenario(scenario, index)));
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  const answers = Object.fromEntries(
    scenarios.map((scenario) => [
      scenario.id,
      new FormData(form).get(scenario.id),
    ])
  );

  try {
    const response = await fetch("/api/hse/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Não foi possível avaliar as decisões.");

    document.querySelector("#hse-results").classList.remove("hidden");
    document.querySelector("#hse-score").textContent =
      `${data.score} de ${data.total} decisões corretas`;
    const levelLabels = {
      proficient: "Proficiente",
      developing: "Em desenvolvimento",
      critical_review: "Revisão necessária",
    };
    document.querySelector("#hse-level").textContent =
      `${levelLabels[data.level]} · ${data.percentage.toFixed(0)}%`;

    const feedback = document.querySelector("#hse-feedback");
    feedback.innerHTML = "";
    data.feedback.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = `feedback-item ${item.correct ? "correct" : "incorrect"}`;
      const title = document.createElement("strong");
      title.textContent = `${item.correct ? "Correto" : "Rever"} · Cenário ${index + 1}`;
      const explanation = document.createElement("p");
      explanation.textContent = item.explanation;
      const consequence = document.createElement("p");
      consequence.className = "consequence";
      consequence.textContent = `Consequência operacional: ${item.consequence}`;
      const risk = document.createElement("span");
      risk.className = `risk-badge ${item.residual_risk <= 2 ? "low" : "high"}`;
      risk.textContent = item.residual_risk <= 2 ? "Risco residual baixo" : "Risco residual elevado";
      card.append(title, explanation, consequence, risk);
      feedback.append(card);
    });

    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from("simulations").insert({
          user_id: session.user.id,
          module: "HSE Decision Trainer",
          inputs: { answers },
          results: {
            score: data.score,
            total: data.total,
            percentage: data.percentage,
            level: data.level,
          },
        });
      }
    } catch (saveError) {
      console.warn("HSE result was not saved:", saveError);
    }
    document.querySelector("#hse-results").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  }
});

loadScenarios();
