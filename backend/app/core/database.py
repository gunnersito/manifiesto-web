"""
Manejo de la base de datos PostgreSQL para Supabase.
"""
import json
import math
import os
import re
import unicodedata
import bcrypt
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime

from app.core.config import COLUMNAS_EXTRA, COL_HBL


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


# ============================================================
# COLUMNAS EXTRA DEL MANIFIESTO
# ============================================================
def _valor_json(valor):
    """Convierte un valor de pandas en algo que `json.dumps` pueda guardar."""
    if valor is None:
        return None
    if hasattr(valor, "item"):
        valor = valor.item()
    if isinstance(valor, float) and math.isnan(valor):
        return None
    return valor


def _datos_extra_json(row, columnas) -> str:
    """
    JSON de las columnas del Excel que no tienen campo propio en `hbls`.

    Se guardan con su tipo original para que una exportación las escriba igual
    que cuando se leía el Excel (los identificadores numéricos siguen siendo
    números, no texto).
    """
    extra = {
        col: _valor_json(row.get(col))
        for col in COLUMNAS_EXTRA
        if col in columnas
    }
    return json.dumps(extra, ensure_ascii=False)


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
            estado TEXT,
            datos_extra TEXT
        )
    """)

    # Manifiestos cargados antes de que las columnas del Excel sin campo propio
    # (M3, carnet, categoría...) se guardaran en la tabla: la fila existe pero
    # `datos_extra` es NULL hasta rellenarla con el archivo original.
    cursor.execute(
        "ALTER TABLE hbls ADD COLUMN IF NOT EXISTS datos_extra TEXT"
    )

    # Índices para los filtros del listado y su paginación.
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_hbls_manifiesto ON hbls (manifiesto_id)"
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hbls_estado ON hbls (estado)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_hbls_provincia ON hbls (provincia)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_hbls_orden "
        "ON hbls (manifiesto_id, provincia, municipio, direccion, hbl)"
    )

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

    # Repartidores y el municipio que lleva cada uno en un manifiesto.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS repartidores (
            id SERIAL PRIMARY KEY,
            nombre TEXT UNIQUE NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS asignaciones_repartidor (
            id SERIAL PRIMARY KEY,
            manifiesto_id INTEGER NOT NULL REFERENCES manifiestos(id) ON DELETE CASCADE,
            provincia TEXT NOT NULL,
            municipio TEXT NOT NULL,
            repartidor TEXT NOT NULL,
            UNIQUE (manifiesto_id, provincia, municipio)
        )
    """)

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_asignaciones_manifiesto "
        "ON asignaciones_repartidor (manifiesto_id, provincia)"
    )

    # Caché de coordenadas: una fila por dirección consultada, compartida entre
    # manifiestos para no geocodificar dos veces la misma dirección.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS geocodificaciones (
            clave TEXT PRIMARY KEY,
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            precision TEXT NOT NULL,
            consultado_en TEXT NOT NULL
        )
    """)

    # Correcciones a mano: mandan sobre la caché del geocodificador. La clave es
    # la dirección original de la parada, así que corregirla no rompe el enlace
    # con el manifiesto; `direccion` guarda el texto corregido, si lo hay.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS correcciones_parada (
            clave TEXT PRIMARY KEY,
            direccion TEXT,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            actualizado_en TEXT NOT NULL
        )
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

def obtener_estados_por_hbls(hbls: list) -> dict:
    """
    Estado actual solo de los HBLs pedidos, sin traer el resto de la tabla.

    Devuelve {hbl: estado}; los HBLs que no tengan fila no aparecen.
    """
    if not hbls:
        return {}

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT hbl, estado FROM entregas WHERE hbl = ANY(%s)", (hbls,)
            )
            return dict(cursor.fetchall())
    finally:
        conn.close()

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
            _datos_extra_json(row, df.columns),
        ))

    execute_batch(cursor, """
        INSERT INTO hbls (manifiesto_id, hbl, provincia, municipio, direccion,
                          remitente, destinatario, telefono, contenido,
                          bultos, peso, parada, estado, datos_extra)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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

def obtener_hbls(manifiesto_id: int = None, pagina: int = 1, por_pagina: int = 15, busqueda: str = "", estado: str = "", provincia: str = "", municipio: str = "", direccion: str = "") -> dict:
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
    if municipio:
        where.append("municipio = %s")
        params.append(municipio)
    if direccion:
        where.append("direccion = %s")
        params.append(direccion)

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

def _filas_de_hbls(
    manifiesto_id: int, provincia: str = None, con_datos_extra: bool = False
) -> list[dict]:
    """
    Filas de un manifiesto en el orden en que se cargaron, opcionalmente solo
    de una provincia y con las columnas extra del Excel ya mezcladas.
    """
    columnas = (
        "hbl, provincia, municipio, direccion, remitente, destinatario, "
        "telefono, contenido, bultos, peso, parada"
    )
    if con_datos_extra:
        columnas += ", datos_extra"

    where, params = ["manifiesto_id = %s"], [manifiesto_id]
    if provincia is not None:
        where.append("provincia = %s")
        params.append(provincia)

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT {columnas} FROM hbls WHERE {' AND '.join(where)} ORDER BY id",
                params,
            )
            rows = cursor.fetchall()
    finally:
        conn.close()

    filas = []
    for r in rows:
        fila = {
            "hbl": r[0], "provincia": r[1], "municipio": r[2], "direccion": r[3],
            "remitente": r[4], "destinatario": r[5], "telefono": r[6],
            "contenido": r[7], "bultos": r[8], "peso": r[9], "parada": r[10],
        }
        if con_datos_extra:
            fila.update(json.loads(r[11]) if r[11] else {})
        filas.append(fila)
    return filas


def obtener_hbls_de_provincia(manifiesto_id: int, provincia: str) -> list[dict]:
    """
    Todas las filas de una provincia de un manifiesto, en el orden en que se
    cargaron. La vista de provincia calcula sus paradas con estas filas, en vez
    de descargar y volver a leer el Excel de Storage.
    """
    return _filas_de_hbls(manifiesto_id, provincia)


def obtener_hbls_para_exportar(manifiesto_id: int) -> list[dict]:
    """Manifiesto entero con las columnas extra que necesita la exportación."""
    return _filas_de_hbls(manifiesto_id, con_datos_extra=True)


def hay_hbls_sin_datos_extra(manifiesto_id: int) -> bool:
    """
    True si al manifiesto le faltan las columnas extra por rellenar. Solo pasa
    con los cargados antes de que se guardaran en la tabla.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT EXISTS (SELECT 1 FROM hbls WHERE manifiesto_id = %s "
                "AND datos_extra IS NULL)",
                (manifiesto_id,),
            )
            return cursor.fetchone()[0]
    finally:
        conn.close()


def guardar_datos_extra(manifiesto_id: int, df) -> int:
    """
    Rellena las columnas extra de un manifiesto ya guardado, cruzando por HBL
    con las filas del Excel original. Devuelve cuántas filas actualizó.
    """
    if not len(df):
        return 0

    filas = [
        (_datos_extra_json(row, df.columns), manifiesto_id, str(row.get(COL_HBL, "")))
        for _, row in df.iterrows()
    ]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            execute_batch(
                cursor,
                "UPDATE hbls SET datos_extra = %s "
                "WHERE manifiesto_id = %s AND hbl = %s",
                filas,
            )
        conn.commit()
    finally:
        conn.close()
    return len(filas)


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



# ============================================================
# REPARTIDORES Y ASIGNACIÓN DE MUNICIPIOS
# ============================================================
def listar_repartidores() -> list:
    """Nombres de los repartidores dados de alta, en orden alfabético."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT nombre FROM repartidores ORDER BY lower(nombre)")
            return [fila[0] for fila in cursor.fetchall()]
    finally:
        conn.close()


def crear_repartidor(nombre: str) -> bool:
    """Da de alta un repartidor. Devuelve False si ya existía."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO repartidores (nombre) VALUES (%s) "
                "ON CONFLICT (nombre) DO NOTHING",
                (nombre,),
            )
            creado = cursor.rowcount == 1
        conn.commit()
        return creado
    finally:
        conn.close()


def eliminar_repartidor(nombre: str) -> None:
    """Borra el repartidor y deja sin asignar todos sus municipios."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM asignaciones_repartidor WHERE repartidor = %s", (nombre,)
            )
            cursor.execute("DELETE FROM repartidores WHERE nombre = %s", (nombre,))
        conn.commit()
    finally:
        conn.close()


def obtener_asignaciones(manifiesto_id: int, provincia: str) -> dict:
    """{municipio: repartidor} de una provincia de un manifiesto."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT municipio, repartidor FROM asignaciones_repartidor "
                "WHERE manifiesto_id = %s AND provincia = %s",
                (manifiesto_id, provincia),
            )
            return dict(cursor.fetchall())
    finally:
        conn.close()


def guardar_asignacion(
    manifiesto_id: int, provincia: str, municipio: str, repartidor: str | None
) -> None:
    """Asigna un municipio a un repartidor; sin repartidor, la borra."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if not repartidor:
                cursor.execute(
                    "DELETE FROM asignaciones_repartidor "
                    "WHERE manifiesto_id = %s AND provincia = %s AND municipio = %s",
                    (manifiesto_id, provincia, municipio),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO asignaciones_repartidor
                        (manifiesto_id, provincia, municipio, repartidor)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (manifiesto_id, provincia, municipio)
                    DO UPDATE SET repartidor = EXCLUDED.repartidor
                    """,
                    (manifiesto_id, provincia, municipio, repartidor),
                )
        conn.commit()
    finally:
        conn.close()


# ============================================================
# GEOCODIFICACIÓN (caché de coordenadas)
# ============================================================
def obtener_geocodificaciones(claves: list) -> dict:
    """
    Coordenadas ya consultadas para esas claves.

    Devuelve {clave: {"lat", "lon", "precision"}}. `precision` es "direccion",
    "municipio" (se ubicó solo el municipio) o "fallida" (no se encontró nada).
    """
    if not claves:
        return {}

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT clave, lat, lon, precision FROM geocodificaciones "
                "WHERE clave = ANY(%s)",
                (claves,),
            )
            return {
                fila[0]: {"lat": fila[1], "lon": fila[2], "precision": fila[3]}
                for fila in cursor.fetchall()
            }
    finally:
        conn.close()


def guardar_geocodificaciones(filas: list) -> None:
    """Guarda o actualiza coordenadas. Cada fila es (clave, lat, lon, precision)."""
    if not filas:
        return

    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            execute_batch(
                cursor,
                """
                INSERT INTO geocodificaciones (clave, lat, lon, precision, consultado_en)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (clave) DO UPDATE SET
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    precision = EXCLUDED.precision,
                    consultado_en = EXCLUDED.consultado_en
                """,
                [(clave, lat, lon, precision, ahora) for clave, lat, lon, precision in filas],
            )
        conn.commit()
    finally:
        conn.close()


# ============================================================
# CORRECCIONES MANUALES DE UBICACIÓN
# ============================================================
def obtener_correcciones(claves: list) -> dict:
    """
    Correcciones hechas a mano para esas paradas.

    Devuelve {clave: {"direccion", "lat", "lon"}}. `direccion` es el texto
    corregido o None si solo se movieron las coordenadas.
    """
    if not claves:
        return {}

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT clave, direccion, lat, lon FROM correcciones_parada "
                "WHERE clave = ANY(%s)",
                (claves,),
            )
            return {
                fila[0]: {"direccion": fila[1], "lat": fila[2], "lon": fila[3]}
                for fila in cursor.fetchall()
            }
    finally:
        conn.close()


def guardar_correccion(
    clave: str, direccion: str | None, lat: float, lon: float
) -> None:
    """Guarda o reemplaza la ubicación a mano de una parada."""
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO correcciones_parada (clave, direccion, lat, lon, actualizado_en)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (clave) DO UPDATE SET
                    direccion = EXCLUDED.direccion,
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    actualizado_en = EXCLUDED.actualizado_en
                """,
                (clave, direccion or None, lat, lon, ahora),
            )
        conn.commit()
    finally:
        conn.close()


def eliminar_correccion(clave: str) -> None:
    """Quita la corrección: la parada vuelve a lo que diga la caché."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM correcciones_parada WHERE clave = %s", (clave,))
        conn.commit()
    finally:
        conn.close()
