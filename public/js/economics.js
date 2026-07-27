import { getSupabase } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#economics-form");
const money = (value) => new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1,
}).format(value);
const integer = (value) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(value);
const numeric = (selector) => Number($(selector).value);
let catalog;

$("#theory-check").addEventListener("change", (event) => {
  $("#economics-submit").disabled = !event.target.checked;
});

function fillSelect(selector, items, valueKey, labelKey = valueKey) {
  $(selector).innerHTML = items.map((item) => {
    const value = typeof item === "string" ? item : item[valueKey];
    const label = typeof item === "string" ? item : item[labelKey];
    return `<option value="${value}">${label}</option>`;
  }).join("");
}

function applyCase(caseId) {
  const item = catalog.economic_cases.find((entry) => entry.id === caseId);
  if (!item) return;
  $("#economic-case-name").textContent = item.name;
  $("#project-type").value = item.project_type;
  $("#project-phase").value = item.phase;
  $("#project-operator").value = item.operator;
  $("#project-location").value = item.location;
  $("#capacity").value = item.capacity;
  $("#capacity-unit").value = item.capacity_unit;
  $("#capacity-unit-label").textContent = item.capacity_unit;
  $("#utilization").value = item.utilization * 100;
  $("#unit-price").value = item.unit_price;
  $("#variable-cost").value = item.variable_cost;
  $("#fixed-opex").value = item.fixed_opex;
  $("#initial-investment").value = item.capex;
  $("#royalty-rate").value = item.royalty_rate * 100;
  $("#tax-rate").value = item.tax_rate * 100;
  $("#discount-rate").value = item.discount_rate * 100;
  $("#project-years").value = item.project_years;
  $("#construction-years").value = item.construction_years;
  $("#abandonment-cost").value = item.decommissioning_cost;
}

async function initialize() {
  try {
    const response = await fetch("/api/catalog/mozambique");
    if (!response.ok) throw new Error("Catálogo indisponível.");
    catalog = await response.json();
    fillSelect("#economic-case", catalog.economic_cases, "id", "name");
    fillSelect("#project-type", catalog.project_types);
    fillSelect("#project-phase", catalog.project_phases);
    fillSelect("#project-operator", catalog.operators);
    fillSelect("#project-location", catalog.locations);
    applyCase(catalog.economic_cases[0].id);
  } catch (error) {
    $("#economics-message").textContent = error.message;
    $("#economics-message").classList.add("error");
  }
}

$("#economic-case").addEventListener("change", (event) => applyCase(event.target.value));
$("#capacity-unit").addEventListener("input", (event) => {
  $("#capacity-unit-label").textContent = event.target.value;
});

function renderSchedule(rows) {
  $("#cashflow-table").innerHTML = rows.map((row) => `<tr>
    <td>${row.year} · ${row.stage}</td><td>${integer(row.volume)}</td>
    <td>${money(row.revenue)}</td><td>${money(row.opex)}</td>
    <td>${money(row.capex)}</td><td>${money(row.free_cash_flow)}</td>
  </tr>`).join("");
}

function renderSensitivity(items) {
  const max = Math.max(...items.map((item) => Math.abs(item.npv)), 1);
  $("#sensitivity-chart").innerHTML = items.map((item) => `
    <div class="bar-row"><span>${item.scenario}</span><div><i class="${item.npv < 0 ? "negative" : ""}"
      style="width:${Math.max(Math.abs(item.npv) / max * 100, 3)}%"></i></div><strong>${money(item.npv)}</strong></div>
  `).join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#economics-message").textContent = "";
  $("#economics-status").textContent = "A modelar...";
  const payload = {
    project_type: $("#project-type").value, phase: $("#project-phase").value,
    capacity: numeric("#capacity"), capacity_unit: $("#capacity-unit").value,
    utilization: numeric("#utilization") / 100,
    unit_price: numeric("#unit-price"), variable_cost: numeric("#variable-cost"),
    fixed_opex: numeric("#fixed-opex"), capex: numeric("#initial-investment"),
    royalty_rate: numeric("#royalty-rate") / 100, tax_rate: numeric("#tax-rate") / 100,
    discount_rate: numeric("#discount-rate") / 100, project_years: numeric("#project-years"),
    construction_years: numeric("#construction-years"),
    decommissioning_cost: numeric("#abandonment-cost"),
  };
  try {
    const response = await fetch("/api/economics/integrated-project", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail?.[0]?.msg || "Premissas inválidas.");
    $("#npv-result").textContent = money(data.npv);
    $("#irr-result").textContent = data.irr_percentage === null ? "N/D" : `${data.irr_percentage.toFixed(2)}%`;
    $("#payback-result").textContent = data.payback_years === null ? "Não recuperado" : data.payback_years.toFixed(2);
    $("#pi-result").textContent = `$${data.breakeven_price.toFixed(2)}`;
    $("#economics-status").textContent = "Modelo concluído";
    $("#economics-decision").textContent = data.decision === "invest_continue"
      ? "Decisão IM3: investir/continuar, condicionada à validação das premissas críticas."
      : "Decisão IM3: revisão stage-gate e reformulação antes de avançar.";
    $("#economics-decision").classList.toggle("positive", data.decision === "invest_continue");
    renderSchedule(data.annual_schedule);
    renderSensitivity(data.sensitivities);
    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await supabase.from("simulations").insert({
        user_id: session.user.id, module: "Petroleum Economics Lab", inputs: payload, results: data,
      });
    } catch (saveError) { console.warn("Resultado não guardado:", saveError); }
  } catch (error) {
    $("#economics-message").textContent = error.message;
    $("#economics-message").classList.add("error");
    $("#economics-status").textContent = "Reveja as premissas";
  }
});

initialize();
