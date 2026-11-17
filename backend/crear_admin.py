"""
Crea el usuario 'admin' inicial en la base de datos.

La contraseña se toma de la variable de entorno ADMIN_PASSWORD o se pide por
consola (sin mostrarla); nunca se escribe en el código ni se imprime.

El esquema lo gestiona app.core.database.init_db(), que es la única fuente de
verdad de las tablas.
"""
import getpass
import os
import sys

from app.core.database import encriptar_password, get_db_connection, init_db


def leer_password() -> str:
    """Devuelve la contraseña desde ADMIN_PASSWORD o pidiéndola por consola."""
    password = os.getenv("ADMIN_PASSWORD")

    if password is None:
        if not sys.stdin.isatty():
            raise SystemExit(
                "Define la variable de entorno ADMIN_PASSWORD o ejecuta el script "
                "en una terminal interactiva para escribir la contraseña."
            )
        password = getpass.getpass("Contraseña para el usuario 'admin': ")
        if password != getpass.getpass("Repite la contraseña: "):
            raise SystemExit("Las contraseñas no coinciden.")

    if not password.strip():
        raise SystemExit("La contraseña no puede estar vacía.")

    return password


def main() -> None:
    print("Conectando a la base de datos...")

    # 1. Crea todas las tablas necesarias si no existen
    init_db()

    # 2. Crea al admin si todavía no existe
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM usuarios WHERE username = 'admin'")
            if cursor.fetchone():
                print("El usuario 'admin' ya existe.")
                return

            cursor.execute(
                "INSERT INTO usuarios (username, password, role) VALUES (%s, %s, %s)",
                ("admin", encriptar_password(leer_password()), "admin"),
            )
        conn.commit()
        print("✅ Usuario 'admin' creado correctamente.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
    print("¡Proceso terminado con éxito!")
