"""
Punto de entrada de la API FastAPI.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import CORS_ORIGINS
from app.core.database import init_db

# Importamos todas las rutas
from app.api.routes import auth, usuarios, manifiestos


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Crea las tablas que falten antes de aceptar peticiones."""
    init_db()
    yield


# --- Crear la app ---
app = FastAPI(
    title="Manifiesto API",
    description="API para el análisis de manifiestos de entrega",
    version="0.1.0",
    lifespan=lifespan,
)

# --- CORS ---
# Solo se aceptan peticiones desde los orígenes configurados en CORS_ORIGINS
# (backend/app/core/config.py), que se pueden sobrescribir con la variable de
# entorno CORS_ORIGINS separada por comas.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Incluir routers (Todos con el prefijo /api) ---
app.include_router(auth.router, prefix="/api")
app.include_router(usuarios.router, prefix="/api")
app.include_router(manifiestos.router, prefix="/api")

# --- Endpoint de prueba ---
@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "API de Manifiestos funcionando correctamente",
        "version": "0.1.0",
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}