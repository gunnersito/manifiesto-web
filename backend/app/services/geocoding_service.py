"""
Geocodificación de direcciones con Nominatim (OpenStreetMap).

Las direcciones del manifiesto son texto libre, así que se consulta una vez por
dirección y el resultado se guarda en la base (ver `geocodificaciones` en
database.py). Nominatim pide como máximo una petición por segundo y un
User-Agent que identifique la aplicación; ambas cosas se respetan aquí.
"""
import os
import time

import httpx

NOMINATIM_URL = os.getenv(
    "NOMINATIM_URL", "https://nominatim.openstreetmap.org/search"
)
USER_AGENT = os.getenv(
    "NOMINATIM_USER_AGENT",
    "manifiesto-web/0.1 (gestion de manifiestos de carga)",
)
# Nominatim limita a 1 petición por segundo.
PAUSA_ENTRE_CONSULTAS = 1.1
TIMEOUT_SEGUNDOS = 15.0


class GeocodificacionError(Exception):
    """El servicio de mapas no respondió o respondió algo inesperado."""


def _cliente() -> httpx.Client:
    return httpx.Client(
        timeout=TIMEOUT_SEGUNDOS,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Language": "es",
        },
    )


def consultar(cliente: httpx.Client, consulta: str) -> tuple[float, float] | None:
    """
    Busca una dirección y devuelve (lat, lon), o None si no hay resultados.
    """
    try:
        respuesta = cliente.get(
            NOMINATIM_URL,
            params={
                "q": consulta,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "cu",
            },
        )
        respuesta.raise_for_status()
        datos = respuesta.json()
    except httpx.HTTPStatusError as error:
        raise GeocodificacionError(
            f"El servicio de mapas respondió {error.response.status_code}. "
            "Espera un momento y vuelve a intentarlo."
        ) from error
    except httpx.HTTPError as error:
        raise GeocodificacionError(
            "No se pudo contactar con el servicio de mapas. Comprueba la conexión "
            "y vuelve a intentarlo."
        ) from error
    except ValueError as error:
        raise GeocodificacionError(
            "El servicio de mapas devolvió una respuesta ilegible."
        ) from error

    if not datos:
        return None

    try:
        return float(datos[0]["lat"]), float(datos[0]["lon"])
    except (KeyError, TypeError, ValueError) as error:
        raise GeocodificacionError(
            "El servicio de mapas devolvió coordenadas inválidas."
        ) from error


def geocodificar_lote(
    consultas: list[str], pausa: float = PAUSA_ENTRE_CONSULTAS
) -> list[tuple[float, float] | None]:
    """
    Geocodifica varias direcciones en orden, respetando la pausa entre ellas.

    Si una consulta falla por un error del servicio se propaga la excepción: es
    mejor que el usuario reintente que guardar coordenadas inventadas.
    """
    if not consultas:
        return []

    resultados = []
    with _cliente() as cliente:
        for indice, consulta in enumerate(consultas):
            resultados.append(consultar(cliente, consulta))
            if indice < len(consultas) - 1:
                time.sleep(pausa)
    return resultados


def geocodificar_texto(consulta: str) -> tuple[float, float] | None:
    """Geocodifica un texto suelto (por ejemplo la cabecera de una provincia)."""
    with _cliente() as cliente:
        return consultar(cliente, consulta)


def geocodificar_paradas(
    paradas: list[dict], pausa: float = PAUSA_ENTRE_CONSULTAS
) -> list[tuple[str, float | None, float | None, str]]:
    """
    Geocodifica paradas con respaldo por municipio.

    Cada elemento de `paradas` lleva `clave`, `direccion`, `municipio` y
    `provincia`. Se intenta la dirección completa y, si no aparece, el municipio
    (marcado como precisión "municipio" para que la ruta avise de que es
    aproximada). Si tampoco hay municipio queda como "fallida".

    Devuelve [(clave, lat, lon, precision)].
    """
    if not paradas:
        return []

    resultados = []
    with _cliente() as cliente:
        for indice, parada in enumerate(paradas):
            if indice > 0:
                time.sleep(pausa)

            direccion = (parada.get("direccion") or "").strip()
            municipio = (parada.get("municipio") or "").strip()
            provincia = (parada.get("provincia") or "").strip()

            ubicacion = (
                consultar(cliente, f"{direccion}, {municipio}, {provincia}, Cuba")
                if direccion
                else None
            )
            precision = "direccion"

            if ubicacion is None and municipio:
                time.sleep(pausa)
                ubicacion = consultar(cliente, f"{municipio}, {provincia}, Cuba")
                precision = "municipio"

            if ubicacion is None:
                resultados.append((parada["clave"], None, None, "fallida"))
            else:
                resultados.append((parada["clave"], ubicacion[0], ubicacion[1], precision))

    return resultados
