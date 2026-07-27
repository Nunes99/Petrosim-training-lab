import { authenticatedFetch, initializeRestrictedPage } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const { supabase, session } = await initializeRestrictedPage();
const form = $("#reserves-form");
const submitButton = $("#reserves-submit");
let catalog;

const value = (selector) => Number($(selector).value);
const format = (number, unit) => {
  const scaled = unit === "scf" ? number / 1e12 : number / 1e6;
  const suffix = unit === "scf" ? " Tscf" : " MMSTB";
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(scaled) + suffix;
};

$("#uncertainty").addEventListener("input", (event) => {
  $("#uncertainty-value").textContent = `${event.target.value}%`;
});
$("#reserves-theory-check").addEventListener("change", (event) => {
  submitButton.disabled = !event.target.checked;
});

function fillSelect(selector, items, valueKey, labelKey = valueKey) {
  const select = $(selector);
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = typeof item === "string" ? item : item[valueKey];
    option.textContent = typeof item === "string" ? item : item[labelKey];
    select.append(option);
  });
}

function syncFluidUi() {
  const gas = $("#fluid-type").value === "gas";
  $("#fvf-unit").textContent = gas ? "Bg · rb/scf" : "Bo · rb/STB";
  $("#formula-title").textContent = gas ? "Equação volumétrica de gás" : "Equação volumétrica de óleo";
  $("#formula-code").textContent = gas
    ? "GIIP = 43560 × A × h × NTG × φ × (1 − Sw) ÷ Bg"
    : "OOIP = 7758 × A × h × NTG × φ × (1 − Sw) ÷ Bo";
}

function applyCase(caseId) {
  const item = catalog.reservoir_cases.find((entry) => entry.id === caseId);
  if (!item) return;
  $("#reservoir-case-name").textContent = item.name;
  $("#reservoir-case-note").textContent = item.note;
  $("#reservoir-operator").value = item.operator;
  $("#reservoir-location").value = item.location;
  $("#reservoir-type").value = item.reservoir_type;
  $("#fluid-type").value = item.fluid_type;
  $("#area-acres").value = item.area_acres;
  $("#gross-thickness").value = item.gross_thickness_ft;
  $("#net-to-gross").value = item.net_to_gross;
  $("#porosity").value = item.porosity;
  $("#water-saturation").value = item.water_saturation;
  $("#formation-volume-factor").value = item.formation_volume_factor;
  $("#recovery-factor").value = item.recovery_factor;
  $("#uncertainty").value = item.uncertainty_percentage;
  $("#uncertainty-value").textContent = `${item.uncertainty_percentage}%`;
  syncFluidUi();
}

async function initialize() {
  try {
    const [healthResponse, catalogResponse] = await Promise.all([
      fetch("/api/health"), authenticatedFetch("/api/catalog/mozambique"),
    ]);
    if (!healthResponse.ok || !catalogResponse.ok) throw new Error("API indisponível");
    catalog = await catalogResponse.json();
    $("#api-status").textContent = "API operacional";
    $("#api-status").classList.add("online");
    fillSelect("#reservoir-case", catalog.reservoir_cases, "id", "name");
    fillSelect("#reservoir-operator", catalog.operators);
    fillSelect("#reservoir-location", catalog.locations);
    fillSelect("#reservoir-type", catalog.reservoir_types, "id", "label");
    applyCase(catalog.reservoir_cases[0].id);
  } catch (error) {
    $("#api-status").textContent = "API indisponível";
    $("#api-status").classList.add("offline");
    $("#form-message").textContent = error.message;
  }
}

$("#reservoir-case").addEventListener("change", (event) => applyCase(event.target.value));
$("#fluid-type").addEventListener("change", syncFluidUi);
$("#reservoir-type").addEventListener("change", (event) => {
  const type = catalog.reservoir_types.find((item) => item.id === event.target.value);
  if (type) { $("#fluid-type").value = type.fluid; syncFluidUi(); }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#form-message").textContent = "";
  $("#result-status").textContent = "A calcular...";
  const payload = {
    fluid_type: $("#fluid-type").value,
    reservoir_type: $("#reservoir-type").value,
    area_acres: value("#area-acres"),
    gross_thickness_ft: value("#gross-thickness"),
    net_to_gross: value("#net-to-gross"),
    porosity: value("#porosity"),
    water_saturation: value("#water-saturation"),
    formation_volume_factor: value("#formation-volume-factor"),
    recovery_factor: value("#recovery-factor"),
    uncertainty_percentage: value("#uncertainty"),
  };
  try {
    const response = await authenticatedFetch("/api/reserves/comprehensive", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail?.[0]?.msg || "Dados inválidos.");
    $("#p90-result").textContent = format(data.recoverable_p90, data.unit);
    $("#p50-result").textContent = format(data.recoverable_p50, data.unit);
    $("#p10-result").textContent = format(data.recoverable_p10, data.unit);
    $("#driver-result").textContent = `${data.net_pay_ft} ft`;
    $("#range-p90").textContent = format(data.recoverable_p90, data.unit);
    $("#range-p10").textContent = format(data.recoverable_p10, data.unit);
    document.querySelectorAll(".reserve-unit").forEach((node) => {
      node.textContent = data.unit === "scf" ? "gás recuperável · Tscf" : "óleo recuperável · MMSTB";
    });
    $("#calculation-warning").textContent = data.warnings.join(" ");
    $("#result-status").textContent = "Simulação concluída";
    try {
      if (session?.user) await supabase.from("simulations").insert({
        user_id: session.user.id, module: "Reservoir Reserves Lab", inputs: payload, results: data,
      });
    } catch (saveError) { console.warn("Resultado não guardado:", saveError); }
  } catch (error) {
    $("#form-message").textContent = error.message;
    $("#form-message").classList.add("error");
    $("#result-status").textContent = "Reveja os parâmetros";
  }
});

initialize();
