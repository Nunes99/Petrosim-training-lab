import { getSupabase } from "./supabase-client.js";

const apiStatus = document.querySelector("#api-status");
const form = document.querySelector("#reserves-form");
const formMessage = document.querySelector("#form-message");
const resultStatus = document.querySelector("#result-status");
const theoryCheck = document.querySelector("#reserves-theory-check");
const submitButton = document.querySelector("#reserves-submit");

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
    porosity: inputValue("#porosity"),
    water_saturation: inputValue("#water-saturation"),
    formation_volume_factor: inputValue("#formation-volume-factor"),
    recovery_factor: inputValue("#recovery-factor"),
  };

  try {
    const response = await fetch("/api/reserves/oil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
      throw new Error(detail || "Não foi possível executar a simulação.");
    }

    document.querySelector("#ooip-result").textContent = formatNumber(data.ooip_stb);
    document.querySelector("#recoverable-result").textContent = formatNumber(data.recoverable_reserves_stb);
    document.querySelector("#unrecovered-result").textContent = formatNumber(data.unrecovered_volume_stb);
    document.querySelector("#recovery-result").textContent = `${data.recovery_percentage.toFixed(2)}%`;
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
