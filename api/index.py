from fastapi import FastAPI

app = FastAPI(
    title="PetroSim Training Lab API",
    version="0.1.0",
)


@app.get("/")
def root():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }


@app.get("/api/index")
def index_health():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }