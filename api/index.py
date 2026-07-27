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


class ReservoirFieldInput(OilReservesInput):
    net_to_gross: float = Field(gt=0, le=1)
    uncertainty_percentage: float = Field(ge=0, le=40)


class ReservoirFieldOutput(BaseModel):
    p90_recoverable_stb: float
    p50_recoverable_stb: float
    p10_recoverable_stb: float
    base_ooip_stb: float
    recovery_efficiency: float
    primary_driver: str


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


class ProjectEconomicsInput(BaseModel):
    capex: float = Field(gt=0)
    oil_price: float = Field(gt=0)
    initial_production_bopd: float = Field(gt=0)
    annual_decline_rate: float = Field(ge=0, lt=1)
    opex_per_barrel: float = Field(ge=0)
    royalty_rate: float = Field(ge=0, lt=1)
    tax_rate: float = Field(ge=0, lt=1)
    discount_rate: float = Field(ge=0, lt=1)
    project_years: int = Field(ge=2, le=30)
    abandonment_cost: float = Field(ge=0)


class ProjectEconomicsOutput(BaseModel):
    npv: float
    irr_percentage: float | None
    payback_years: float | None
    total_production_stb: float
    total_free_cash_flow: float
    breakeven_price: float
    decision: str
    annual_schedule: list[dict[str, float | int]]
    sensitivities: list[dict[str, float | str]]


class HSEInput(BaseModel):
    answers: dict[str, str]


class HSEOutput(BaseModel):
    score: int
    total: int
    percentage: float
    level: str
    feedback: list[dict[str, str | bool | int]]


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
        "consequence": "A permanência na área pode expor a equipa a incêndio, explosão ou atmosfera tóxica.",
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
        "consequence": "Executar uma tarefa fora da permissão remove barreiras planeadas e aumenta a probabilidade de incidente.",
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
        "consequence": "A dispersão para a drenagem amplia o impacto ambiental e dificulta a contenção.",
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


@app.post("/api/reserves/field-study", response_model=ReservoirFieldOutput)
def evaluate_reservoir_field(data: ReservoirFieldInput):
    effective_pay = data.net_pay_ft * data.net_to_gross
    base_ooip = (
        7758 * data.area_acres * effective_pay * data.porosity
        * (1 - data.water_saturation) / data.formation_volume_factor
    )
    base_recoverable = base_ooip * data.recovery_factor
    spread = data.uncertainty_percentage / 100
    low_multiplier = (
        (1 - spread) ** 3 * (1 + spread) ** -1
    )
    high_multiplier = (
        (1 + spread) ** 3 * (1 - min(spread, 0.8)) ** -1
    )
    drivers = {
        "net_pay": effective_pay,
        "porosity": data.porosity * 100,
        "water_saturation": (1 - data.water_saturation) * 100,
        "recovery_factor": data.recovery_factor * 100,
    }
    primary_driver = min(drivers, key=drivers.get)
    return ReservoirFieldOutput(
        p90_recoverable_stb=round(base_recoverable * low_multiplier, 2),
        p50_recoverable_stb=round(base_recoverable, 2),
        p10_recoverable_stb=round(base_recoverable * high_multiplier, 2),
        base_ooip_stb=round(base_ooip, 2),
        recovery_efficiency=round(data.recovery_factor * 100, 2),
        primary_driver=primary_driver,
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


def build_project_cash_flows(data: ProjectEconomicsInput, price: float) -> tuple[list[float], list[dict[str, float | int]]]:
    flows = []
    schedule = []
    for year in range(1, data.project_years + 1):
        production = data.initial_production_bopd * 365 * ((1 - data.annual_decline_rate) ** (year - 1))
        revenue = production * price
        royalty = revenue * data.royalty_rate
        opex = production * data.opex_per_barrel
        taxable_income = max(revenue - royalty - opex, 0)
        tax = taxable_income * data.tax_rate
        abandonment = data.abandonment_cost if year == data.project_years else 0
        free_cash_flow = revenue - royalty - opex - tax - abandonment
        flows.append(free_cash_flow)
        schedule.append({
            "year": year,
            "production_stb": round(production, 2),
            "revenue": round(revenue, 2),
            "opex": round(opex, 2),
            "tax": round(tax, 2),
            "free_cash_flow": round(free_cash_flow, 2),
        })
    return flows, schedule


@app.post("/api/economics/project", response_model=ProjectEconomicsOutput)
def evaluate_project_economics(data: ProjectEconomicsInput):
    flows, schedule = build_project_cash_flows(data, data.oil_price)
    npv = discounted_value(data.capex, flows, data.discount_rate)
    irr = calculate_irr(data.capex, flows)
    cumulative = 0.0
    payback = None
    for year, cash_flow in enumerate(flows, start=1):
        previous = cumulative
        cumulative += cash_flow
        if cumulative >= data.capex and cash_flow > 0:
            payback = (year - 1) + ((data.capex - previous) / cash_flow)
            break

    sensitivities = []
    for label, price_factor, capex_factor in [
        ("Downside", 0.8, 1.15),
        ("Base", 1.0, 1.0),
        ("Upside", 1.2, 0.9),
    ]:
        scenario_flows, _ = build_project_cash_flows(data, data.oil_price * price_factor)
        scenario_npv = discounted_value(data.capex * capex_factor, scenario_flows, data.discount_rate)
        sensitivities.append({"scenario": label, "npv": round(scenario_npv, 2)})

    lower, upper = max(data.opex_per_barrel, 0.01), data.oil_price * 3
    for _ in range(80):
        midpoint = (lower + upper) / 2
        midpoint_flows, _ = build_project_cash_flows(data, midpoint)
        if discounted_value(data.capex, midpoint_flows, data.discount_rate) >= 0:
            upper = midpoint
        else:
            lower = midpoint

    return ProjectEconomicsOutput(
        npv=round(npv, 2),
        irr_percentage=round(irr * 100, 2) if irr is not None else None,
        payback_years=round(payback, 2) if payback is not None else None,
        total_production_stb=round(sum(row["production_stb"] for row in schedule), 2),
        total_free_cash_flow=round(sum(flows) - data.capex, 2),
        breakeven_price=round((lower + upper) / 2, 2),
        decision="sanction" if npv > 0 and payback is not None else "rework",
        annual_schedule=schedule,
        sensitivities=sensitivities,
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
                "consequence": scenario["consequence"],
                "residual_risk": 1 if correct else 4,
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
