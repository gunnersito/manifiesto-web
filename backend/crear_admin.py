"""
Crea el usuario admin inicial en la base de datos (ADMIN_USERNAME o 'admin').

La contraseña se toma de la variable de entorno ADMIN_PASSWORD o se pide por
consola (sin mostrarla); nunca se escribe en el código ni se imprime.

El esquema lo gestiona app.core.database.init_db(), que es la única fuente de
verdad de las tablas.
"""
import getpass
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from app.core.database import crear_admin_si_no_existe, init_db, usuario_existe

# Este script no pasa por config.py ni necesita SECRET_KEY, así que carga el
# backend/.env por su cuenta para encontrar DATABASE_URL.
load_dotenv(Path(__file__).resolve().parent / ".env")


def leer_password(usuario: str = "admin") -> str:
    """Devuelve la contraseña desde ADMIN_PASSWORD o pidiéndola por consola."""
    password = os.getenv("ADMIN_PASSWORD")

    if password is None:
        if not sys.stdin.isatty():
            raise SystemExit(
                "Define la variable de entorno ADMIN_PASSWORD o ejecuta el script "
                "en una terminal interactiva para escribir la contraseña."
            )
        password = getpass.getpass(f"Contraseña para el usuario '{usuario}': ")
        if password != getpass.getpass("Repite la contraseña: "):
            raise SystemExit("Las contraseñas no coinciden.")

    if not password.strip():
        raise SystemExit("La contraseña no puede estar vacía.")

    return password


def main() -> None:
    print("Conectando a la base de datos...")

    # 1. Crea todas las tablas necesarias si no existen
    init_db()

    # 2. Crea al admin si todavía no existe (sin pedir contraseña de más)
    usuario = (os.getenv("ADMIN_USERNAME") or "admin").strip()
    if usuario_existe(usuario):
        print(f"El usuario '{usuario}' ya existe.")
        return

    if crear_admin_si_no_existe(usuario, leer_password(usuario)):
        print(f"✅ Usuario '{usuario}' creado correctamente.")
    else:
        print(f"El usuario '{usuario}' ya existe.")


if __name__ == "__main__":
    main()
    print("¡Proceso terminado con éxito!")
