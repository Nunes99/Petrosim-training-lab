import { getSupabase } from "./supabase-client.js";

const apiStatus = document.querySelector("#api-status");
const form = document.querySelector("#reserves-form");
const formMessage = document.querySelector("#form-message");
const resultStatus = document.querySelector("#result-status");
const theoryCheck = document.querySelector("#reserves-theory-check");
const submitButton = document.querySelector("#reserves-submit");
const uncertaintyInput = document.querySelector("#uncertainty");

uncertaintyInput.addEventListener("input", () => {
  document.querySelector("#uncertainty-value").textContent = `${uncertaintyInput.value}%`;
});

theoryCheck.addEventListener("change", () => {
  submitButton.disabled = !theoryCheck.checked;
});

function formatNumber(value) {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(value);
}

async function checkApiHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error(`API respondeu ${response.status}`);
    const data = await response.json();
    apiStatus.textContent = data.status === "healthy" ? "API operacional" : "Estado desconhecido";
    apiStatus.classList.add("online");
  } catch (error) {
    console.error("Health check failed:", error);
    apiStatus.textContent = "API indisponível";
    apiStatus.classList.add("offline");
  }
}

function inputValue(selector) {
  return Number(document.querySelector(selector).value);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  formMessage.classList.remove("error");
  resultStatus.textContent = "A calcular...";

  const payload = {
    area_acres: inputValue("#area-acres"),
    net_pay_ft: inputValue("#net-pay"),
    net_to_gross: inputValue("#net-to-gross"),
    porosity: inputValue("#porosity"),
    water_saturation: inputValue("#water-saturation"),
    formation_volume_factor: inputValue("#formation-volume-factor"),
    recovery_factor: inputValue("#recovery-factor"),
    uncertainty_percentage: inputValue("#uncertainty"),
  };

  try {
    const response = await fetch("/api/reserves/field-study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
      throw new Error(detail || "Não foi possível executar a simulação.");
    }

    document.querySelector("#p90-result").textContent = formatNumber(data.p90_recoverable_stb);
    document.querySelector("#p50-result").textContent = formatNumber(data.p50_recoverable_stb);
    document.querySelector("#p10-result").textContent = formatNumber(data.p10_recoverable_stb);
    const driverLabels = {
      net_pay: "Espessura efetiva",
      porosity: "Porosidade",
      water_saturation: "Saturação de fluido",
      recovery_factor: "Fator de recuperação",
    };
    document.querySelector("#driver-result").textContent = driverLabels[data.primary_driver] || data.primary_driver;
    document.querySelector("#range-p90").textContent = formatNumber(data.p90_recoverable_stb);
    document.querySelector("#range-p10").textContent = formatNumber(data.p10_recoverable_stb);
    resultStatus.textContent = "Simulação concluída";

    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { error } = await supabase.from("simulations").insert({
          user_id: session.user.id,
          module: "Reservoir Reserves Lab",
          inputs: payload,
          results: data,
        });
        if (error) throw error;
        resultStatus.textContent = "Concluída e guardada";
      }
    } catch (saveError) {
      console.warn("Simulation was not saved:", saveError);
    }
  } catch (error) {
    formMessage.textContent = error.message || "Ocorreu um erro inesperado.";
    formMessage.classList.add("error");
    resultStatus.textContent = "Erro no cálculo";
  }
});

checkApiHealth();
