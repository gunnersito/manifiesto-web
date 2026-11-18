"""
Configuración global del backend.
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv

# --- Rutas ---
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/

# Se carga antes de leer cualquier variable, para que backend/.env sirva también
# para SECRET_KEY y CORS_ORIGINS. Las variables reales del entorno mandan: en
# Render o Vercel, load_dotenv no las sobrescribe.
load_dotenv(BASE_DIR / ".env")

DB_PATH = BASE_DIR / "entregas.db"

# --- Fuzzy matching ---
UMBRAL_SIMILITUD = 0.90

# --- Columnas del manifiesto ---
COL_HBL = "HBL Número"
COL_BULTOS = "Bultos (Cant.)"
COL_DIRECCION = "Direccion del destinatario"
COL_PROVINCIA = "Provincia"
COL_MUNICIPIO = "Municipio"
COL_PARADAS = "Paradas"

# --- Estados de entrega ---
ESTADOS = ["Pendiente", "Despachada", "Devuelto Almacén", "Entregada"]
ESTADO_DEFAULT = "Pendiente"

# --- Usuario (temporal, hasta que haya login) ---
USUARIO_ACTUAL = "operador"

# --- CORS (para el frontend) ---
# Lista de orígenes permitidos. Se puede sobrescribir sin tocar código con la
# variable de entorno CORS_ORIGINS (varios orígenes separados por comas).
CORS_ORIGINS_DEFAULT = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://manifiesto-80y4b5dr3-manifiesto1.vercel.app",
]

CORS_ORIGINS = [
    origen.strip().rstrip("/")
    for origen in os.getenv("CORS_ORIGINS", "").split(",")
    if origen.strip()
] or CORS_ORIGINS_DEFAULT

# --- Orden de columnas de salida ---
ORDEN_COLUMNAS_SALIDA = [
    "HBL Número",
    "Bultos (Cant.)",
    "Peso (Kg)",
    "M3",
    "Nombre y Apellidos del REMITENTE:",
    "Nombre y Apellidos del DESTINATARIO:",
    "Direccion del destinatario",
    "Provincia",
    "Municipio",
    "Teléfono del DESTINATARIO",
    "DNI/PASAPORTE:",
    "No. de Carnet de Identidad:",
    "Correo electrónico",
    "Contenido del paquete (Descripción)",
    "Categoría/Operación",
    "Paradas",
    "Estado",
]

# --- Orden de provincias (oeste → este) ---
# Fuente única compartida con el frontend: orden-provincias.json en la raíz del
# repo. Se puede apuntar a otro sitio con ORDEN_PROVINCIAS_PATH.
ORDEN_PROVINCIAS_PATH = Path(
    os.getenv("ORDEN_PROVINCIAS_PATH", str(BASE_DIR.parent / "orden-provincias.json"))
)
ORDEN_PROVINCIAS = json.loads(ORDEN_PROVINCIAS_PATH.read_text(encoding="utf-8"))

# ============================================================
# SEGURIDAD Y AUTENTICACIÓN (JWT)
# ============================================================
# La clave secreta NUNCA se escribe en el código: se lee de la variable de
# entorno SECRET_KEY (Render/Vercel o backend/.env). Sin ella la API no arranca.
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "Falta la variable de entorno SECRET_KEY. Defínela con un valor largo y "
        "aleatorio antes de arrancar la API (por ejemplo en Render o en backend/.env)."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días de sesión

# ============================================================
# SUPABASE STORAGE
# ============================================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --- Base de datos ---
DATABASE_URL = os.getenv("DATABASE_URL")