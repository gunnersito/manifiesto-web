"""
Crea el usuario 'admin' inicial en la base de datos.

El esquema lo gestiona app.core.database.init_db(), que es la única fuente de
verdad de las tablas (antes este script duplicaba los CREATE TABLE y podía
quedarse desincronizado).
"""
from app.core.database import encriptar_password, get_db_connection, init_db

print("Conectando a la base de datos...")

# 1. Crea todas las tablas necesarias si no existen
init_db()

# 2. Crea al admin si todavía no existe
conn = get_db_connection()
try:
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE username = 'admin'")
    if cursor.fetchone():
        print("El usuario 'admin' ya existe.")
    else:
        cursor.execute(
            "INSERT INTO usuarios (username, password, role) VALUES (%s, %s, %s)",
            ("admin", encriptar_password("admin123"), "admin"),
        )
        conn.commit()
        print("✅ Usuario 'admin' creado con contraseña 'admin123'")
    cursor.close()
finally:
    conn.close()

print("¡Proceso terminado con éxito!")
