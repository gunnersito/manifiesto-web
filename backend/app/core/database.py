"""
Manejo de la base de datos PostgreSQL para Supabase.
"""
import json
import os
import re
import unicodedata
import bcrypt
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime


# ============================================================
# BÚSQUEDA DE TEXTO
# ============================================================
_METACARACTERES_REGEX = re.compile(r"([\\^$.|?*+()\[\]{}])")


def _normalizar_busqueda(texto: str) -> str:
    """Pasa el texto a minúsculas y le quita los acentos."""
    texto = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in texto if not unicodedata.combining(c))


def _escapar_regex(texto: str) -> str:
    """Escapa los metacaracteres para que el texto no se interprete como regex."""
    return _METACARACTERES_REGEX.sub(r"\\\1", texto)


def _escapar_like(texto: str) -> str:
    """Escapa los comodines de LIKE para buscar el texto tal cual."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _texto_normalizado(columna: str) -> str:
    """Expresión SQL de la columna en minúsculas y sin acentos."""
    return f"translate(lower(coalesce({columna}, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')"


def _condicion_busqueda(busqueda: str) -> tuple[str, list]:
    """
    Condición SQL de la búsqueda libre: el HBL se busca por contención y el
    remitente/destinatario por inicio de palabra, sin acentos, para que "raul"
    encuentre "Raúl" pero no "Braulio".
    """
    texto = busqueda.strip()
    tokens = [t for t in _normalizar_busqueda(texto).split() if t]
    patron_hbl = f"%{_escapar_like(texto)}%"

    clausulas = ["hbl ILIKE %s ESCAPE '\\'"]
    valores = [patron_hbl]

    if tokens:
        nombres = (
            f"({_texto_normalizado('remitente')} || ' ' || "
            f"{_texto_normalizado('destinatario')})"
        )
        por_nombre = [f"{nombres} ~ ('\\m' || %s)" for _ in tokens]
        clausulas.append("(" + " AND ".join(por_nombre) + ")")
        valores.extend(_escapar_regex(t) for t in tokens)

    return "(" + " OR ".join(clausulas) + ")", valores

def get_db_connection():
    """Retorna una nueva conexión a PostgreSQL (Supabase)."""
    # Se lee en cada conexión para que el módulo no dependa de config.py ni de
    # cuándo se cargó el .env.
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError(
            "Falta la variable de entorno DATABASE_URL. Defínela con la cadena de "
            "conexión de PostgreSQL antes de arrancar la API o de crear el admin."
        )
    return psycopg2.connect(dsn)

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
            role TEXT NOT NULL,
            ultimo_manifiesto_id INTEGER
        )
    """)

    # Bases creadas con la versión anterior del esquema no tienen la columna
    # (el login la consulta), así que la añadimos si falta.
    cursor.execute(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_manifiesto_id INTEGER"
    )

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

    # Historial de estados: una fila por cada cambio, con quién lo hizo. La
    # tabla entregas solo guarda el estado actual (se sobrescribe).
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS entregas_historial (
            id SERIAL PRIMARY KEY,
            hbl TEXT NOT NULL,
            estado TEXT NOT NULL,
            usuario TEXT,
            fecha_hora TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_entregas_historial_hbl
        ON entregas_historial (hbl, id DESC)
    """)

    conn.commit()
    cursor.close()
    conn.close()

def encriptar_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verificar_password(password_plana: str, password_encriptada: str) -> bool:
    return bcrypt.checkpw(password_plana.encode('utf-8'), password_encriptada.encode('utf-8'))

def usuario_existe(username: str) -> bool:
    """True si ya hay un usuario con ese nombre."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM usuarios WHERE username = %s", (username,))
            return cursor.fetchone() is not None
    finally:
        conn.close()

def crear_admin_si_no_existe(username: str, password: str) -> bool:
    """
    Crea el usuario con rol admin si no existe. Devuelve True si lo creó.

    El ON CONFLICT evita duplicados si dos instancias arrancan a la vez.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO usuarios (username, password, role)
                VALUES (%s, %s, 'admin')
                ON CONFLICT (username) DO NOTHING
                """,
                (username, encriptar_password(password)),
            )
            creado = cursor.rowcount == 1
        conn.commit()
        return creado
    finally:
        conn.close()

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

def _estado_actual(cursor, hbl: str) -> str | None:
    """Estado vigente de un HBL: manda `entregas` y, si no hay fila, `hbls`."""
    cursor.execute("SELECT estado FROM entregas WHERE hbl = %s", (hbl,))
    fila = cursor.fetchone()
    if fila is None:
        cursor.execute("SELECT estado FROM hbls WHERE hbl = %s LIMIT 1", (hbl,))
        fila = cursor.fetchone()
    return fila[0] if fila else None


def _estados_actuales(cursor, hbls: list) -> dict:
    """Estado vigente de varios HBLs, en dos consultas en vez de una por HBL."""
    cursor.execute("SELECT hbl, estado FROM entregas WHERE hbl = ANY(%s)", (hbls,))
    estados = dict(cursor.fetchall())

    faltan = [hbl for hbl in hbls if hbl not in estados]
    if faltan:
        cursor.execute(
            "SELECT DISTINCT ON (hbl) hbl, estado FROM hbls WHERE hbl = ANY(%s) ORDER BY hbl",
            (faltan,),
        )
        estados.update(dict(cursor.fetchall()))

    return estados


def _guardar_estado_en_cursor(
    cursor, hbl: str, estado: str, usuario: str, estado_actual: str | None
) -> bool:
    """
    Escribe un cambio de estado usando un cursor ya abierto: estado actual en
    `entregas`, columna `estado` de `hbls` y una fila nueva en el historial.

    Si el HBL ya estaba en ese estado no se toca nada (ni histórico, ni fecha,
    ni quién lo cambió): repetir el mismo estado no deja rastro. Devuelve True
    solo cuando hubo un cambio real.
    """
    if estado_actual == estado:
        return False

    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO entregas (hbl, estado, usuario, fecha_hora)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (hbl) DO UPDATE SET
            estado = EXCLUDED.estado,
            usuario = EXCLUDED.usuario,
            fecha_hora = EXCLUDED.fecha_hora
    """, (hbl, estado, usuario, ahora))

    cursor.execute("UPDATE hbls SET estado = %s WHERE hbl = %s", (estado, hbl))

    cursor.execute("""
        INSERT INTO entregas_historial (hbl, estado, usuario, fecha_hora)
        VALUES (%s, %s, %s, %s)
    """, (hbl, estado, usuario, ahora))

    return True


def guardar_estado(hbl: str, estado: str, usuario: str = None) -> bool:
    """Guarda el estado de un HBL. Devuelve True si el estado cambió."""
    usuario = usuario or "Sistema"
    hbl = str(hbl)
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cambio = _guardar_estado_en_cursor(
                cursor, hbl, estado, usuario, _estado_actual(cursor, hbl)
            )
        conn.commit()
        return cambio
    finally:
        conn.close()


def guardar_estados_masivo(hbls: list, estado: str, usuario: str = None) -> int:
    """
    Guarda el mismo estado en varios HBLs con una sola conexión y un solo
    commit, dejando histórico solo de los que cambian de verdad. Devuelve
    cuántos cambiaron.
    """
    if not hbls:
        return 0

    usuario = usuario or "Sistema"
    hbls = [str(hbl) for hbl in hbls]
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            estados = _estados_actuales(cursor, hbls)
            cambios = 0
            for hbl in hbls:
                if _guardar_estado_en_cursor(cursor, hbl, estado, usuario, estados.get(hbl)):
                    cambios += 1
        conn.commit()
        return cambios
    finally:
        conn.close()


def obtener_historial(hbl: str, limite: int = 50) -> list:
    """Cambios de estado de un HBL, del más reciente al más antiguo."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT estado, usuario, fecha_hora
                FROM entregas_historial
                WHERE hbl = %s
                ORDER BY id DESC
                LIMIT %s
            """, (str(hbl), limite))
            rows = cursor.fetchall()
    finally:
        conn.close()

    return [
        {"estado": row[0], "usuario": row[1], "fecha_hora": row[2]}
        for row in rows
    ]

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
        condicion, valores = _condicion_busqueda(busqueda)
        where.append(condicion)
        params.extend(valores)
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

