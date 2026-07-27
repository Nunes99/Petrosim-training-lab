import { getSupabase } from "./supabase-client.js";

const form = document.querySelector("#economics-form");
const message = document.querySelector("#economics-message");
const theoryCheck = document.querySelector("#theory-check");
const submitButton = document.querySelector("#economics-submit");

theoryCheck.addEventListener("change", () => {
  submitButton.disabled = !theoryCheck.checked;
});

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.classList.remove("error");
  document.querySelector("#economics-status").textContent = "A calcular...";

  const flows = document.querySelector("#cash-flows").value
    .split(/[,;\n]/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  const payload = {
    initial_investment: Number(document.querySelector("#initial-investment").value),
    annual_cash_flows: flows,
    discount_rate: Number(document.querySelector("#discount-rate").value) / 100,
  };

  try {
    if (!flows.length) throw new Error("Introduza pelo menos um fluxo de caixa.");
    const response = await fetch("/api/economics/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail?.[0]?.msg || data.detail || "Avaliação inválida.");

    document.querySelector("#npv-result").textContent = formatCurrency(data.npv);
    document.querySelector("#irr-result").textContent =
      data.irr_percentage === null ? "N/D" : `${data.irr_percentage.toFixed(2)}%`;
    document.querySelector("#payback-result").textContent =
      data.payback_years === null ? "Não recuperado" : data.payback_years.toFixed(2);
    document.querySelector("#pi-result").textContent = data.profitability_index.toFixed(3);
    document.querySelector("#economics-status").textContent = "Avaliação concluída";
    const decision = document.querySelector("#economics-decision");
    decision.textContent = data.decision === "economically_attractive"
      ? "NPV positivo: o cenário cria valor à taxa de desconto indicada."
      : "NPV negativo: reveja premissas, riscos e condições do investimento.";
    decision.classList.toggle("positive", data.decision === "economically_attractive");

    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from("simulations").insert({
          user_id: session.user.id,
          module: "Petroleum Economics Lab",
          inputs: payload,
          results: data,
        });
      }
    } catch (saveError) {
      console.warn("Economics result was not saved:", saveError);
    }
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
    document.querySelector("#economics-status").textContent = "Erro na avaliação";
  }
});
