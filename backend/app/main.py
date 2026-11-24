"""
Punto de entrada de la API FastAPI.
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import CORS_ORIGINS
from app.core.database import crear_admin_si_no_existe, init_db

# Importamos todas las rutas
from app.api.routes import auth, usuarios, manifiestos, rutas

logger = logging.getLogger(__name__)

# Sin esto los logger.info() de la app no llegan a los logs del servidor.
logging.basicConfig(level=logging.INFO)


def _crear_admin_desde_entorno() -> None:
    """Crea el admin inicial si ADMIN_USERNAME y ADMIN_PASSWORD están definidas."""
    usuario = (os.getenv("ADMIN_USERNAME") or "").strip()
    password = os.getenv("ADMIN_PASSWORD") or ""
    if not usuario or not password.strip():
        return

    if crear_admin_si_no_existe(usuario, password):
        logger.info("Creado el usuario inicial '%s' al arrancar", usuario)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Prepara la base de datos antes de aceptar peticiones."""
    init_db()
    _crear_admin_desde_entorno()
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
    # La sesión viaja en una cookie httpOnly, así que el navegador necesita
    # permiso para enviar credenciales desde el origen del frontend.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Incluir routers (Todos con el prefijo /api) ---
app.include_router(auth.router, prefix="/api")
app.include_router(usuarios.router, prefix="/api")
app.include_router(manifiestos.router, prefix="/api")
app.include_router(rutas.router, prefix="/api")

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