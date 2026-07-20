from math import isfinite

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(
    title="PetroSim Training Lab API",
    description="Scientific calculation engine for petroleum and gas training.",
    version="0.1.0",
)


class OilReservesInput(BaseModel):
    area_acres: float = Field(gt=0, description="Reservoir area in acres")
    net_pay_ft: float = Field(gt=0, description="Net reservoir thickness in feet")
    porosity: float = Field(gt=0, le=1, description="Porosity as a fraction")
    water_saturation: float = Field(ge=0, lt=1, description="Water saturation")
    formation_volume_factor: float = Field(
        gt=0,
        description="Oil formation volume factor, Bo",
    )
    recovery_factor: float = Field(
        ge=0,
        le=1,
        description="Recovery factor as a fraction",
    )


class OilReservesOutput(BaseModel):
    ooip_stb: float
    recoverable_reserves_stb: float
    unrecovered_volume_stb: float
    recovery_percentage: float


@app.get("/")
def root():
    return {
        "application": "PetroSim Training Lab",
        "api_version": "0.1.0",
        "status": "running",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }


@app.post("/api/reserves/oil", response_model=OilReservesOutput)
def calculate_oil_reserves(data: OilReservesInput):
    """
    Calculate original oil in place using the volumetric method.

    OOIP = 7758 × A × h × φ × (1 - Sw) / Bo
    """

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

    if not all(isfinite(value) for value in [ooip, recoverable, unrecovered]):
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