"""
Configuración global del backend.
"""
import os
from pathlib import Path

# --- Rutas ---
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
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
ORDEN_PROVINCIAS = [
    "Pinar del Río", "Pinar del Rio",
    "Artemisa",
    "La Habana",
    "Mayabeque",
    "Matanzas",
    "Cienfuegos",
    "Villa Clara",
    "Sancti Spíritus", "Sancti Spiritus",
    "Ciego de Ávila", "Ciego de Avila",
    "Camagüey", "Camaguey",
    "Las Tunas",
    "Holguín", "Holguin",
    "Granma",
    "Santiago de Cuba",
    "Guantánamo", "Guantanamo",
    "Isla de la Juventud",
]

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