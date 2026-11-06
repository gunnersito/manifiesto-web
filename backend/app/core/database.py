"""
Manejo de la base de datos PostgreSQL para Supabase.
"""
import os
import json
import bcrypt
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    """Retorna una nueva conexión a PostgreSQL (Supabase)."""
    return psycopg2.connect(DATABASE_URL)

def init_db():
    """Crea todas las tablas necesarias si no existen."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS entregas (
            hbl TEXT PRIMARY KEY,
            estado TEXT NOT NULL,
            usuario TEXT,
            fecha_hora TEXT
        )
    """)

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

    conn.commit()
    cursor.close()
    conn.close()

def init_usuarios_table():
    """Por compatibilidad, llama a init_db."""
    init_db()

def init_manifiestos_tables():
    """Por compatibilidad, llama a init_db."""
    init_db()

def encriptar_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verificar_password(password_plana: str, password_encriptada: str) -> bool:
    return bcrypt.checkpw(password_plana.encode('utf-8'), password_encriptada.encode('utf-8'))

# ============================================================
# ESTADOS
# ============================================================
def obtener_todos_estados():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT hbl, estado, usuario, fecha_hora FROM entregas")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return {row[0]: {"estado": row[1], "usuario": row[2], "fecha_hora": row[3]} for row in rows}

def guardar_estado(hbl: str, estado: str, usuario: str = None):
    if usuario is None:
        usuario = "Sistema"
    conn = get_db_connection()
    cursor = conn.cursor()
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO entregas (hbl, estado, usuario, fecha_hora)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (hbl) DO UPDATE SET
            estado = EXCLUDED.estado,
            usuario = EXCLUDED.usuario,
            fecha_hora = EXCLUDED.fecha_hora
    """, (str(hbl), estado, usuario, ahora))

    cursor.execute("UPDATE hbls SET estado = %s WHERE hbl = %s", (estado, str(hbl)))

    conn.commit()
    cursor.close()
    conn.close()

def eliminar_estado(hbl: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM entregas WHERE hbl = %s", (str(hbl),))
    conn.commit()
    cursor.close()
    conn.close()

# ============================================================
# MANIFIESTOS
# ============================================================
def guardar_manifiesto(nombre_archivo: str, df, resumen: list, hash_archivo: str = "") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()

    total_paradas = sum(r["paradas"] for r in resumen)
    total_bultos = sum(r["bultos"] for r in resumen)
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO manifiestos (
            nombre_archivo, hash_archivo, fecha_subida, total_filas,
            total_provincias, total_paradas, total_bultos, resumen_json
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (
        nombre_archivo, hash_archivo, ahora, len(df),
        len(resumen), total_paradas, total_bultos,
        json.dumps(resumen, ensure_ascii=False),
    ))
    manifiesto_id = cursor.fetchone()[0]

    COL_HBL = "HBL Número"
    COL_PROVINCIA = "Provincia"
    COL_MUNICIPIO = "Municipio"
    COL_DIRECCION = "Direccion del destinatario"
    COL_REMITENTE = "Nombre y Apellidos del REMITENTE:"
    COL_DESTINATARIO = "Nombre y Apellidos del DESTINATARIO:"
    COL_TELEFONO = "Teléfono del DESTINATARIO"
    COL_CONTENIDO = "Contenido del paquete (Descripción)"
    COL_BULTOS = "Bultos (Cant.)"
    COL_PESO = "Peso (Kg)"
    COL_PARADAS = "Paradas"

    rows = []
    for _, row in df.iterrows():
        rows.append((
            manifiesto_id,
            str(row.get(COL_HBL, "")),
            str(row.get(COL_PROVINCIA, "")),
            str(row.get(COL_MUNICIPIO, "")),
            str(row.get(COL_DIRECCION, "")),
            str(row.get(COL_REMITENTE, "")),
            str(row.get(COL_DESTINATARIO, "")),
            str(row.get(COL_TELEFONO, "")),
            str(row.get(COL_CONTENIDO, "")),
            int(row.get(COL_BULTOS, 0) or 0),
            float(row.get(COL_PESO, 0) or 0),
            int(row.get(COL_PARADAS, 0) or 0),
            str(row.get("Estado", "Pendiente")),
        ))

    execute_batch(cursor, """
        INSERT INTO hbls (manifiesto_id, hbl, provincia, municipio, direccion,
                          remitente, destinatario, telefono, contenido,
                          bultos, peso, parada, estado)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, rows)

    conn.commit()
    cursor.close()
    conn.close()
    return manifiesto_id

def listar_manifiestos() -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, nombre_archivo, fecha_subida, total_filas,
               total_provincias, total_paradas, total_bultos
        FROM manifiestos ORDER BY fecha_subida DESC
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [
        {"id": r[0], "nombre_archivo": r[1], "fecha_subida": r[2], "total_filas": r[3],
         "total_provincias": r[4], "total_paradas": r[5], "total_bultos": r[6]}
        for r in rows
    ]

def obtener_manifiesto(manifiesto_id: int) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, nombre_archivo, fecha_subida, total_filas,
               total_provincias, total_paradas, total_bultos, resumen_json
        FROM manifiestos WHERE id = %s
    """, (manifiesto_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row: return None
    return {
        "id": row[0], "nombre_archivo": row[1], "fecha_subida": row[2], "total_filas": row[3],
        "total_provincias": row[4], "total_paradas": row[5], "total_bultos": row[6],
        "resumen": json.loads(row[7]) if row[7] else [],
    }

def obtener_hbls(manifiesto_id: int = None, pagina: int = 1, por_pagina: int = 15, busqueda: str = "", estado: str = "", provincia: str = "") -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()

    where, params = [], []
    if manifiesto_id and manifiesto_id > 0:
        where.append("manifiesto_id = %s")
        params.append(manifiesto_id)
    if busqueda:
        where.append("(hbl ILIKE %s OR remitente ILIKE %s OR destinatario ILIKE %s)")
        b = f"%{busqueda}%"
        params.extend([b, b, b])
    if estado:
        where.append("estado = %s")
        params.append(estado)
    if provincia:
        ubicaciones = [u.strip() for u in provincia.split(",") if u.strip()]
        if ubicaciones:
            placeholders = " OR ".join(["provincia = %s OR municipio = %s" for _ in ubicaciones])
            where.append(f"({placeholders})")
            for u in ubicaciones: params.extend([u, u])

    where_sql = " AND ".join(where) if where else "1=1"

    cursor.execute(f"SELECT COUNT(*) FROM hbls WHERE {where_sql}", params)
    total = cursor.fetchone()[0]

    offset = (pagina - 1) * por_pagina
    cursor.execute(f"""
        SELECT id, hbl, provincia, municipio, direccion, remitente,
               destinatario, telefono, contenido, bultos, peso, parada, estado, manifiesto_id
        FROM hbls WHERE {where_sql}
        ORDER BY provincia, municipio, direccion, hbl
        LIMIT %s OFFSET %s
    """, params + [por_pagina, offset])

    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    hbls = [
        {"id": r[0], "hbl": r[1], "provincia": r[2], "municipio": r[3], "direccion": r[4],
         "remitente": r[5], "destinatario": r[6], "telefono": r[7], "contenido": r[8],
         "bultos": r[9], "peso": r[10], "parada": r[11], "estado": r[12], "manifiesto_id": r[13]}
        for r in rows
    ]
    return {"total": total, "pagina": pagina, "por_pagina": por_pagina, "total_paginas": (total + por_pagina - 1) // por_pagina, "hbls": hbls}

def eliminar_manifiesto(manifiesto_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM manifiestos WHERE id = %s", (manifiesto_id,))
    conn.commit()
    eliminados = cursor.rowcount
    cursor.close()
    conn.close()
    return eliminados > 0

def buscar_manifiesto_por_hash(hash_archivo: str) -> dict | None:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, nombre_archivo, fecha_subida, total_filas,
               total_provincias, total_paradas, total_bultos, resumen_json
        FROM manifiestos WHERE hash_archivo = %s LIMIT 1
    """, (hash_archivo,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row: return None
    return {
        "id": row[0], "nombre_archivo": row[1], "fecha_subida": row[2], "total_filas": row[3],
        "total_provincias": row[4], "total_paradas": row[5], "total_bultos": row[6],
        "resumen": json.loads(row[7]) if row[7] else [],
    }

def obtener_ruta_archivo_original(manifiesto_id: int) -> str:
    """Devuelve la ruta del archivo Excel original guardado."""
    from pathlib import Path
    from .config import DB_PATH
    uploads_dir = DB_PATH.parent / "uploads"
    return str(uploads_dir / f"manifiesto_{manifiesto_id}.xlsx")