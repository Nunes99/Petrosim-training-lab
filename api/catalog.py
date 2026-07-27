"""Training presets based on the IM3 framework and public INP information.

Technical and commercial values are explicitly pedagogical assumptions. They
must not be interpreted as certified reserves or operator forecasts.
"""

SOURCES = [
    {
        "label": "INP — Pesquisa e Produção",
        "url": "https://inp.gov.mz/pesquisa-e-producao/",
    },
    {
        "label": "INP — Projectos",
        "url": "https://www.inp.gov.mz/en/projectos/",
    },
    {
        "label": "INP — Oportunidades de investimento",
        "url": "https://www.inp.gov.mz/oportunidades-de-investimento/",
    },
]

OPERATORS = [
    "TotalEnergies", "Mozambique Rovuma Venture (Eni/ExxonMobil/CNODC)",
    "ENH", "Sasol", "CNOOC", "Buzi Hydrocarbons", "AITEO", "Outro",
]

LOCATIONS = [
    "Bacia do Rovuma", "Área 1", "Área 4", "Coral South", "Coral North",
    "Temane", "Pande", "Inhassoro", "Buzi", "Bacia de Moçambique",
    "Bacia de Angoche", "Palma/Afungi", "Maputo", "Beira",
]

RESERVOIR_TYPES = [
    {"id": "dry_gas", "label": "Gás seco", "fluid": "gas"},
    {"id": "gas_condensate", "label": "Gás-condensado", "fluid": "gas"},
    {"id": "volatile_oil", "label": "Óleo volátil", "fluid": "oil"},
    {"id": "black_oil", "label": "Óleo negro", "fluid": "oil"},
    {"id": "heavy_oil", "label": "Óleo pesado", "fluid": "oil"},
    {"id": "fractured", "label": "Carbonato fraturado", "fluid": "oil"},
    {"id": "tight_gas", "label": "Gás de baixa permeabilidade", "fluid": "gas"},
]

RESERVOIR_CASES = [
    {
        "id": "area4_coral", "name": "Área 4 — Coral / Mamba",
        "location": "Área 4", "operator": "Mozambique Rovuma Venture (Eni/ExxonMobil/CNODC)",
        "reservoir_type": "gas_condensate", "fluid_type": "gas",
        "area_acres": 36000, "gross_thickness_ft": 220, "net_to_gross": 0.68,
        "porosity": 0.22, "water_saturation": 0.24, "formation_volume_factor": 0.0048,
        "recovery_factor": 0.72, "uncertainty_percentage": 18,
        "note": "Caso didático inspirado em reservatórios offshore profundos da Área 4; parâmetros não são reservas certificadas.",
    },
    {
        "id": "area1_golfinho", "name": "Área 1 — Golfinho/Atum",
        "location": "Área 1", "operator": "TotalEnergies",
        "reservoir_type": "dry_gas", "fluid_type": "gas",
        "area_acres": 42000, "gross_thickness_ft": 190, "net_to_gross": 0.72,
        "porosity": 0.24, "water_saturation": 0.27, "formation_volume_factor": 0.0052,
        "recovery_factor": 0.74, "uncertainty_percentage": 20,
        "note": "Caso didático de gás offshore profundo da Área 1; parâmetros são premissas de treino.",
    },
    {
        "id": "pande", "name": "Pande — gás onshore maduro",
        "location": "Pande", "operator": "Sasol",
        "reservoir_type": "dry_gas", "fluid_type": "gas",
        "area_acres": 15000, "gross_thickness_ft": 95, "net_to_gross": 0.63,
        "porosity": 0.19, "water_saturation": 0.31, "formation_volume_factor": 0.0061,
        "recovery_factor": 0.66, "uncertainty_percentage": 14,
        "note": "Modelo pedagógico de campo onshore maduro com foco em reservas remanescentes.",
    },
    {
        "id": "inhassoro", "name": "Inhassoro — gás e condensado",
        "location": "Inhassoro", "operator": "Sasol",
        "reservoir_type": "gas_condensate", "fluid_type": "gas",
        "area_acres": 11000, "gross_thickness_ft": 115, "net_to_gross": 0.58,
        "porosity": 0.20, "water_saturation": 0.29, "formation_volume_factor": 0.0058,
        "recovery_factor": 0.62, "uncertainty_percentage": 17,
        "note": "Modelo pedagógico para discutir condensado, recuperação e incerteza onshore.",
    },
    {
        "id": "manual", "name": "Inserir dados manualmente",
        "location": "Definida pelo estudante", "operator": "Outro",
        "reservoir_type": "black_oil", "fluid_type": "oil",
        "area_acres": 5000, "gross_thickness_ft": 80, "net_to_gross": 0.65,
        "porosity": 0.18, "water_saturation": 0.30, "formation_volume_factor": 1.25,
        "recovery_factor": 0.32, "uncertainty_percentage": 20,
        "note": "Modo livre: edite todos os parâmetros e documente a origem das premissas.",
    },
]

PROJECT_TYPES = [
    "FLNG", "LNG", "Gas-to-Power", "Pipeline", "Refinery", "Petrochemical",
    "Gas Distribution", "Storage", "Gas Processing Plant", "Fertilizer",
    "CCUS", "Hydrogen", "Upstream Oil", "Upstream Gas", "Other",
]

PROJECT_PHASES = [
    "Concept", "Pre-FEED", "FEED", "FID", "Construction", "Commissioning",
    "Operation", "Expansion", "Decommissioning",
]

ECONOMIC_CASES = [
    {
        "id": "coral_flng", "name": "Coral South — FLNG (treino)", "project_type": "FLNG",
        "phase": "Operation", "location": "Coral South", "operator": "Mozambique Rovuma Venture (Eni/ExxonMobil/CNODC)",
        "capacity": 3400000, "capacity_unit": "t LNG/ano", "utilization": 0.90,
        "unit_price": 540, "variable_cost": 145, "fixed_opex": 260000000,
        "capex": 7000000000, "royalty_rate": 0.02, "tax_rate": 0.32,
        "discount_rate": 0.12, "project_years": 20, "construction_years": 4,
        "decommissioning_cost": 450000000,
    },
    {
        "id": "moz_lng", "name": "Mozambique LNG — Área 1 (treino)", "project_type": "LNG",
        "phase": "Construction", "location": "Palma/Afungi", "operator": "TotalEnergies",
        "capacity": 12880000, "capacity_unit": "t LNG/ano", "utilization": 0.88,
        "unit_price": 525, "variable_cost": 155, "fixed_opex": 650000000,
        "capex": 20000000000, "royalty_rate": 0.02, "tax_rate": 0.32,
        "discount_rate": 0.12, "project_years": 25, "construction_years": 5,
        "decommissioning_cost": 900000000,
    },
    {
        "id": "temane_power", "name": "Temane — Gás para eletricidade (treino)", "project_type": "Gas-to-Power",
        "phase": "Operation", "location": "Temane", "operator": "Sasol",
        "capacity": 3940000, "capacity_unit": "MWh/ano", "utilization": 0.86,
        "unit_price": 92, "variable_cost": 38, "fixed_opex": 36000000,
        "capex": 650000000, "royalty_rate": 0, "tax_rate": 0.32,
        "discount_rate": 0.12, "project_years": 20, "construction_years": 3,
        "decommissioning_cost": 35000000,
    },
    {
        "id": "fertilizer", "name": "Fertilizantes de gás — Beira (conceito)", "project_type": "Fertilizer",
        "phase": "Concept", "location": "Beira", "operator": "ENH",
        "capacity": 1200000, "capacity_unit": "t ureia/ano", "utilization": 0.84,
        "unit_price": 390, "variable_cost": 185, "fixed_opex": 78000000,
        "capex": 2200000000, "royalty_rate": 0, "tax_rate": 0.32,
        "discount_rate": 0.14, "project_years": 20, "construction_years": 4,
        "decommissioning_cost": 100000000,
    },
    {
        "id": "manual", "name": "Projeto personalizado", "project_type": "Other",
        "phase": "Concept", "location": "Maputo", "operator": "Outro",
        "capacity": 1000000, "capacity_unit": "unidades/ano", "utilization": 0.90,
        "unit_price": 100, "variable_cost": 35, "fixed_opex": 10000000,
        "capex": 250000000, "royalty_rate": 0.02, "tax_rate": 0.32,
        "discount_rate": 0.12, "project_years": 20, "construction_years": 3,
        "decommissioning_cost": 20000000,
    },
]
