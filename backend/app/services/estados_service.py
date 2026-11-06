"""
Servicio de estados de entrega.
Combina la información del DataFrame del manifiesto con los estados en SQLite.
"""
import pandas as pd

from app.core.config import COL_HBL, ESTADO_DEFAULT
from app.core.database import (
    obtener_todos_estados,
    guardar_estado as db_guardar_estado,
    eliminar_estado as db_eliminar_estado,
)


def enriquecer_df_con_estados(df: pd.DataFrame) -> pd.DataFrame:
    """
    Añade una columna 'Estado' al DataFrame cruzando los HBLs con la BD.
    Si un HBL no está en la BD, se marca como 'Pendiente'.
    """
    estados_bd = obtener_todos_estados()
    df = df.copy()
    df["Estado"] = df[COL_HBL].astype(str).map(
        lambda h: estados_bd.get(str(h), {}).get("estado", ESTADO_DEFAULT)
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
    Guarda el estado de varios HBLs de una vez.
    Devuelve la cantidad de HBLs afectados.
    """
    contador = 0
    for hbl in hbls:
        guardar_estado(hbl, estado, usuario)
        contador += 1
    return contador


def obtener_estados_por_hbl(hbls: list) -> dict:
    """
    Dado un listado de HBLs, devuelve un dict {hbl: estado} solo con esos HBLs.
    Útil para consultas específicas.
    """
    todos = obtener_todos_estados()
    return {hbl: todos.get(str(hbl), {}).get("estado", ESTADO_DEFAULT) for hbl in hbls}