from math import isfinite

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


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


@app.get("/")
def root():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }


@app.post("/reserves/oil", response_model=OilReservesOutput)
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