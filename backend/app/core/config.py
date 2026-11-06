"""
Configuración global del backend.
"""
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
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

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
# En producción, cambia esta clave secreta por una larga y aleatoria
SECRET_KEY = "super-secreto-manifiesto-web-2026-cambiar-en-produccion"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días de sesión

# Credenciales de los usuarios
USUARIOS = {
    "admin": {
        "password": "Admin123.", # Cambia esto por tu contraseña segura
        "role": "admin"
    },
    "guest": {
        "password": "guest123", # Cambia esto por la contraseña para invitados
        "role": "guest"
    }
}