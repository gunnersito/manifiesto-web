import os
import bcrypt
import psycopg2
from dotenv import load_dotenv

# Cargar la URL de Supabase desde el .env
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

print("Conectando a Supabase...")

# Conectar directamente
conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

# 1. Crear las tablas necesarias (por si acaso)
cursor.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL
    )
""")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS manifiestos (
        id SERIAL PRIMARY KEY,
        nombre_archivo TEXT NOT NULL,
        hash_archivo TEXT,
        fecha_subida TEXT NOT NULL,
        total_filas INTEGER,
        total_provincias INTEGER,
        total_paradas INTEGER,
        total_bultos INTEGER,
        resumen_json TEXT
    )
""")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS hbls (
        id SERIAL PRIMARY KEY,
        manifiesto_id INTEGER NOT NULL REFERENCES manifiestos(id) ON DELETE CASCADE,
        hbl TEXT NOT NULL,
        provincia TEXT,
        municipio TEXT,
        direccion TEXT,
        remitente TEXT,
        destinatario TEXT,
        telefono TEXT,
        contenido TEXT,
        bultos INTEGER,
        peso REAL,
        parada INTEGER,
        estado TEXT
    )
""")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS entregas (
        hbl TEXT PRIMARY KEY,
        estado TEXT NOT NULL,
        usuario TEXT,
        fecha_hora TEXT
    )
""")
conn.commit()

# 2. Crear al Admin
cursor.execute("SELECT id FROM usuarios WHERE username = 'admin'")
if cursor.fetchone():
    print("El usuario 'admin' ya existe.")
else:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw("admin123".encode('utf-8'), salt).decode('utf-8')

    cursor.execute(
        "INSERT INTO usuarios (username, password, role) VALUES (%s, %s, %s)",
        ("admin", hashed, "admin")
    )
    conn.commit()
    print("✅ Usuario 'admin' creado con contraseña 'admin123'")

cursor.close()
conn.close()
print("¡Proceso terminado con éxito!")