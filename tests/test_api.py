from fastapi.testclient import TestClient

from api.index import (
    ECONOMICS_ACCESS,
    HSE_ACCESS,
    RESERVES_ACCESS,
    app,
    require_authenticated_user,
)


client = TestClient(app)
app.dependency_overrides[require_authenticated_user] = lambda: {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "student@example.com",
}
app.dependency_overrides[RESERVES_ACCESS] = app.dependency_overrides[require_authenticated_user]
app.dependency_overrides[ECONOMICS_ACCESS] = app.dependency_overrides[require_authenticated_user]
app.dependency_overrides[HSE_ACCESS] = app.dependency_overrides[require_authenticated_user]


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_certificate_qr_is_printable_svg():
    response = client.get(
        "/api/certificates/qr",
        params={"target": "https://petrosim-training-lab.vercel.app/certificate?code=PSL-2026-TESTE"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert response.content.startswith(b"<?xml")
    assert b"<svg" in response.content


def test_certificate_qr_rejects_non_web_targets():
    response = client.get(
        "/api/certificates/qr",
        params={"target": "javascript:alert(1)"},
    )
    assert response.status_code == 422


def test_laboratory_api_requires_login():
    override = app.dependency_overrides.pop(require_authenticated_user)
    try:
        response = client.get("/api/catalog/mozambique")
        assert response.status_code == 401
        assert response.json()["detail"] == "Inicie sessão para aceder aos laboratórios."
    finally:
        app.dependency_overrides[require_authenticated_user] = override


def test_oil_reserves_calculation():
    response = client.post(
        "/api/reserves/oil",
        json={
            "area_acres": 5000,
            "net_pay_ft": 40,
            "porosity": 0.22,
            "water_saturation": 0.28,
            "formation_volume_factor": 1.25,
            "recovery_factor": 0.35,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["ooip_stb"] == 196618752.0
    assert result["recoverable_reserves_stb"] == 68816563.2


def test_rejects_invalid_porosity():
    response = client.post(
        "/api/reserves/oil",
        json={
            "area_acres": 5000,
            "net_pay_ft": 40,
            "porosity": 1.1,
            "water_saturation": 0.28,
            "formation_volume_factor": 1.25,
            "recovery_factor": 0.35,
        },
    )
    assert response.status_code == 422


def test_petroleum_economics_evaluation():
    response = client.post(
        "/api/economics/evaluate",
        json={
            "initial_investment": 1000000,
            "annual_cash_flows": [300000, 350000, 400000, 450000],
            "discount_rate": 0.1,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["npv"] > 0
    assert result["irr_percentage"] > 10
    assert result["payback_years"] is not None
    assert result["decision"] == "economically_attractive"


def test_hse_decision_evaluation():
    response = client.post(
        "/api/hse/evaluate",
        json={
            "answers": {
                "gas_alarm": "evacuate",
                "permit_change": "pause",
                "spill_response": "isolate",
            }
        },
    )
    assert response.status_code == 200
    assert response.json()["percentage"] == 100
    assert response.json()["level"] == "proficient"


def test_reservoir_field_uncertainty_range():
    response = client.post(
        "/api/reserves/field-study",
        json={
            "area_acres": 5000,
            "net_pay_ft": 40,
            "net_to_gross": 0.78,
            "porosity": 0.22,
            "water_saturation": 0.28,
            "formation_volume_factor": 1.25,
            "recovery_factor": 0.35,
            "uncertainty_percentage": 15,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["p90_recoverable_stb"] < result["p50_recoverable_stb"]
    assert result["p50_recoverable_stb"] < result["p10_recoverable_stb"]


def test_advanced_project_economics_schedule():
    response = client.post(
        "/api/economics/project",
        json={
            "capex": 85000000,
            "oil_price": 72,
            "initial_production_bopd": 8500,
            "annual_decline_rate": 0.14,
            "opex_per_barrel": 18,
            "royalty_rate": 0.1,
            "tax_rate": 0.3,
            "discount_rate": 0.1,
            "project_years": 8,
            "abandonment_cost": 12000000,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert len(result["annual_schedule"]) == 8
    assert len(result["sensitivities"]) == 3


def test_mozambique_catalog_contains_training_cases():
    response = client.get("/api/catalog/mozambique")
    assert response.status_code == 200
    result = response.json()
    assert result["framework"] == "IM3 Framework v2"
    assert len(result["reservoir_cases"]) >= 5
    assert "FLNG" in result["project_types"]
    assert "premissas pedagógicas" in result["disclaimer"]


def test_comprehensive_gas_reserves():
    response = client.post(
        "/api/reserves/comprehensive",
        json={
            "fluid_type": "gas",
            "reservoir_type": "dry_gas",
            "area_acres": 1000,
            "gross_thickness_ft": 100,
            "net_to_gross": 0.7,
            "porosity": 0.2,
            "water_saturation": 0.25,
            "formation_volume_factor": 0.005,
            "recovery_factor": 0.7,
            "uncertainty_percentage": 20,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["unit"] == "scf"
    assert result["recoverable_p90"] < result["recoverable_p50"] < result["recoverable_p10"]


def test_integrated_economics_covers_construction_and_operation():
    response = client.post(
        "/api/economics/integrated-project",
        json={
            "project_type": "Gas-to-Power", "phase": "Concept",
            "capacity": 1000000, "capacity_unit": "MWh/ano",
            "utilization": 0.85, "unit_price": 100, "variable_cost": 30,
            "fixed_opex": 5000000, "capex": 200000000,
            "royalty_rate": 0, "tax_rate": 0.32, "discount_rate": 0.12,
            "project_years": 15, "construction_years": 3,
            "decommissioning_cost": 10000000,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert len(result["annual_schedule"]) == 18
    assert result["annual_schedule"][0]["Stage"] == "Construção"
    assert result["annual_schedule"][0]["Year"] >= 2026
    assert "Net_Price_For_DCF" in result["annual_schedule"][-1]
    assert "Cumulative_PV_FCF_USD" in result["annual_schedule"][-1]
    assert len(result["sensitivities"]) == 3
    assert result["breakeven_price"] > 18
