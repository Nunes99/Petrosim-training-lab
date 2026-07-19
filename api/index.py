from fastapi import FastAPI

app = FastAPI(
    title="PetroSim Training Lab API",
    version="0.1.0",
)


@app.get("/")
def root():
    return {
        "application": "PetroSim Training Lab",
        "status": "running",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "petrosim-api",
        "version": "0.1.0",
    }