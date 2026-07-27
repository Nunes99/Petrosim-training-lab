import { authenticatedFetch, initializeRestrictedPage } from "./supabase-client.js";

const $ = (selector) => document.querySelector(selector);
const { supabase, session } = await initializeRestrictedPage("petroleum-economics");
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
const LABELS = {
  Year: "Ano", Project_Year: "Ano do projeto", Stage: "Fase", Volume: "Volume",
  Net_Price_For_DCF: "Preço líquido para o fluxo descontado", Conversion_Factor: "Fator de conversão",
  Revenue_USD: "Receita", CAPEX_USD: "Investimento de capital", OPEX_USD: "Custo operacional",
  Environmental_Cost_USD: "Custo ambiental", Security_Cost_USD: "Custo de segurança",
  Local_Content_Cost_USD: "Custo de conteúdo local", Technology_Cost_USD: "Custo de tecnologia",
  Decommissioning_Cost_USD: "Custo de descomissionamento", Total_Cash_Cost_USD: "Custo total de caixa",
  Depreciable_CAPEX_Base_USD: "Base de capital depreciável", Depreciation_USD: "Depreciação",
  EBITDA_USD: "Resultado antes de juros, impostos, depreciação e amortização",
  EBIT_USD: "Resultado antes de juros e impostos", Tax_USD: "Imposto",
  Free_Cash_Flow_USD: "Fluxo de caixa livre", Discount_Rate: "Taxa de desconto",
  Discount_Factor: "Fator de desconto", PV_FCF_USD: "Valor presente do fluxo de caixa livre",
  Cumulative_FCF_USD: "Fluxo de caixa livre acumulado",
  Cumulative_PV_FCF_USD: "Valor presente acumulado do fluxo de caixa livre",
  NPV_To_Date_USD: "Valor presente líquido acumulado", Decision_Flag: "Indicador de decisão",
};
const PROJECT_LABELS = {
  FLNG: "Gás natural liquefeito flutuante", LNG: "Gás natural liquefeito",
  "Gas-to-Power": "Gás para eletricidade", Pipeline: "Gasoduto ou oleoduto",
  Refinery: "Refinaria", Petrochemical: "Petroquímica", "Gas Distribution": "Distribuição de gás",
  Storage: "Armazenamento", "Gas Processing Plant": "Central de processamento de gás",
  Fertilizer: "Fertilizantes", CCUS: "Captura, utilização e armazenamento de carbono",
  Hydrogen: "Hidrogénio", "Upstream Oil": "Produção de petróleo",
  "Upstream Gas": "Produção de gás", Other: "Outro",
};
const PHASE_LABELS = {
  Concept: "Conceito", "Pre-FEED": "Pré-engenharia", FEED: "Engenharia de base",
  FID: "Decisão final de investimento", Construction: "Construção",
  Commissioning: "Comissionamento", Operation: "Operação", Expansion: "Expansão",
  Decommissioning: "Descomissionamento",
};
const VALUE_LABELS = {
  "Construção": "Construção", "Operação": "Operação", CONSTRUCT: "Em construção",
  INVEST_CONTINUE: "Investir ou continuar", REVIEW_STAGE_GATE: "Rever antes de avançar",
};

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
  if (typeof value === "string") return VALUE_LABELS[value] || value;
  if (MONEY_SERIES.includes(key)) return new Intl.NumberFormat("pt-PT", {
    style: "currency", currency: currency(), maximumFractionDigits: 2,
  }).format(converted(value, key));
  if (key === "Discount_Rate") return `${(value * 100).toFixed(2)}%`;
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 }).format(value);
}

$("#theory-check").addEventListener("change", (event) => {
  $("#economics-submit").disabled = !event.target.checked;
});

function fillSelect(selector, items, valueKey, labelKey = valueKey, translations = {}) {
  $(selector).innerHTML = items.map((item) => {
    const value = typeof item === "string" ? item : item[valueKey];
    const rawLabel = typeof item === "string" ? item : item[labelKey];
    const label = translations[value] || rawLabel;
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
    const response = await authenticatedFetch("/api/catalog/mozambique");
    if (!response.ok) throw new Error("Catálogo indisponível.");
    catalog = await response.json();
    fillSelect("#economic-case", catalog.economic_cases, "id", "name");
    fillSelect("#project-type", catalog.project_types, undefined, undefined, PROJECT_LABELS);
    fillSelect("#project-phase", catalog.project_phases, undefined, undefined, PHASE_LABELS);
    fillSelect("#project-operator", catalog.operators);
    fillSelect("#project-location", catalog.locations);
    fillSelect("#chart-series", CHART_SERIES, undefined, undefined, LABELS);
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
  const scenarioLabels = { Stress: "Cenário adverso", Base: "Cenário base", Upside: "Cenário favorável" };
  const max = Math.max(...items.map((item) => Math.abs(item.npv)), 1);
  $("#sensitivity-chart").innerHTML = items.map((item) => `
    <div class="bar-row"><span>${scenarioLabels[item.scenario] || item.scenario}</span><div><i class="${item.npv < 0 ? "negative" : ""}"
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
  const chartType = $("#chart-type").value;
  series.forEach((key, seriesIndex) => {
    const points = rows.map((row, index) => ({ x: x(index), y: y(converted(row[key], key)) }));
    ctx.strokeStyle = colors[seriesIndex]; ctx.fillStyle = colors[seriesIndex]; ctx.lineWidth = 3;
    if (chartType === "column") {
      points.forEach((point) => {
        const barWidth = Math.max(3, (width - pad.left - pad.right) / rows.length / series.length - 2);
        const offset = (seriesIndex - (series.length - 1) / 2) * (barWidth + 2);
        ctx.fillRect(point.x + offset - barWidth / 2, Math.min(point.y, y(0)), barWidth, Math.abs(y(0) - point.y));
      });
    } else if (chartType === "scatter") {
      points.forEach((point) => {
        ctx.beginPath(); ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else if (chartType === "step") {
          ctx.lineTo(point.x, points[index - 1].y); ctx.lineTo(point.x, point.y);
        } else ctx.lineTo(point.x, point.y);
      });
      if (chartType === "area") {
        ctx.lineTo(points[points.length - 1].x, y(0)); ctx.lineTo(points[0].x, y(0)); ctx.closePath();
        ctx.globalAlpha = .18; ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      }
      ctx.stroke();
    }
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
    const response = await authenticatedFetch("/api/economics/integrated-project", {
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
      if (session?.user) await supabase.from("simulations").insert({
        user_id: session.user.id,
        module: "Petroleum Economics Lab",
        module_slug: "petroleum-economics",
        inputs: payload(),
        results: data,
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
  const csv = [DCF_COLUMNS.map((key) => `${LABELS[key]}${MONEY_SERIES.includes(key) ? ` (${currency()})` : ""}`).join(","), ...rows.map((row) => DCF_COLUMNS.map((key) =>
    JSON.stringify(MONEY_SERIES.includes(key) ? converted(row[key], key) : row[key])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `petrosim-dcf-${currency().toLowerCase()}.csv`; link.click(); URL.revokeObjectURL(link.href);
});

initialize();
