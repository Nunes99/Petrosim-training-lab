import { getSupabase } from "./supabase-client.js";

const form = document.querySelector("#economics-form");
const message = document.querySelector("#economics-message");
const submitButton = document.querySelector("#economics-submit");

document.querySelector("#theory-check").addEventListener("change", (event) => {
  submitButton.disabled = !event.target.checked;
});

const number = (selector) => Number(document.querySelector(selector).value);
const money = (value) => new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1,
}).format(value);
const integer = (value) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(value);

function renderSchedule(rows) {
  const body = document.querySelector("#cashflow-table");
  body.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [row.year, integer(row.production_stb), money(row.revenue), money(row.opex), money(row.tax), money(row.free_cash_flow)]
      .forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
    body.append(tr);
  });
}

function renderSensitivity(items) {
  const chart = document.querySelector("#sensitivity-chart");
  chart.innerHTML = "";
  const max = Math.max(...items.map((item) => Math.abs(item.npv)), 1);
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = item.scenario;
    const track = document.createElement("div");
    const bar = document.createElement("i");
    bar.style.width = `${Math.max((Math.abs(item.npv) / max) * 100, 3)}%`;
    bar.classList.toggle("negative", item.npv < 0);
    track.append(bar);
    const value = document.createElement("strong");
    value.textContent = money(item.npv);
    row.append(label, track, value);
    chart.append(row);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  document.querySelector("#economics-status").textContent = "A modelar...";
  const payload = {
    capex: number("#initial-investment"),
    oil_price: number("#oil-price"),
    initial_production_bopd: number("#initial-production"),
    annual_decline_rate: number("#decline-rate") / 100,
    opex_per_barrel: number("#opex"),
    royalty_rate: number("#royalty-rate") / 100,
    tax_rate: number("#tax-rate") / 100,
    discount_rate: number("#discount-rate") / 100,
    project_years: number("#project-years"),
    abandonment_cost: number("#abandonment-cost"),
  };
  try {
    const response = await fetch("/api/economics/project", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail?.[0]?.msg || "Premissas inválidas.");
    document.querySelector("#npv-result").textContent = money(data.npv);
    document.querySelector("#irr-result").textContent = data.irr_percentage === null ? "N/D" : `${data.irr_percentage.toFixed(2)}%`;
    document.querySelector("#payback-result").textContent = data.payback_years === null ? "Não recuperado" : data.payback_years.toFixed(2);
    document.querySelector("#pi-result").textContent = `$${data.breakeven_price.toFixed(2)}`;
    document.querySelector("#economics-status").textContent = "Modelo concluído";
    const decision = document.querySelector("#economics-decision");
    decision.textContent = data.decision === "sanction"
      ? "Recomendação: avançar para a próxima fase, condicionado à validação das premissas críticas."
      : "Recomendação: reformular o conceito antes da decisão de investimento.";
    decision.classList.toggle("positive", data.decision === "sanction");
    renderSchedule(data.annual_schedule);
    renderSensitivity(data.sensitivities);

    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await supabase.from("simulations").insert({
        user_id: session.user.id, module: "Petroleum Economics Lab", inputs: payload, results: data,
      });
    } catch (saveError) { console.warn("Result not saved:", saveError); }
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
    document.querySelector("#economics-status").textContent = "Reveja as premissas";
  }
});
