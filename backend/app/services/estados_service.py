"""
Servicio de estados de entrega.
Combina la información del DataFrame del manifiesto con los estados en SQLite.
"""
import pandas as pd

from app.core.config import COL_HBL, ESTADO_DEFAULT
from app.core.database import (
    obtener_estados_por_hbls,
    guardar_estado as db_guardar_estado,
    guardar_estados_masivo as db_guardar_estados_masivo,
    eliminar_estado as db_eliminar_estado,
)


def enriquecer_df_con_estados(df: pd.DataFrame) -> pd.DataFrame:
    """
    Añade una columna 'Estado' al DataFrame cruzando los HBLs con la BD.
    Si un HBL no está en la BD, se marca como 'Pendiente'.
    """
    df = df.copy()
    # Solo se consultan los HBLs del DataFrame, no la tabla entregas entera.
    hbls = df[COL_HBL].astype(str).unique().tolist() if len(df) else []
    estados_bd = obtener_estados_por_hbls(hbls)
    df["Estado"] = df[COL_HBL].astype(str).map(
        lambda h: estados_bd.get(h, ESTADO_DEFAULT)
    )
    return df


def guardar_estado(hbl: str, estado: str, usuario: str = None):
    """Wrapper del guardar_estado de la BD (para tenerlo todo en un solo servicio)."""
    db_guardar_estado(hbl, estado, usuario)


def eliminar_estado(hbl: str):
    """Elimina el estado de un HBL (vuelve a Pendiente)."""
    db_eliminar_estado(hbl)


def guardar_estados_masivo(hbls: list, estado: str, usuario: str = None):
    """
    Guarda el estado de varios HBLs de una vez, con una sola conexión y un solo
    commit. Devuelve la cantidad de HBLs afectados.
    """
    return db_guardar_estados_masivo(hbls, estado, usuario)


def obtener_estados_por_hbl(hbls: list) -> dict:
    """
    Dado un listado de HBLs, devuelve un dict {hbl: estado} solo con esos HBLs.
    Útil para consultas específicas.
    """
    estados = obtener_estados_por_hbls([str(hbl) for hbl in hbls])
    return {hbl: estados.get(str(hbl), ESTADO_DEFAULT) for hbl in hbls}