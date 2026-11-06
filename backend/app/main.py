"""
Punto de entrada de la API FastAPI.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import init_db

# Importamos todas las rutas
from app.api.routes import auth, usuarios, manifiestos

# --- Crear la app ---
app = FastAPI(
    title="Manifiesto API",
    description="API para el análisis de manifiestos de entrega",
    version="0.1.0",
)

# --- CORS (Configuración forzada para producción) ---
# Ponemos la URL exacta de Vercel para que no falle por la variable CORS_ORIGINS
origins = [
    "https://manifiesto-80y4b5dr3-manifiesto1.vercel.app", # 👈 Tu URL de Vercel
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # 👈 Usamos la lista directamente
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Inicializar la base de datos al arrancar ---
@app.on_event("startup")
def on_startup():
    init_db()

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