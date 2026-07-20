const response = await fetch("/api/health");
const response = await fetch("/api/index");

const apiStatus = document.querySelector("#api-status");
const form = document.querySelector("#reserves-form");
const formMessage = document.querySelector("#form-message");
const resultStatus = document.querySelector("#result-status");

const ooipResult = document.querySelector("#ooip-result");
const recoverableResult = document.querySelector("#recoverable-result");
const unrecoveredResult = document.querySelector("#unrecovered-result");
const recoveryResult = document.querySelector("#recovery-result");


function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}


async function checkApiHealth() {
  try {
    const response = await fetch("/api/health");

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    apiStatus.textContent =
      data.status === "healthy"
        ? "API operacional"
        : "Estado desconhecido";

    apiStatus.classList.add("online");
  } catch (error) {
    console.error("Health check failed:", error);

    apiStatus.textContent = "API indisponível";
    apiStatus.classList.add("offline");
  }
}


function getInputValue(selector) {
  const element = document.querySelector(selector);
  return Number(element.value);
}


form.addEventListener("submit", async (event) => {
  event.preventDefault();

  formMessage.textContent = "";
  resultStatus.textContent = "A calcular...";

  const payload = {
    area_acres: getInputValue("#area-acres"),
    net_pay_ft: getInputValue("#net-pay"),
    porosity: getInputValue("#porosity"),
    water_saturation: getInputValue("#water-saturation"),
    formation_volume_factor:
      getInputValue("#formation-volume-factor"),
    recovery_factor: getInputValue("#recovery-factor"),
  };

  try {
    const response = await fetch("/api/reserves/oil", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        data.detail?.[0]?.msg
        ?? data.detail
        ?? "Não foi possível executar a simulação.";

      throw new Error(message);
    }

    ooipResult.textContent = formatNumber(data.ooip_stb);

    recoverableResult.textContent =
      formatNumber(data.recoverable_reserves_stb);

    unrecoveredResult.textContent =
      formatNumber(data.unrecovered_volume_stb);

    recoveryResult.textContent =
      `${data.recovery_percentage.toFixed(2)}%`;

    resultStatus.textContent = "Simulação concluída";
  } catch (error) {
    console.error("Simulation failed:", error);

    formMessage.textContent =
      error.message || "Ocorreu um erro inesperado.";

    resultStatus.textContent = "Erro no cálculo";
  }
});


checkApiHealth();