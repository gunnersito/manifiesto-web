"""
Servicio de agrupación de direcciones y marcado de paradas.
Usa rapidfuzz para el matching (más rápido que difflib).
"""
import re
import unicodedata
import pandas as pd
from rapidfuzz import fuzz

from app.core.config import (
    COL_HBL, COL_BULTOS, COL_DIRECCION, COL_PROVINCIA, COL_MUNICIPIO, COL_PARADAS,
    UMBRAL_SIMILITUD, ORDEN_PROVINCIAS, ORDEN_COLUMNAS_SALIDA,
)


# ============================================================
# UTILIDADES DE TEXTO
# ============================================================
def normalizar_texto(texto) -> str:
    """Normaliza texto: minúsculas, sin tildes, sin signos."""
    if pd.isna(texto):
        return ""
    texto = str(texto).lower().strip()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^\w\s]", " ", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto


def similitud(a: str, b: str) -> float:
    """Similitud entre dos cadenas (0 a 1). rapidfuzz es 10-100x más rápido que difflib."""
    return fuzz.ratio(a, b) / 100.0


def _clave_provincia(nombre) -> str:
    """Clave normalizada para ordenar provincias."""
    if pd.isna(nombre):
        return ""
    s = str(nombre).strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\s+", " ", s).strip()
    return s


_ORDEN_PROV_NORM = {_clave_provincia(p): i for i, p in enumerate(ORDEN_PROVINCIAS)}


def ordenar_provincias(lista) -> list:
    """Ordena provincias de oeste a este."""
    def key(p):
        return _ORDEN_PROV_NORM.get(_clave_provincia(p), len(ORDEN_PROVINCIAS))
    return sorted(lista, key=key)


# ============================================================
# AGRUPACIÓN DE DIRECCIONES (FUZZY MATCHING)
# ============================================================
def agrupar_direcciones(direcciones_unicas, umbral=UMBRAL_SIMILITUD) -> dict:
    """
    Agrupa direcciones similares.
    Retorna dict: {direccion_original: direccion_representante}
    """
    norm = {d: normalizar_texto(d) for d in direcciones_unicas}
    canonica = {}
    grupos = []

    for d in direcciones_unicas:
        asignada = False
        for grupo in grupos:
            rep = grupo[0]
            if similitud(norm[d], norm[rep]) >= umbral:
                grupo.append(d)
                canonica[d] = rep
                asignada = True
                break
        if not asignada:
            grupos.append([d])
            canonica[d] = d
    return canonica


def marcar_paradas(df: pd.DataFrame, umbral: float = UMBRAL_SIMILITUD) -> pd.DataFrame:
    """
    Agrega columnas '_grupo_id' y 'Paradas' al DataFrame.
    - '_grupo_id': ID interno del grupo de dirección.
    - 'Paradas': 1 en la primera fila de cada parada, 0 en el resto.
    Agrupa por Municipio + Dirección (nunca entre municipios distintos).
    """
    df = df.copy()
    df["_canonica"] = df[COL_DIRECCION]
    df["_grupo_id"] = None

    contador = 0
    for municipio, sub in df.groupby(COL_MUNICIPIO, dropna=False):
        direcciones = sub[COL_DIRECCION].astype(str).unique().tolist()
        canonica = agrupar_direcciones(direcciones, umbral)

        rep_a_id = {}
        for d in direcciones:
            rep = canonica[d]
            if rep not in rep_a_id:
                contador += 1
                rep_a_id[rep] = contador

        mask = df[COL_MUNICIPIO] == municipio
        df.loc[mask, "_canonica"] = df.loc[mask, COL_DIRECCION].map(
            lambda d: canonica.get(d, d)
        )
        df.loc[mask, "_grupo_id"] = df.loc[mask, COL_DIRECCION].map(
            lambda d: rep_a_id.get(canonica.get(d, d))
        )

    df[COL_PARADAS] = 0
    idx_primeros = df.groupby("_grupo_id", sort=False).head(1).index
    df.loc[idx_primeros, COL_PARADAS] = 1
    return df


# ============================================================
# PREPARAR SALIDA PARA EXPORTAR
# ============================================================
def preparar_salida(df: pd.DataFrame) -> pd.DataFrame:
    """Ordena y selecciona las columnas en el orden estándar."""
    df_out = df.copy()
    df_out = df_out.sort_values(
        [COL_MUNICIPIO, "_grupo_id", COL_HBL],
        kind="stable"
    )
    for c in ORDEN_COLUMNAS_SALIDA:
        if c not in df_out.columns:
            df_out[c] = ""
    return df_out[ORDEN_COLUMNAS_SALIDA]


# ============================================================
# RESUMEN POR PARADA
# ============================================================
def resumen_paradas(df: pd.DataFrame) -> pd.DataFrame:
    """
    Genera un DataFrame con el resumen de cada parada.
    Columnas: Parada | Destinatario | Dirección | Municipio | Cant HBLs | Bultos | Peso (Kg) | Estado
    """
    COL_DESTINATARIO = "Nombre y Apellidos del DESTINATARIO:"

    df_ord = df.sort_values(
        [COL_MUNICIPIO, "_grupo_id", COL_HBL], kind="stable"
    ).copy()

    # Renumerar paradas secuencialmente
    mapa = {}
    contador = 0
    nuevas = []
    for gid in df_ord["_grupo_id"]:
        if gid not in mapa:
            contador += 1
            mapa[gid] = contador
        nuevas.append(mapa[gid])
    df_ord["_parada_num"] = nuevas

    def _primer_dest(serie):
        vals = [str(v).strip() for v in serie.dropna().tolist()
                if str(v).strip() and str(v).strip().lower() != "nan"]
        if not vals:
            return ""
        unicos = list(dict.fromkeys(vals))
        return unicos[0][:40]

    def _estado_parada(serie):
        vals = [str(v).strip() for v in serie.dropna().tolist() if str(v).strip()]
        if not vals:
            return ""
        unicos = set(vals)
        if len(unicos) == 1:
            return next(iter(unicos))
        return "Mixto"

    agg_dict = {
        "Destinatario": (COL_DESTINATARIO, _primer_dest) if COL_DESTINATARIO in df_ord.columns
                         else (COL_HBL, "first"),
        "Dirección": (COL_DIRECCION, "first"),
        "Cant HBLs": (COL_HBL, "count"),
        "Bultos": (COL_BULTOS, "sum"),
    }
    if "Estado" in df_ord.columns:
        agg_dict["Estado"] = ("Estado", _estado_parada)

    resumen = df_ord.groupby(["_parada_num", COL_MUNICIPIO], sort=False).agg(
        **agg_dict
    ).reset_index()

    if "Peso (Kg)" in df_ord.columns:
        peso_por_parada = df_ord.groupby("_parada_num", sort=False)["Peso (Kg)"].apply(
            lambda s: pd.to_numeric(s, errors="coerce").fillna(0).sum()
        ).to_dict()
        resumen["Peso (Kg)"] = resumen["_parada_num"].map(peso_por_parada)
    else:
        resumen["Peso (Kg)"] = 0

    resumen = resumen.rename(columns={
        "_parada_num": "Parada",
        COL_MUNICIPIO: "Municipio",
    })

    columnas_finales = [
        "Parada", "Destinatario", "Dirección", "Municipio",
        "Cant HBLs", "Bultos", "Peso (Kg)",
    ]
    if "Estado" in resumen.columns:
        columnas_finales.append("Estado")

    return resumen[columnas_finales].reset_index(drop=True)

def filtrar_hbls(df, busqueda: str = "", estado: str = "", ubicacion: str = ""):
    """
    Filtra HBLs por:
    - busqueda: busca en HBL, Remitente, Destinatario
    - estado: filtra por estado exacto
    - ubicacion: filtra por municipio O provincia (si coincide con alguno)
    """
    COL_REMITENTE = "Nombre y Apellidos del REMITENTE:"
    COL_DESTINATARIO = "Nombre y Apellidos del DESTINATARIO:"

    # Filtro de búsqueda libre
    if busqueda:
        b = busqueda.lower()
        cols_buscar = [COL_HBL]
        for c in [COL_REMITENTE, COL_DESTINATARIO]:
            if c in df.columns:
                cols_buscar.append(c)

        mask = False
        for c in cols_buscar:
            mask = mask | df[c].astype(str).str.lower().str.contains(b, na=False)
        df = df[mask]

    # Filtro de estado
    if estado and estado != "Todos":
        df = df[df["Estado"] == estado]

    # Filtro de ubicación (municipio O provincia)
    if ubicacion and ubicacion != "Todos":
        mask_ubi = (df[COL_MUNICIPIO] == ubicacion) | (df[COL_PROVINCIA] == ubicacion)
        df = df[mask_ubi]

    return df