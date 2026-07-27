import os
from datetime import date
from math import isfinite

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
from api.catalog import (
    ECONOMIC_CASES, LOCATIONS, OPERATORS, PROJECT_PHASES, PROJECT_TYPES,
    RESERVOIR_CASES, RESERVOIR_TYPES, SOURCES,
)


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


class ComprehensiveReservesInput(BaseModel):
    fluid_type: str = Field(pattern="^(oil|gas)$")
    reservoir_type: str
    area_acres: float = Field(gt=0)
    gross_thickness_ft: float = Field(gt=0)
    net_to_gross: float = Field(gt=0, le=1)
    porosity: float = Field(gt=0, le=0.6)
    water_saturation: float = Field(ge=0, lt=1)
    formation_volume_factor: float = Field(gt=0)
    recovery_factor: float = Field(gt=0, le=1)
    uncertainty_percentage: float = Field(ge=0, le=40)


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


class IntegratedProjectInput(BaseModel):
    project_type: str
    phase: str
    capacity: float = Field(gt=0)
    capacity_unit: str
    utilization: float = Field(gt=0, le=1)
    unit_price: float = Field(gt=0)
    variable_cost: float = Field(ge=0)
    fixed_opex: float = Field(ge=0)
    capex: float = Field(gt=0)
    royalty_rate: float = Field(ge=0, lt=1)
    tax_rate: float = Field(ge=0, lt=1)
    discount_rate: float = Field(ge=0, lt=1)
    project_years: int = Field(ge=3, le=40)
    construction_years: int = Field(ge=1, le=8)
    decommissioning_cost: float = Field(ge=0)
    conversion_factor: float = Field(gt=0, default=1)
    environmental_cost: float = Field(ge=0, default=0)
    security_cost: float = Field(ge=0, default=0)
    local_content_cost: float = Field(ge=0, default=0)
    technology_cost: float = Field(ge=0, default=0)
    depreciation_years: int = Field(ge=1, le=40, default=10)


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
        "id": "gas_alarm", "title": "Alarme de gás no módulo de compressão",
        "location": "FLNG offshore · Bacia do Rovuma", "role": "Supervisor de área",
        "image": "/assets/hse/gas-alarm.png",
        "context": "Às 18:42, um detector fixo entra em alarme e a leitura portátil cresce de 5% para 12% LEL. O vento sopra em direção à rota mais curta.",
        "signals": ["12% LEL e a subir", "Vento para bombordo", "Compressor em operação"],
        "options": [
            {"id": "continue", "label": "Terminar a tarefa", "detail": "Manter a equipa no módulo por mais cinco minutos."},
            {"id": "evacuate", "label": "Parar, alertar e evacuar", "detail": "Usar a rota transversal contra o vento e comunicar à sala de controlo."},
            {"id": "investigate", "label": "Procurar a fuga", "detail": "Aproximar-se sozinho do compressor com o detector portátil."},
        ],
        "correct": "evacuate",
        "explanation": "O aumento da concentração invalida a condição de trabalho. A resposta protege pessoas e permite isolar o processo remotamente.",
        "consequence": "Uma permanência ou aproximação não autorizada pode colocar a equipa dentro da nuvem inflamável.",
    },
    {
        "id": "permit_change", "title": "Isolamento divergente na manutenção",
        "location": "Central de processamento · Sul de Moçambique", "role": "Responsável pela execução",
        "image": "/assets/hse/permit-change.png",
        "context": "A bomba P-204 está parada, mas a válvula marcada no campo não coincide com o certificado de isolamento. A produção pede rapidez.",
        "signals": ["Etiqueta divergente", "Linha pressurizada próxima", "Escopo da licença mudou"],
        "options": [
            {"id": "adapt", "label": "Adaptar no campo", "detail": "Aplicar um cadeado na válvula que parece correta."},
            {"id": "pause", "label": "Suspender e revalidar", "detail": "Parar, testar energia zero e corrigir isolamento e licença."},
            {"id": "verbal", "label": "Aceitar confirmação verbal", "detail": "Prosseguir com a indicação de um operador experiente."},
        ],
        "correct": "pause",
        "explanation": "A divergência elimina a confiança no isolamento. É necessário identificar positivamente o equipamento e provar energia zero.",
        "consequence": "Abrir equipamento ainda pressurizado pode causar libertação súbita de gás ou líquido.",
    },
    {
        "id": "spill_response", "title": "Película de hidrocarboneto no cais",
        "location": "Terminal de LNG · Costa da África Oriental", "role": "Operador de carregamento",
        "image": "/assets/hse/spill-response.png",
        "context": "Durante a transferência, observa uma película junto à drenagem. A origem parece ser a ligação da mangueira e não há vítimas.",
        "signals": ["Transferência ativa", "Dreno a menos de 2 m", "Kit de derrame disponível"],
        "options": [
            {"id": "wash", "label": "Lavar o pavimento", "detail": "Diluir a película com água até desaparecer."},
            {"id": "ignore", "label": "Monitorizar até ao fim", "detail": "Continuar a transferência e informar na passagem de turno."},
            {"id": "isolate", "label": "Parar, conter e comunicar", "detail": "Interromper a transferência, proteger o dreno e ativar a resposta."},
        ],
        "correct": "isolate",
        "explanation": "Controlar a fonte e proteger a drenagem limita a escalada antes da limpeza especializada.",
        "consequence": "O produto na água amplia o impacto ambiental e pode interromper toda a operação do terminal.",
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


@app.get("/api/catalog/mozambique")
def mozambique_catalog():
    return {
        "framework": "IM3 Framework v2",
        "disclaimer": "Os valores técnicos e comerciais são premissas pedagógicas, não reservas certificadas nem previsões dos operadores.",
        "operators": OPERATORS, "locations": LOCATIONS,
        "reservoir_types": RESERVOIR_TYPES, "reservoir_cases": RESERVOIR_CASES,
        "project_types": PROJECT_TYPES, "project_phases": PROJECT_PHASES,
        "economic_cases": ECONOMIC_CASES, "sources": SOURCES,
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


@app.post("/api/reserves/comprehensive")
def evaluate_comprehensive_reserves(data: ComprehensiveReservesInput):
    net_pay = data.gross_thickness_ft * data.net_to_gross
    constant = 7758 if data.fluid_type == "oil" else 43560
    in_place = (
        constant * data.area_acres * net_pay * data.porosity
        * (1 - data.water_saturation) / data.formation_volume_factor
    )
    recoverable = in_place * data.recovery_factor
    spread = data.uncertainty_percentage / 100
    unit = "STB" if data.fluid_type == "oil" else "scf"
    warnings = []
    if data.fluid_type == "gas" and data.formation_volume_factor > 0.02:
        warnings.append("Bg parece elevado para rb/scf; confirme a unidade.")
    if data.fluid_type == "oil" and data.formation_volume_factor < 0.8:
        warnings.append("Bo parece baixo para rb/STB; confirme a unidade.")
    return {
        "fluid_type": data.fluid_type, "reservoir_type": data.reservoir_type,
        "volume_in_place": round(in_place, 2),
        "recoverable_p90": round(recoverable * (1 - spread), 2),
        "recoverable_p50": round(recoverable, 2),
        "recoverable_p10": round(recoverable * (1 + spread), 2),
        "unit": unit, "net_pay_ft": round(net_pay, 2),
        "recovery_efficiency": round(data.recovery_factor * 100, 2),
        "warnings": warnings,
    }


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


def integrated_cash_flows(data: IntegratedProjectInput, price_factor: float = 1.0, capex_factor: float = 1.0):
    base_year = date.today().year
    initial = data.capex * capex_factor / data.construction_years
    depreciable_base = data.capex * capex_factor
    annual_depreciation = depreciable_base / min(data.depreciation_years, data.project_years)
    flows = []
    schedule = [{
        "Year": base_year, "Project_Year": 0, "Stage": "Construção", "Volume": 0,
        "Net_Price_For_DCF": round(data.unit_price * price_factor, 4),
        "Conversion_Factor": data.conversion_factor, "Revenue_USD": 0,
        "CAPEX_USD": round(initial, 2), "OPEX_USD": 0,
        "Environmental_Cost_USD": 0, "Security_Cost_USD": 0,
        "Local_Content_Cost_USD": 0, "Technology_Cost_USD": 0,
        "Decommissioning_Cost_USD": 0, "Total_Cash_Cost_USD": round(initial, 2),
        "Depreciable_CAPEX_Base_USD": round(depreciable_base, 2), "Depreciation_USD": 0,
        "EBITDA_USD": 0, "EBIT_USD": 0, "Tax_USD": 0,
        "Free_Cash_Flow_USD": round(-initial, 2), "Discount_Rate": data.discount_rate,
        "Discount_Factor": 1, "PV_FCF_USD": round(-initial, 2),
        "Cumulative_FCF_USD": round(-initial, 2), "Cumulative_PV_FCF_USD": round(-initial, 2),
        "NPV_To_Date_USD": round(-initial, 2), "Decision_Flag": "CONSTRUCT",
    }]
    cumulative_fcf = -initial
    cumulative_pv = -initial
    for year in range(1, data.construction_years):
        construction_capex = data.capex * capex_factor / data.construction_years
        flows.append(-construction_capex)
        discount_factor = 1 / ((1 + data.discount_rate) ** year)
        pv_fcf = -construction_capex * discount_factor
        cumulative_fcf -= construction_capex
        cumulative_pv += pv_fcf
        schedule.append({
            "Year": base_year + year, "Project_Year": year, "Stage": "Construção", "Volume": 0,
            "Net_Price_For_DCF": round(data.unit_price * price_factor, 4),
            "Conversion_Factor": data.conversion_factor, "Revenue_USD": 0,
            "CAPEX_USD": round(construction_capex, 2), "OPEX_USD": 0,
            "Environmental_Cost_USD": 0, "Security_Cost_USD": 0,
            "Local_Content_Cost_USD": 0, "Technology_Cost_USD": 0,
            "Decommissioning_Cost_USD": 0, "Total_Cash_Cost_USD": round(construction_capex, 2),
            "Depreciable_CAPEX_Base_USD": round(depreciable_base, 2), "Depreciation_USD": 0,
            "EBITDA_USD": 0, "EBIT_USD": 0, "Tax_USD": 0,
            "Free_Cash_Flow_USD": round(-construction_capex, 2), "Discount_Rate": data.discount_rate,
            "Discount_Factor": round(discount_factor, 8), "PV_FCF_USD": round(pv_fcf, 2),
            "Cumulative_FCF_USD": round(cumulative_fcf, 2),
            "Cumulative_PV_FCF_USD": round(cumulative_pv, 2),
            "NPV_To_Date_USD": round(cumulative_pv, 2), "Decision_Flag": "CONSTRUCT",
        })
    for operation_year in range(1, data.project_years + 1):
        calendar_year = data.construction_years - 1 + operation_year
        ramp = 0.65 if operation_year == 1 else 0.85 if operation_year == 2 else 1.0
        volume = data.capacity * data.utilization * ramp
        net_price = data.unit_price * price_factor
        revenue = volume * data.conversion_factor * net_price
        royalty = revenue * data.royalty_rate
        opex = volume * data.variable_cost + data.fixed_opex
        environmental = data.environmental_cost
        security = data.security_cost
        local_content = data.local_content_cost
        technology = data.technology_cost
        decom = data.decommissioning_cost if operation_year == data.project_years else 0
        depreciation = annual_depreciation if operation_year <= data.depreciation_years else 0
        total_cash_cost = royalty + opex + environmental + security + local_content + technology + decom
        ebitda = revenue - royalty - opex - environmental - security - local_content - technology
        ebit = ebitda - depreciation
        tax = max(ebit, 0) * data.tax_rate
        cash = ebitda - tax - decom
        flows.append(cash)
        discount_factor = 1 / ((1 + data.discount_rate) ** calendar_year)
        pv_fcf = cash * discount_factor
        cumulative_fcf += cash
        cumulative_pv += pv_fcf
        schedule.append({
            "Year": base_year + calendar_year, "Project_Year": calendar_year,
            "Stage": "Operação", "Volume": round(volume, 2),
            "Net_Price_For_DCF": round(net_price, 4), "Conversion_Factor": data.conversion_factor,
            "Revenue_USD": round(revenue, 2), "CAPEX_USD": 0, "OPEX_USD": round(opex, 2),
            "Environmental_Cost_USD": round(environmental, 2),
            "Security_Cost_USD": round(security, 2),
            "Local_Content_Cost_USD": round(local_content, 2),
            "Technology_Cost_USD": round(technology, 2),
            "Decommissioning_Cost_USD": round(decom, 2),
            "Total_Cash_Cost_USD": round(total_cash_cost, 2),
            "Depreciable_CAPEX_Base_USD": round(depreciable_base, 2),
            "Depreciation_USD": round(depreciation, 2), "EBITDA_USD": round(ebitda, 2),
            "EBIT_USD": round(ebit, 2), "Tax_USD": round(tax, 2),
            "Free_Cash_Flow_USD": round(cash, 2), "Discount_Rate": data.discount_rate,
            "Discount_Factor": round(discount_factor, 8), "PV_FCF_USD": round(pv_fcf, 2),
            "Cumulative_FCF_USD": round(cumulative_fcf, 2),
            "Cumulative_PV_FCF_USD": round(cumulative_pv, 2),
            "NPV_To_Date_USD": round(cumulative_pv, 2),
            "Decision_Flag": "INVEST_CONTINUE" if cumulative_pv >= 0 else "REVIEW_STAGE_GATE",
        })
    return initial, flows, schedule


@app.post("/api/economics/integrated-project")
def evaluate_integrated_project(data: IntegratedProjectInput):
    initial, flows, schedule = integrated_cash_flows(data)
    npv = discounted_value(initial, flows, data.discount_rate)
    irr = calculate_irr(initial, flows)
    cumulative = -initial
    payback = None
    for row in schedule[1:]:
        previous = cumulative
        cumulative += row["Free_Cash_Flow_USD"]
        if cumulative >= 0 and row["Free_Cash_Flow_USD"] > 0:
            payback = row["Project_Year"] - 1 + (-previous / row["Free_Cash_Flow_USD"])
            break
    sensitivities = []
    for label, price_factor, capex_factor in [
        ("Stress", 0.75, 1.20), ("Base", 1.0, 1.0), ("Upside", 1.20, 0.90),
    ]:
        scenario_initial, scenario_flows, _ = integrated_cash_flows(data, price_factor, capex_factor)
        sensitivities.append({
            "scenario": label,
            "npv": round(discounted_value(scenario_initial, scenario_flows, data.discount_rate), 2),
        })
    lower, upper = 0.1, 3.0
    for _ in range(70):
        midpoint = (lower + upper) / 2
        scenario_initial, scenario_flows, _ = integrated_cash_flows(data, midpoint, 1.0)
        if discounted_value(scenario_initial, scenario_flows, data.discount_rate) >= 0:
            upper = midpoint
        else:
            lower = midpoint
    breakeven_price = data.unit_price * ((lower + upper) / 2)
    return {
        "npv": round(npv, 2),
        "irr_percentage": round(irr * 100, 2) if irr is not None else None,
        "payback_years": round(payback, 2) if payback is not None else None,
        "breakeven_price": round(breakeven_price, 2),
        "decision": "invest_continue" if npv > 0 else "review_stage_gate",
        "annual_schedule": schedule, "sensitivities": sensitivities,
    }


@app.get("/api/hse/scenarios")
def get_hse_scenarios():
    return [
        {key: value for key, value in scenario.items()
         if key not in {"correct", "explanation", "consequence"}}
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
