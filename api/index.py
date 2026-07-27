import os
from math import isfinite

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator


app = FastAPI(
    title="PetroSim Training Lab API",
    description="Scientific calculation engine for petroleum and gas training.",
    version="0.1.0",
)


class OilReservesInput(BaseModel):
    area_acres: float = Field(gt=0)
    net_pay_ft: float = Field(gt=0)
    porosity: float = Field(gt=0, le=1)
    water_saturation: float = Field(ge=0, lt=1)
    formation_volume_factor: float = Field(gt=0)
    recovery_factor: float = Field(ge=0, le=1)


class OilReservesOutput(BaseModel):
    ooip_stb: float
    recoverable_reserves_stb: float
    unrecovered_volume_stb: float
    recovery_percentage: float


class PublicConfig(BaseModel):
    supabase_url: str | None
    supabase_anon_key: str | None
    configured: bool


class EconomicsInput(BaseModel):
    initial_investment: float = Field(gt=0)
    annual_cash_flows: list[float] = Field(min_length=1, max_length=30)
    discount_rate: float = Field(ge=0, lt=1)

    @field_validator("annual_cash_flows")
    @classmethod
    def cash_flows_must_be_finite(cls, values: list[float]) -> list[float]:
        if not all(isfinite(value) for value in values):
            raise ValueError("Cash flows must contain only finite values.")
        return values


class EconomicsOutput(BaseModel):
    npv: float
    irr_percentage: float | None
    payback_years: float | None
    profitability_index: float
    decision: str


class HSEInput(BaseModel):
    answers: dict[str, str]


class HSEOutput(BaseModel):
    score: int
    total: int
    percentage: float
    level: str
    feedback: list[dict[str, str | bool]]


HSE_SCENARIOS = [
    {
        "id": "gas_alarm",
        "title": "Alarme de gás numa área de processo",
        "context": "O detector portátil indica uma concentração crescente de gás inflamável.",
        "options": [
            {"id": "continue", "label": "Concluir rapidamente a tarefa antes de sair"},
            {"id": "evacuate", "label": "Parar o trabalho, alertar a equipa e evacuar pela rota segura"},
            {"id": "investigate", "label": "Procurar sozinho a origem da fuga"},
        ],
        "correct": "evacuate",
        "explanation": "Um alarme de gás exige interrupção, comunicação e evacuação conforme o plano de emergência.",
    },
    {
        "id": "permit_change",
        "title": "Alteração do escopo de trabalho",
        "context": "Durante uma manutenção, a equipa precisa executar uma tarefa não prevista na permissão.",
        "options": [
            {"id": "adapt", "label": "Adaptar o trabalho com os recursos disponíveis"},
            {"id": "pause", "label": "Suspender, reavaliar riscos e atualizar a permissão"},
            {"id": "verbal", "label": "Continuar após autorização verbal de um colega"},
        ],
        "correct": "pause",
        "explanation": "Mudanças de escopo anulam pressupostos da análise de risco e exigem nova avaliação formal.",
    },
    {
        "id": "spill_response",
        "title": "Pequeno derrame de hidrocarboneto",
        "context": "É identificado um derrame próximo de uma drenagem, sem vítimas.",
        "options": [
            {"id": "wash", "label": "Lavar o produto para a drenagem"},
            {"id": "ignore", "label": "Aguardar a equipa do turno seguinte"},
            {"id": "isolate", "label": "Isolar a fonte, proteger a drenagem e comunicar o incidente"},
        ],
        "correct": "isolate",
        "explanation": "A resposta inicial deve controlar a fonte, impedir dispersão e ativar o procedimento de comunicação.",
    },
]


@app.get("/api")
def root():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }


@app.get("/api/config", response_model=PublicConfig)
def public_config():
    """Expose only the publishable Supabase values needed by the browser."""
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    return PublicConfig(
        supabase_url=url,
        supabase_anon_key=anon_key,
        configured=bool(url and anon_key),
    )


@app.post("/api/reserves/oil", response_model=OilReservesOutput)
def calculate_oil_reserves(data: OilReservesInput):
    ooip = (
        7758
        * data.area_acres
        * data.net_pay_ft
        * data.porosity
        * (1 - data.water_saturation)
        / data.formation_volume_factor
    )

    recoverable = ooip * data.recovery_factor
    unrecovered = ooip - recoverable

    if not all(
        isfinite(value)
        for value in [ooip, recoverable, unrecovered]
    ):
        raise HTTPException(
            status_code=422,
            detail="The supplied parameters produced an invalid result.",
        )

    return OilReservesOutput(
        ooip_stb=round(ooip, 2),
        recoverable_reserves_stb=round(recoverable, 2),
        unrecovered_volume_stb=round(unrecovered, 2),
        recovery_percentage=round(data.recovery_factor * 100, 2),
    )


def discounted_value(initial: float, flows: list[float], rate: float) -> float:
    return -initial + sum(
        cash_flow / ((1 + rate) ** year)
        for year, cash_flow in enumerate(flows, start=1)
    )


def calculate_irr(initial: float, flows: list[float]) -> float | None:
    lower, upper = -0.9999, 10.0
    lower_value = discounted_value(initial, flows, lower)
    upper_value = discounted_value(initial, flows, upper)
    if lower_value * upper_value > 0:
        return None
    for _ in range(120):
        midpoint = (lower + upper) / 2
        value = discounted_value(initial, flows, midpoint)
        if abs(value) < 1e-7:
            return midpoint
        if lower_value * value <= 0:
            upper = midpoint
        else:
            lower = midpoint
            lower_value = value
    return (lower + upper) / 2


@app.post("/api/economics/evaluate", response_model=EconomicsOutput)
def evaluate_economics(data: EconomicsInput):
    npv = discounted_value(
        data.initial_investment,
        data.annual_cash_flows,
        data.discount_rate,
    )
    present_value_inflows = npv + data.initial_investment
    profitability_index = present_value_inflows / data.initial_investment
    irr = calculate_irr(data.initial_investment, data.annual_cash_flows)

    cumulative = 0.0
    payback = None
    for year, cash_flow in enumerate(data.annual_cash_flows, start=1):
        previous = cumulative
        cumulative += cash_flow
        if cumulative >= data.initial_investment and cash_flow > 0:
            remaining = data.initial_investment - previous
            payback = (year - 1) + (remaining / cash_flow)
            break

    return EconomicsOutput(
        npv=round(npv, 2),
        irr_percentage=round(irr * 100, 2) if irr is not None else None,
        payback_years=round(payback, 2) if payback is not None else None,
        profitability_index=round(profitability_index, 3),
        decision="economically_attractive" if npv >= 0 else "review_or_reject",
    )


@app.get("/api/hse/scenarios")
def get_hse_scenarios():
    return [
        {
            "id": scenario["id"],
            "title": scenario["title"],
            "context": scenario["context"],
            "options": scenario["options"],
        }
        for scenario in HSE_SCENARIOS
    ]


@app.post("/api/hse/evaluate", response_model=HSEOutput)
def evaluate_hse(data: HSEInput):
    feedback = []
    score = 0
    for scenario in HSE_SCENARIOS:
        selected = data.answers.get(scenario["id"], "")
        correct = selected == scenario["correct"]
        score += int(correct)
        feedback.append(
            {
                "scenario_id": scenario["id"],
                "correct": correct,
                "explanation": scenario["explanation"],
            }
        )
    percentage = round((score / len(HSE_SCENARIOS)) * 100, 2)
    level = "proficient" if percentage >= 80 else "developing" if percentage >= 50 else "critical_review"
    return HSEOutput(
        score=score,
        total=len(HSE_SCENARIOS),
        percentage=percentage,
        level=level,
        feedback=feedback,
    )
