from fastapi.testclient import TestClient

from api.index import app


client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


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
    assert result["breakeven_price"] > 18
