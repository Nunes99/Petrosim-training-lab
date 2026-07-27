import { getSupabase } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#economics-form");
const numeric = (selector) => Number($(selector).value);
const integer = (value) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(value);
let catalog;
let resultData;

const DCF_COLUMNS = [
  "Year", "Project_Year", "Stage", "Volume", "Net_Price_For_DCF", "Conversion_Factor",
  "Revenue_USD", "CAPEX_USD", "OPEX_USD", "Environmental_Cost_USD",
  "Security_Cost_USD", "Local_Content_Cost_USD", "Technology_Cost_USD",
  "Decommissioning_Cost_USD", "Total_Cash_Cost_USD", "Depreciable_CAPEX_Base_USD",
  "Depreciation_USD", "EBITDA_USD", "EBIT_USD", "Tax_USD", "Free_Cash_Flow_USD",
  "Discount_Rate", "Discount_Factor", "PV_FCF_USD", "Cumulative_FCF_USD",
  "Cumulative_PV_FCF_USD", "NPV_To_Date_USD", "Decision_Flag",
];
const MONEY_SERIES = DCF_COLUMNS.filter((key) => key.endsWith("_USD") || key === "Net_Price_For_DCF");
const CHART_SERIES = DCF_COLUMNS.filter((key) => !["Stage", "Decision_Flag"].includes(key));
const LABELS = Object.fromEntries(DCF_COLUMNS.map((key) => [key, key.replaceAll("_", " ")]));

function currency() { return $("#display-currency").value; }
function rate() { return currency() === "MZN" ? numeric("#usd-mzn-rate") : 1; }
function converted(value, key = "") {
  return MONEY_SERIES.includes(key) ? Number(value) * rate() : Number(value);
}
function money(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency", currency: currency(), notation: "compact", maximumFractionDigits: 1,
  }).format(Number(value) * rate());
}
function tableValue(value, key) {
  if (typeof value === "string") return value;
  if (MONEY_SERIES.includes(key)) return new Intl.NumberFormat("pt-PT", {
    style: "currency", currency: currency(), maximumFractionDigits: 2,
  }).format(converted(value, key));
  if (key === "Discount_Rate") return `${(value * 100).toFixed(2)}%`;
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 }).format(value);
}

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
  const mapping = {
    "#project-type": "project_type", "#project-phase": "phase", "#project-operator": "operator",
    "#project-location": "location", "#capacity": "capacity", "#capacity-unit": "capacity_unit",
    "#unit-price": "unit_price", "#variable-cost": "variable_cost", "#fixed-opex": "fixed_opex",
    "#initial-investment": "capex", "#project-years": "project_years",
    "#construction-years": "construction_years", "#abandonment-cost": "decommissioning_cost",
  };
  Object.entries(mapping).forEach(([selector, key]) => { $(selector).value = item[key]; });
  $("#capacity-unit-label").textContent = item.capacity_unit;
  $("#utilization").value = item.utilization * 100;
  $("#royalty-rate").value = item.royalty_rate * 100;
  $("#tax-rate").value = item.tax_rate * 100;
  $("#discount-rate").value = item.discount_rate * 100;
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
    fillSelect("#chart-series", CHART_SERIES);
    $("#chart-series-secondary").insertAdjacentHTML("beforeend",
      CHART_SERIES.map((key) => `<option value="${key}">${LABELS[key]}</option>`).join(""));
    $("#chart-series").value = "Free_Cash_Flow_USD";
    applyCase(catalog.economic_cases[0].id);
  } catch (error) {
    $("#economics-message").textContent = error.message;
    $("#economics-message").classList.add("error");
  }
}

function renderTable(rows) {
  $("#dcf-table-head").innerHTML = `<tr>${DCF_COLUMNS.map((key) =>
    `<th>${LABELS[key]}${MONEY_SERIES.includes(key) ? ` (${currency()})` : ""}</th>`).join("")}</tr>`;
  $("#cashflow-table").innerHTML = rows.map((row) => `<tr>${DCF_COLUMNS.map((key) =>
    `<td>${tableValue(row[key], key)}</td>`).join("")}</tr>`).join("");
}

function renderSensitivity(items) {
  const max = Math.max(...items.map((item) => Math.abs(item.npv)), 1);
  $("#sensitivity-chart").innerHTML = items.map((item) => `
    <div class="bar-row"><span>${item.scenario}</span><div><i class="${item.npv < 0 ? "negative" : ""}"
      style="width:${Math.max(Math.abs(item.npv) / max * 100, 3)}%"></i></div><strong>${money(item.npv)}</strong></div>
  `).join("");
}

function renderSummary(data) {
  $("#npv-result").textContent = money(data.npv);
  $("#irr-result").textContent = data.irr_percentage === null ? "N/D" : `${data.irr_percentage.toFixed(2)}%`;
  $("#payback-result").textContent = data.payback_years === null ? "Não recuperado" : data.payback_years.toFixed(2);
  $("#pi-result").textContent = new Intl.NumberFormat("pt-PT", {
    style: "currency", currency: currency(), maximumFractionDigits: 2,
  }).format(data.breakeven_price * rate());
  renderSensitivity(data.sensitivities);
  renderTable(data.annual_schedule);
  drawChart();
}

function drawChart() {
  const canvas = $("#dcf-chart");
  if (!resultData) return;
  $("#chart-empty").classList.add("hidden");
  const primary = $("#chart-series").value;
  const secondary = $("#chart-series-secondary").value;
  const series = [primary, secondary].filter(Boolean);
  const rows = resultData.annual_schedule;
  const width = Math.max(canvas.parentElement.clientWidth - 24, 620);
  const height = 360;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr; canvas.height = height * dpr;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const pad = { left: 70, right: 26, top: 30, bottom: 48 };
  const values = series.flatMap((key) => rows.map((row) => converted(row[key], key)));
  let min = Math.min(0, ...values); let max = Math.max(0, ...values);
  if (min === max) max = min + 1;
  const x = (index) => pad.left + index * ((width - pad.left - pad.right) / Math.max(rows.length - 1, 1));
  const y = (value) => pad.top + (max - value) / (max - min) * (height - pad.top - pad.bottom);
  ctx.font = '12px "PT Sans"'; ctx.strokeStyle = "#dce5eb"; ctx.fillStyle = "#667788"; ctx.lineWidth = 1;
  for (let step = 0; step <= 5; step += 1) {
    const value = min + (max - min) * step / 5;
    const ypos = y(value); ctx.beginPath(); ctx.moveTo(pad.left, ypos); ctx.lineTo(width - pad.right, ypos); ctx.stroke();
    ctx.fillText(new Intl.NumberFormat("pt-PT", { notation: "compact", maximumFractionDigits: 1 }).format(value), 4, ypos + 4);
  }
  const colors = ["#e59632", "#16875f"];
  series.forEach((key, seriesIndex) => {
    ctx.strokeStyle = colors[seriesIndex]; ctx.fillStyle = colors[seriesIndex]; ctx.lineWidth = 3; ctx.beginPath();
    rows.forEach((row, index) => {
      const xpos = x(index); const ypos = y(converted(row[key], key));
      if ($("#chart-type").value === "bar") {
        const barWidth = Math.max(3, (width - pad.left - pad.right) / rows.length / series.length - 2);
        const offset = (seriesIndex - (series.length - 1) / 2) * (barWidth + 2);
        ctx.fillRect(xpos + offset - barWidth / 2, Math.min(ypos, y(0)), barWidth, Math.abs(y(0) - ypos));
      } else {
        if (index === 0) ctx.moveTo(xpos, ypos); else ctx.lineTo(xpos, ypos);
      }
    });
    if ($("#chart-type").value === "line") ctx.stroke();
  });
  const every = Math.max(1, Math.ceil(rows.length / 8));
  rows.forEach((row, index) => {
    if (index % every === 0 || index === rows.length - 1) ctx.fillText(String(row.Year), x(index) - 14, height - 18);
  });
  $("#chart-legend").innerHTML = series.map((key, index) =>
    `<span><i style="background:${colors[index]}"></i>${LABELS[key]}${MONEY_SERIES.includes(key) ? ` · ${currency()}` : ""}</span>`).join("");
}

function payload() {
  return {
    project_type: $("#project-type").value, phase: $("#project-phase").value,
    capacity: numeric("#capacity"), capacity_unit: $("#capacity-unit").value,
    utilization: numeric("#utilization") / 100, unit_price: numeric("#unit-price"),
    variable_cost: numeric("#variable-cost"), fixed_opex: numeric("#fixed-opex"),
    capex: numeric("#initial-investment"), royalty_rate: numeric("#royalty-rate") / 100,
    tax_rate: numeric("#tax-rate") / 100, discount_rate: numeric("#discount-rate") / 100,
    project_years: numeric("#project-years"), construction_years: numeric("#construction-years"),
    decommissioning_cost: numeric("#abandonment-cost"),
    conversion_factor: numeric("#conversion-factor"), environmental_cost: numeric("#environmental-cost"),
    security_cost: numeric("#security-cost"), local_content_cost: numeric("#local-content-cost"),
    technology_cost: numeric("#technology-cost"), depreciation_years: numeric("#depreciation-years"),
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#economics-status").textContent = "A modelar...";
  try {
    const response = await fetch("/api/economics/integrated-project", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail?.[0]?.msg || "Premissas inválidas.");
    resultData = data; renderSummary(data);
    $("#economics-status").textContent = "Modelo concluído";
    $("#download-dcf").disabled = false;
    $("#economics-decision").textContent = data.decision === "invest_continue"
      ? "Decisão IM3: investir/continuar, condicionada à validação das premissas críticas."
      : "Decisão IM3: revisão stage-gate e reformulação antes de avançar.";
    $("#economics-decision").classList.toggle("positive", data.decision === "invest_continue");
    try {
      const supabase = await getSupabase(); const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await supabase.from("simulations").insert({
        user_id: session.user.id, module: "Petroleum Economics Lab", inputs: payload(), results: data,
      });
    } catch (saveError) { console.warn("Resultado não guardado:", saveError); }
  } catch (error) {
    $("#economics-message").textContent = error.message;
    $("#economics-message").classList.add("error");
    $("#economics-status").textContent = "Reveja as premissas";
  }
});

form.addEventListener("invalid", (event) => {
  event.preventDefault();
  const details = event.target.closest("details");
  if (details) details.open = true;
  $("#economics-message").textContent = `Reveja o campo “${event.target.closest("label")?.childNodes[0]?.textContent.trim() || event.target.id}”.`;
  $("#economics-message").classList.add("error");
  event.target.focus();
}, true);

["#display-currency", "#usd-mzn-rate"].forEach((selector) => $(selector).addEventListener("change", () => {
  if (resultData) renderSummary(resultData);
}));
["#chart-series", "#chart-series-secondary", "#chart-type"].forEach((selector) =>
  $(selector).addEventListener("change", drawChart));
window.addEventListener("resize", () => { if (resultData) drawChart(); });
$("#economic-case").addEventListener("change", (event) => applyCase(event.target.value));
$("#capacity-unit").addEventListener("input", (event) => { $("#capacity-unit-label").textContent = event.target.value; });
$("#download-dcf").addEventListener("click", () => {
  if (!resultData) return;
  const rows = resultData.annual_schedule;
  const csv = [DCF_COLUMNS.join(","), ...rows.map((row) => DCF_COLUMNS.map((key) =>
    JSON.stringify(MONEY_SERIES.includes(key) ? converted(row[key], key) : row[key])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `petrosim-dcf-${currency().toLowerCase()}.csv`; link.click(); URL.revokeObjectURL(link.href);
});

initialize();
