"""
Servicio de carga y limpieza de archivos Excel.
"""
import re
import unicodedata
from io import BytesIO
from typing import Tuple

import pandas as pd

from app.core.config import (
    COL_HBL, COL_BULTOS, COL_DIRECCION, COL_PROVINCIA, COL_MUNICIPIO,
)


# ============================================================
# NORMALIZACIÓN DE NOMBRES DE COLUMNAS
# ============================================================
def _normalizar_nombre_columna(nombre: str) -> str:
    """Normaliza un nombre de columna para comparaciones."""
    s = str(nombre).strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# Diccionario de sinónimos: campo estándar -> posibles nombres alternativos
SINONIMOS_COLUMNAS = {
    "HBL Número": ["hbl numero", "hbl", "numero hbl", "no hbl", "num hbl", "hbl no"],
    "Bultos (Cant.)": ["bultos cant", "bultos", "cant bultos", "cantidad bultos", "cant", "cantidad"],
    "Peso (Kg)": ["peso kg", "peso", "peso kilogramos", "peso (kg)", "kg"],
    "M3": ["m3", "metro cubico", "metros cubicos", "volumen"],
    "Nombre y Apellidos del REMITENTE:": ["nombre y apellidos del remitente", "remitente", "nombre remitente", "emisor"],
    "Nombre y Apellidos del DESTINATARIO:": ["nombre y apellidos del destinatario", "destinatario", "nombre destinatario", "receptor"],
    "Direccion del destinatario": ["direccion del destinatario", "direccion destinatario", "direccion", "direccion de entrega"],
    "Provincia": ["provincia"],
    "Municipio": ["municipio"],
    "Teléfono del DESTINATARIO": ["telefono del destinatario", "telefono destinatario", "telefono", "tel"],
    "DNI/PASAPORTE:": ["dni pasaporte", "dni", "pasaporte", "documento"],
    "No. de Carnet de Identidad:": ["no de carnet de identidad", "carnet de identidad", "carnet", "ci"],
    "Correo electrónico": ["correo electronico", "correo", "email", "e mail", "mail"],
    "Contenido del paquete (Descripción)": ["contenido del paquete descripcion", "contenido del paquete", "contenido", "descripcion"],
    "Categoría/Operación": ["categoria operacion", "categoria", "operacion", "tipo"],
}


def detectar_columnas_automaticamente(columnas_archivo: list) -> dict:
    """
    Dado un listado de columnas del archivo, devuelve un dict:
    {campo_estandar: columna_en_archivo} para las que se pudieron detectar.
    """
    columnas_norm = {_normalizar_nombre_columna(c): c for c in columnas_archivo}
    mapeo = {}

    for campo, sinonimos in SINONIMOS_COLUMNAS.items():
        campo_norm = _normalizar_nombre_columna(campo)
        if campo_norm in columnas_norm:
            mapeo[campo] = columnas_norm[campo_norm]
            continue
        for sin in sinonimos:
            if sin in columnas_norm:
                mapeo[campo] = columnas_norm[sin]
                break
    return mapeo


# ============================================================
# CARGA DEL ARCHIVO
# ============================================================
def cargar_excel(contenido: bytes, hoja: str = None) -> pd.DataFrame:
    """
    Carga un Excel (xlsx/xls) desde bytes.
    Detecta automáticamente la fila donde están los encabezados reales.
    """
    buffer = BytesIO(contenido)

    try:
        excel = pd.ExcelFile(buffer)
        hojas_disponibles = excel.sheet_names

        if hoja is None or hoja.strip() == "" or hoja not in hojas_disponibles:
            hoja = hojas_disponibles[0]

        buffer.seek(0)

        # Leemos el archivo SIN encabezados (header=None) para escanear las primeras filas
        df_temp = pd.read_excel(buffer, sheet_name=hoja, header=None, nrows=20)

        # Palabras clave que suelen estar en la fila de encabezados
        palabras_clave = ["hbl", "bulto", "peso", "remitente", "destinatario", "direccion", "municipio", "provincia"]

        mejor_fila = 0
        max_coincidencias = 0

        # Buscamos la fila que tenga más palabras clave
        for index, row in df_temp.iterrows():
            # Convertimos la fila a texto en minúsculas
            texto_fila = " ".join([str(val).lower() for val in row.values if pd.notna(val)])

            # Contamos cuántas palabras clave aparecen
            coincidencias = sum(1 for palabra in palabras_clave if palabra in texto_fila)

            if coincidencias > max_coincidencias:
                max_coincidencias = coincidencias
                mejor_fila = index

        # Ahora leemos el archivo completo usando la fila detectada como encabezado
        buffer.seek(0)
        df = pd.read_excel(buffer, sheet_name=hoja, header=mejor_fila)

        df.columns = [str(c).strip() for c in df.columns]
        return df

    except Exception as e:
        # --- Intento como CSV si falla el Excel ---
        try:
            buffer.seek(0)
            df_temp = pd.read_csv(buffer, sep=None, engine="python", header=None, nrows=20)
            palabras_clave = ["hbl", "bulto", "peso", "remitente", "destinatario", "direccion"]
            mejor_fila = 0
            max_coincidencias = 0
            for index, row in df_temp.iterrows():
                texto_fila = " ".join([str(val).lower() for val in row.values if pd.notna(val)])
                coincidencias = sum(1 for palabra in palabras_clave if palabra in texto_fila)
                if coincidencias > max_coincidencias:
                    max_coincidencias = coincidencias
                    mejor_fila = index

            buffer.seek(0)
            df = pd.read_csv(buffer, sep=None, engine="python", header=mejor_fila)
            df.columns = [str(c).strip() for c in df.columns]
            return df
        except Exception as e2:
            raise ValueError(f"No se pudo leer el archivo. Error Excel: {e} | Error CSV: {e2}")

def listar_hojas(contenido: bytes) -> list:
    """Devuelve la lista de hojas del Excel con info básica."""
    buffer = BytesIO(contenido)
    excel = pd.ExcelFile(buffer)
    info = []
    for h in excel.sheet_names:
        try:
            df = pd.read_excel(buffer, sheet_name=h)
            info.append({
                "nombre": h,
                "filas": len(df),
                "columnas": len(df.columns),
            })
        except Exception as e:
            info.append({
                "nombre": h,
                "filas": 0,
                "columnas": 0,
                "error": str(e),
            })
    return info


# ============================================================
# LIMPIEZA Y VALIDACIÓN
# ============================================================
def aplicar_mapeo_columnas(df: pd.DataFrame) -> Tuple[pd.DataFrame, dict]:
    """
    Detecta y renombra columnas automáticamente.
    Devuelve (df_renombrado, mapeo_aplicado).
    """
    mapeo = detectar_columnas_automaticamente(df.columns.tolist())
    renames = {}
    for campo_estandar, col_original in mapeo.items():
        if col_original != campo_estandar and campo_estandar not in df.columns:
            renames[col_original] = campo_estandar
    if renames:
        df = df.rename(columns=renames)
    return df, renames


def limpiar_manifiesto(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    Limpia el DataFrame:
    - Elimina filas sin HBL válido.
    - Elimina filas con "TOTAL", "SUBTOTAL", "RESUMEN" en HBL.
    - Limpia espacios en columnas clave.
    - Convierte Bultos a int.
    Devuelve (df_limpio, filas_eliminadas).
    """
    filas_antes = len(df)

    # Filtrar filas válidas
    hbl_str = df[COL_HBL].astype(str).str.strip().str.upper()
    mask_validas = (
            df[COL_HBL].notna() &
            (hbl_str != "") &
            (~hbl_str.str.contains("TOTAL", na=False)) &
            (~hbl_str.str.contains("SUBTOTAL", na=False)) &
            (~hbl_str.str.contains("RESUMEN", na=False))
    )
    df = df[mask_validas].copy()

    # Limpiar columnas clave
    df[COL_PROVINCIA] = df[COL_PROVINCIA].astype(str).str.strip()
    df[COL_MUNICIPIO] = df[COL_MUNICIPIO].astype(str).str.strip()
    df[COL_DIRECCION] = df[COL_DIRECCION].astype(str).str.strip()
    df[COL_BULTOS] = pd.to_numeric(df[COL_BULTOS], errors="coerce").fillna(0).astype(int)

    filas_eliminadas = filas_antes - len(df)
    return df, filas_eliminadas


# ============================================================
# VALIDACIÓN DE COLUMNAS ESENCIALES
# ============================================================
COLUMNAS_ESENCIALES = [COL_HBL, COL_BULTOS, COL_DIRECCION, COL_PROVINCIA, COL_MUNICIPIO]


def validar_columnas_esenciales(df: pd.DataFrame) -> list:
    """Devuelve la lista de columnas esenciales que faltan."""
    return [c for c in COLUMNAS_ESENCIALES if c not in df.columns]