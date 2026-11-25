"""
Rutas de reparto.

Cada municipio de un manifiesto se asigna a un repartidor. Con las paradas de
sus municipios se calcula el orden de visita más corto desde su punto de
salida (una base del catálogo) o, si no tiene, desde la cabecera provincial,
usando las coordenadas guardadas en `geocodificaciones`.

Las direcciones son texto libre y no todas se pueden ubicar, así que la
precisión se devuelve junto a cada parada: "direccion" (exacta), "municipio"
(aproximada) o ninguna (sin ubicar).
"""
import re
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

from app.api.routes.manifiestos import verificar_admin, verificar_lector
from app.core.config import (
    COL_BULTOS,
    COL_DIRECCION,
    COL_HBL,
    COL_MUNICIPIO,
    COL_PROVINCIA,
)
from app.core.database import (
    crear_repartidor,
    eliminar_correccion,
    eliminar_punto_partida,
    eliminar_repartidor,
    guardar_asignacion,
    guardar_correccion,
    guardar_geocodificaciones,
    guardar_punto_partida,
    guardar_salida,
    listar_puntos_partida,
    listar_repartidores,
    obtener_asignaciones,
    obtener_correcciones,
    obtener_geocodificaciones,
    obtener_hbls_de_provincia,
    obtener_salida,
)
from app.services.estados_service import enriquecer_df_con_estados
from app.services.excel_exporter import exportar_ruta_repartidor_excel
from app.services.geocoding_service import (
    GeocodificacionError,
    buscar_candidatos,
    geocodificar_paradas,
    geocodificar_texto,
)
from app.services.paradas_service import marcar_paradas
from app.services.rutas_service import (
    aplicar_ubicacion,
    clave_origen,
    clave_parada,
    ordenar_paradas,
    resolver_origen,
)

router = APIRouter(
    prefix="/rutas",
    tags=["Rutas"],
    dependencies=[Depends(verificar_lector)],
)

# Una parada en estos estados ya no hay que visitarla.
ESTADOS_CERRADOS = {"Entregada", "Devuelto Almacén"}

# Nombre de cada columna de la tabla `hbls` en el DataFrame que esperan los
# servicios de paradas (mismo mapeo que usa la carga del manifiesto).
_COLUMNAS_BD = {
    "hbl": COL_HBL,
    "provincia": COL_PROVINCIA,
    "municipio": COL_MUNICIPIO,
    "direccion": COL_DIRECCION,
    "remitente": "Nombre y Apellidos del REMITENTE:",
    "destinatario": "Nombre y Apellidos del DESTINATARIO:",
    "telefono": "Teléfono del DESTINATARIO",
    "contenido": "Contenido del paquete (Descripción)",
    "bultos": COL_BULTOS,
    "peso": "Peso (Kg)",
    "parada": "Paradas",
}


class RepartidorNuevo(BaseModel):
    nombre: str


class Asignacion(BaseModel):
    manifiesto_id: int
    provincia: str
    municipio: str
    repartidor: Optional[str] = None


class CorreccionParada(BaseModel):
    provincia: str
    municipio: str
    direccion: str
    direccion_corregida: Optional[str] = None
    lat: float
    lon: float


class BusquedaDireccion(BaseModel):
    direccion: str
    municipio: str
    provincia: str


class PuntoPartidaNuevo(BaseModel):
    nombre: str
    direccion: str = ""
    lat: float
    lon: float


class AsignacionSalida(BaseModel):
    provincia: str
    repartidor: str
    punto_id: Optional[int] = None


class BusquedaSalida(BaseModel):
    direccion: str
    municipio: str = ""
    provincia: str = ""


# ============================================================
# PARADAS DE LA PROVINCIA
# ============================================================
def _primer_texto(serie) -> str:
    """Primer valor no vacío de una columna, para destinatario y teléfono."""
    for valor in serie.tolist():
        if valor is None or pd.isna(valor):
            continue
        texto = str(valor).strip()
        if texto and texto.lower() != "nan":
            return texto
    return ""


def _paradas_de_provincia(manifiesto_id: int, provincia: str) -> list[dict]:
    """
    Paradas de una provincia con sus HBLs, bultos, peso y estado.

    Se calculan con el mismo agrupado que el resumen de provincias, así que los
    números coinciden con los que ya muestra la app.
    """
    filas = obtener_hbls_de_provincia(manifiesto_id, provincia)
    if not filas:
        raise HTTPException(
            status_code=404,
            detail="Esa provincia no tiene HBLs en este manifiesto",
        )

    df = pd.DataFrame(filas).rename(columns=_COLUMNAS_BD)
    df = marcar_paradas(enriquecer_df_con_estados(df))

    paradas = []
    for _, grupo in df.groupby("_grupo_id", sort=False):
        primera = grupo.iloc[0]
        municipio = str(primera[COL_MUNICIPIO])
        direccion = str(primera[COL_DIRECCION])
        estados = {str(e).strip() for e in grupo["Estado"].tolist() if str(e).strip()}

        paradas.append(
            {
                "clave": clave_parada(provincia, municipio, direccion),
                "municipio": municipio,
                "direccion": direccion,
                # La del manifiesto: es la que identifica la parada al corregirla.
                "direccion_original": direccion,
                "destinatario": _primer_texto(
                    grupo["Nombre y Apellidos del DESTINATARIO:"]
                ),
                "telefono": _primer_texto(grupo["Teléfono del DESTINATARIO"]),
                "hbls": [str(h) for h in grupo[COL_HBL].tolist()],
                "bultos": int(pd.to_numeric(grupo[COL_BULTOS], errors="coerce").fillna(0).sum()),
                "peso": float(
                    pd.to_numeric(grupo["Peso (Kg)"], errors="coerce").fillna(0).sum()
                ),
                "estado": next(iter(estados)) if len(estados) == 1 else "Mixto",
            }
        )

    return paradas


def _aplicar_coordenadas(parada: dict, guardadas: dict, correcciones: dict) -> None:
    """Copia a la parada su corrección manual o sus coordenadas guardadas."""
    aplicar_ubicacion(
        parada, guardadas.get(parada["clave"]), correcciones.get(parada["clave"])
    )


def _coordenadas_de_origen(provincia: str, guardadas: dict):
    dato = guardadas.get(clave_origen(provincia))
    if dato and dato["lat"] is not None and dato["lon"] is not None:
        return (dato["lat"], dato["lon"])
    return None


# ============================================================
# REPARTIDORES
# ============================================================
@router.get("/repartidores")
def obtener_repartidores():
    """Repartidores dados de alta."""
    return {"repartidores": listar_repartidores()}


@router.post("/repartidores", dependencies=[Depends(verificar_admin)])
def nuevo_repartidor(datos: RepartidorNuevo):
    nombre = datos.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    if not crear_repartidor(nombre):
        raise HTTPException(status_code=409, detail="Ese repartidor ya existe")
    return {"repartidores": listar_repartidores()}


@router.delete("/repartidores/{nombre}", dependencies=[Depends(verificar_admin)])
def borrar_repartidor(nombre: str):
    """Borra el repartidor y deja sus municipios sin asignar."""
    eliminar_repartidor(nombre)
    return {"repartidores": listar_repartidores()}


@router.put("/asignaciones", dependencies=[Depends(verificar_admin)])
def asignar_municipio(datos: Asignacion):
    """Asigna un municipio a un repartidor (o lo deja sin asignar)."""
    repartidor = (datos.repartidor or "").strip() or None
    if repartidor and repartidor not in listar_repartidores():
        raise HTTPException(status_code=404, detail="Ese repartidor no existe")
    guardar_asignacion(
        datos.manifiesto_id, datos.provincia, datos.municipio, repartidor
    )
    return {"municipio": datos.municipio, "repartidor": repartidor}


# ============================================================
# PUNTOS DE PARTIDA (BASES DE SALIDA)
# ============================================================
@router.get("/puntos-partida")
def obtener_puntos_partida():
    """Bases de salida reutilizables entre manifiestos."""
    return {"puntos": listar_puntos_partida()}


@router.post("/puntos-partida", dependencies=[Depends(verificar_admin)])
def crear_punto_partida(datos: PuntoPartidaNuevo):
    """Crea una base de salida (o actualiza la que tenga ese nombre)."""
    nombre = datos.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    if not -90 <= datos.lat <= 90:
        raise HTTPException(status_code=400, detail="La latitud debe estar entre -90 y 90")
    if not -180 <= datos.lon <= 180:
        raise HTTPException(status_code=400, detail="La longitud debe estar entre -180 y 180")

    punto_id = guardar_punto_partida(
        nombre, datos.direccion.strip(), datos.lat, datos.lon
    )
    return {"id": punto_id, "puntos": listar_puntos_partida()}


@router.post("/puntos-partida/buscar", dependencies=[Depends(verificar_admin)])
def buscar_punto_partida(datos: BusquedaSalida):
    """
    Lugares que OpenStreetMap encuentra para una base de salida.

    Devuelve todos los candidatos para que el operador elija el correcto. Si
    la dirección completa no aparece, responde con el municipio marcado como
    aproximado.
    """
    if not (datos.direccion.strip() or datos.municipio.strip()):
        raise HTTPException(status_code=400, detail="Escribe una dirección para buscar")

    try:
        resultados, respaldo = buscar_candidatos(
            datos.direccion, datos.municipio, datos.provincia
        )
    except GeocodificacionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return {
        "resultados": resultados,
        "respaldo": respaldo,
        "mensaje": None
        if resultados
        else "El mapa no encontró esa dirección. Prueba con el municipio o "
        "escribe las coordenadas a mano.",
    }


@router.delete("/puntos-partida/{punto_id}", dependencies=[Depends(verificar_admin)])
def borrar_punto_partida(punto_id: int):
    """Borra una base; los repartidores que salían de ella vuelven a la cabecera."""
    eliminar_punto_partida(punto_id)
    return {"puntos": listar_puntos_partida()}


# ============================================================
# RESUMEN DE LA PROVINCIA
# ============================================================
@router.get("/{manifiesto_id}")
def resumen_de_rutas(manifiesto_id: int, provincia: str = Query(...)):
    """
    Municipios de la provincia con su repartidor y el estado de las coordenadas.
    """
    paradas = _paradas_de_provincia(manifiesto_id, provincia)
    asignaciones = obtener_asignaciones(manifiesto_id, provincia)
    claves = [p["clave"] for p in paradas]
    guardadas = obtener_geocodificaciones(claves)
    correcciones = obtener_correcciones(claves)

    municipios = {}
    for parada in paradas:
        datos = municipios.setdefault(
            parada["municipio"],
            {
                "municipio": parada["municipio"],
                "paradas": 0,
                "bultos": 0,
                "ubicadas": 0,
                "repartidor": asignaciones.get(parada["municipio"]),
            },
        )
        datos["paradas"] += 1
        datos["bultos"] += parada["bultos"]
        ubicada = correcciones.get(parada["clave"]) or guardadas.get(parada["clave"], {})
        if ubicada.get("lat") is not None:
            datos["ubicadas"] += 1

    nombres = listar_repartidores()
    repartidores = []
    for nombre in nombres:
        suyos = [m for m in municipios.values() if m["repartidor"] == nombre]
        repartidores.append(
            {
                "nombre": nombre,
                "municipios": [m["municipio"] for m in suyos],
                "paradas": sum(m["paradas"] for m in suyos),
                "bultos": sum(m["bultos"] for m in suyos),
            }
        )

    sin_entrada = sum(
        1
        for p in paradas
        if p["clave"] not in guardadas and p["clave"] not in correcciones
    )
    fallidas = sum(
        1
        for p in paradas
        if p["clave"] not in correcciones
        and guardadas.get(p["clave"], {}).get("precision") == "fallida"
    )
    corregidas = len(correcciones)

    return {
        "provincia": provincia,
        "municipios": sorted(municipios.values(), key=lambda m: m["municipio"]),
        "repartidores": repartidores,
        "total_paradas": len(paradas),
        "total_bultos": sum(p["bultos"] for p in paradas),
        "pendientes_geocodificar": sin_entrada,
        "fallidas": fallidas,
        "corregidas": corregidas,
    }


@router.get("/{manifiesto_id}/salida")
def salida_de_ruta(
    manifiesto_id: int,
    provincia: str = Query(...),
    repartidor: str = Query(...),
):
    """Punto desde el que arranca la ruta del repartidor."""
    guardadas = obtener_geocodificaciones([clave_origen(provincia)])
    origen = resolver_origen(
        obtener_salida(manifiesto_id, provincia, repartidor),
        _coordenadas_de_origen(provincia, guardadas),
    )
    return {"origen": origen}


@router.put("/{manifiesto_id}/salida", dependencies=[Depends(verificar_admin)])
def asignar_salida(manifiesto_id: int, datos: AsignacionSalida):
    """Fija de qué base sale el repartidor (sin punto, vuelve a la cabecera)."""
    repartidor = datos.repartidor.strip()
    if not repartidor:
        raise HTTPException(status_code=400, detail="Hay que indicar el repartidor")
    if datos.punto_id is not None and datos.punto_id not in {
        punto["id"] for punto in listar_puntos_partida()
    }:
        raise HTTPException(status_code=404, detail="Ese punto de partida no existe")

    guardar_salida(manifiesto_id, datos.provincia, repartidor, datos.punto_id)
    return {"repartidor": repartidor, "punto_id": datos.punto_id}


# ============================================================
# RUTA DE UN REPARTIDOR
# ============================================================
def _ruta_calculada(
    manifiesto_id: int, nombre: str, provincia: str, solo_pendientes: bool
) -> dict:
    """
    Paradas del repartidor ordenadas de la más cercana a la siguiente.

    La ruta arranca en la base de salida del repartidor o, si no tiene una
    asignada, en la cabecera de la provincia (geocodificada como
    "Provincia, Cuba"). Termina en la última entrega: es un recorrido abierto,
    no un ida y vuelta a la base. La usan la pantalla y el Excel, para que la
    hoja salga en el mismo orden.
    """
    paradas = _paradas_de_provincia(manifiesto_id, provincia)
    asignaciones = obtener_asignaciones(manifiesto_id, provincia)
    municipios = {m for m, r in asignaciones.items() if r == nombre}

    if not municipios:
        return {
            "repartidor": nombre,
            "provincia": provincia,
            "paradas": [],
            "distancia_km": 0,
            "total_paradas": 0,
            "total_bultos": 0,
            "total_peso": 0,
            "sin_ubicar": 0,
            "aproximadas": 0,
            "origen": None,
            "mensaje": "Este repartidor no tiene municipios asignados en esta provincia.",
        }

    paradas = [p for p in paradas if p["municipio"] in municipios]
    if solo_pendientes:
        paradas = [p for p in paradas if p["estado"] not in ESTADOS_CERRADOS]

    guardadas = obtener_geocodificaciones(
        [p["clave"] for p in paradas] + [clave_origen(provincia)]
    )
    correcciones = obtener_correcciones([p["clave"] for p in paradas])
    for parada in paradas:
        _aplicar_coordenadas(parada, guardadas, correcciones)

    origen = resolver_origen(
        obtener_salida(manifiesto_id, provincia, nombre),
        _coordenadas_de_origen(provincia, guardadas),
    )
    punto_origen = (
        (origen["lat"], origen["lon"]) if origen["tipo"] != "primera_parada" else None
    )
    resultado = ordenar_paradas(punto_origen, paradas)

    ordenadas = []
    for posicion, parada in enumerate(resultado["orden"], start=1):
        parada["orden"] = posicion
        ordenadas.append(parada)

    return {
        "repartidor": nombre,
        "provincia": provincia,
        "municipios": sorted(municipios),
        "origen": origen,
        "paradas": ordenadas,
        "distancia_km": resultado["distancia_km"],
        "total_paradas": len(ordenadas),
        "total_bultos": sum(p["bultos"] for p in ordenadas),
        "total_peso": round(sum(p["peso"] for p in ordenadas), 1),
        "sin_ubicar": sum(1 for p in ordenadas if p["lat"] is None),
        "aproximadas": sum(1 for p in ordenadas if p["precision"] == "municipio"),
        "mensaje": None,
    }


@router.get("/{manifiesto_id}/repartidor/{nombre}")
def ruta_de_repartidor(
    manifiesto_id: int,
    nombre: str,
    provincia: str = Query(...),
    solo_pendientes: bool = Query(True),
):
    """Ruta del repartidor con sus paradas ya ordenadas."""
    return _ruta_calculada(manifiesto_id, nombre, provincia, solo_pendientes)


@router.get("/{manifiesto_id}/repartidor/{nombre}/excel")
def exportar_ruta_de_repartidor(
    manifiesto_id: int,
    nombre: str,
    provincia: str = Query(...),
    solo_pendientes: bool = Query(True),
):
    """Descarga la ruta en Excel, en el mismo orden que la pantalla."""
    ruta = _ruta_calculada(manifiesto_id, nombre, provincia, solo_pendientes)
    excel = exportar_ruta_repartidor_excel(ruta)

    partes = [re.sub(r"[^A-Za-z0-9_-]+", "_", texto).strip("_") for texto in (nombre, provincia)]
    archivo = "ruta_" + "_".join(parte for parte in partes if parte) + ".xlsx"

    return Response(
        content=excel,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{archivo}"'},
    )


# ============================================================
# GEOCODIFICACIÓN
# ============================================================
@router.post("/{manifiesto_id}/geocodificar", dependencies=[Depends(verificar_admin)])
def preparar_coordenadas(
    manifiesto_id: int,
    provincia: str = Query(...),
    limite: int = Query(20, ge=1, le=50),
):
    """
    Geocodifica las paradas que aún no tienen coordenadas.

    Se hace por tandas (20 por defecto) porque el servicio de mapas admite una
    petición por segundo: la pantalla repite la llamada hasta terminar y muestra
    el avance. Las coordenadas quedan guardadas y no se vuelven a consultar.
    """
    paradas = _paradas_de_provincia(manifiesto_id, provincia)
    por_clave = {p["clave"]: p for p in paradas}
    claves = list(por_clave)

    guardadas = obtener_geocodificaciones(claves + [clave_origen(provincia)])
    corregidas = obtener_correcciones(claves)
    faltan = [
        clave
        for clave in claves
        if clave not in corregidas
        and (clave not in guardadas or guardadas[clave]["precision"] == "fallida")
    ]

    pendientes_antes = len(faltan)
    lote = faltan[:limite]

    try:
        filas = geocodificar_paradas(
            [
                {
                    "clave": clave,
                    "direccion": por_clave[clave]["direccion"],
                    "municipio": por_clave[clave]["municipio"],
                    "provincia": provincia,
                }
                for clave in lote
            ]
        )

        origen_clave = clave_origen(provincia)
        origen_guardado = guardadas.get(origen_clave)
        if origen_guardado is None or origen_guardado["lat"] is None:
            ubicacion = geocodificar_texto(f"{provincia}, Cuba")
            if ubicacion is not None:
                filas.append((origen_clave, ubicacion[0], ubicacion[1], "provincia"))
    except GeocodificacionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    guardar_geocodificaciones(filas)

    despues = obtener_geocodificaciones(claves + [clave_origen(provincia)])
    resultados_lote = {fila[0]: fila[3] for fila in filas}
    pendientes = sum(
        1
        for clave in claves
        if clave not in corregidas
        and (clave not in despues or despues[clave]["precision"] == "fallida")
    )

    return {
        "provincia": provincia,
        "procesadas": len(resultados_lote),
        "ubicadas": sum(1 for p in resultados_lote.values() if p in ("direccion", "municipio")),
        "aproximadas": sum(1 for p in resultados_lote.values() if p == "municipio"),
        "fallidas": sum(1 for p in resultados_lote.values() if p == "fallida"),
        "pendientes_antes": pendientes_antes,
        "pendientes": pendientes,
    }


# ============================================================
# CORRECCIONES A MANO
# ============================================================
@router.put("/paradas/correccion", dependencies=[Depends(verificar_admin)])
def corregir_parada(datos: CorreccionParada):
    """
    Fija a mano la ubicación de una parada (y, si se quiere, su dirección).

    La corrección se guarda por la dirección original, así que vale también
    para los demás manifiestos que traigan esa misma parada, y manda sobre lo
    que haya devuelto el geocodificador.
    """
    if not -90 <= datos.lat <= 90:
        raise HTTPException(status_code=400, detail="La latitud debe estar entre -90 y 90")
    if not -180 <= datos.lon <= 180:
        raise HTTPException(status_code=400, detail="La longitud debe estar entre -180 y 180")

    direccion_corregida = (datos.direccion_corregida or "").strip()
    clave = clave_parada(datos.provincia, datos.municipio, datos.direccion)
    guardar_correccion(clave, direccion_corregida or None, datos.lat, datos.lon)

    return {
        "clave": clave,
        "direccion": direccion_corregida or datos.direccion,
        "lat": datos.lat,
        "lon": datos.lon,
    }


@router.delete("/paradas/correccion", dependencies=[Depends(verificar_admin)])
def quitar_correccion(
    provincia: str = Query(...),
    municipio: str = Query(...),
    direccion: str = Query(...),
):
    """Quita la corrección: la parada vuelve a la ubicación del geocodificador."""
    eliminar_correccion(clave_parada(provincia, municipio, direccion))
    return {"status": "ok"}


@router.post("/paradas/buscar", dependencies=[Depends(verificar_admin)])
def buscar_ubicacion(datos: BusquedaDireccion):
    """Busca unas coordenadas para la dirección escrita en el formulario."""
    consulta = f"{datos.direccion}, {datos.municipio}, {datos.provincia}, Cuba"
    try:
        ubicacion = geocodificar_texto(consulta)
    except GeocodificacionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    if ubicacion is None:
        return {"lat": None, "lon": None}
    return {"lat": ubicacion[0], "lon": ubicacion[1]}
