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


# Niveles de Nominatim que describen un municipio o una división
# administrativa, no una dirección: el punto es el centro de la zona.
NIVELES_APROXIMADOS = {
    "municipality",
    "city",
    "town",
    "village",
    "hamlet",
    "county",
    "state",
    "state_district",
    "region",
    "administrative",
}


def _pedir(cliente: httpx.Client, parametros: dict) -> list:
    """Consulta Nominatim y devuelve la lista de resultados."""
    try:
        respuesta = cliente.get(NOMINATIM_URL, params=parametros)
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

    if not isinstance(datos, list):
        raise GeocodificacionError(
            "El servicio de mapas devolvió una respuesta ilegible."
        )
    return datos


def consultar(cliente: httpx.Client, consulta: str) -> tuple[float, float] | None:
    """
    Busca una dirección y devuelve (lat, lon), o None si no hay resultados.
    """
    datos = _pedir(
        cliente,
        {
            "q": consulta,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "cu",
        },
    )

    if not datos:
        return None

    try:
        return float(datos[0]["lat"]), float(datos[0]["lon"])
    except (KeyError, TypeError, ValueError) as error:
        raise GeocodificacionError(
            "El servicio de mapas devolvió coordenadas inválidas."
        ) from error


def buscar_lugares(
    cliente: httpx.Client, consulta: str, limite: int = 5
) -> list[dict]:
    """
    Busca varios lugares y devuelve lat, lon, etiqueta y si son aproximados.

    Un resultado de nivel municipio (o de otra división administrativa) no es
    una dirección: se marca como aproximado para que el operador lo sepa antes
    de elegirlo como base de salida.
    """
    datos = _pedir(
        cliente,
        {
            "q": consulta,
            "format": "jsonv2",
            "limit": limite,
            "countrycodes": "cu",
        },
    )

    lugares = []
    vistos = set()
    for dato in datos[:limite]:
        try:
            lat = float(dato["lat"])
            lon = float(dato["lon"])
        except (KeyError, TypeError, ValueError) as error:
            raise GeocodificacionError(
                "El servicio de mapas devolvió coordenadas inválidas."
            ) from error

        etiqueta = str(dato.get("display_name") or consulta).strip()
        # Nominatim repite el mismo lugar con coordenadas casi iguales o con
        # el mismo nombre (dos centroides del mismo municipio): se queda el
        # primero, que es el mejor rankeado.
        claves = {
            ("punto", round(lat, 5), round(lon, 5)),
            ("nombre", " ".join(etiqueta.lower().split())),
        }
        if claves & vistos:
            continue
        vistos.update(claves)

        nivel = str(dato.get("addresstype") or dato.get("type") or "").lower()
        lugares.append(
            {
                "lat": lat,
                "lon": lon,
                "etiqueta": etiqueta,
                "aproximado": nivel in NIVELES_APROXIMADOS,
            }
        )
    return lugares


def _consulta(partes: list[str]) -> str:
    """Une los trozos no vacíos de una consulta con comas."""
    return ", ".join(parte.strip() for parte in partes if parte and parte.strip())


def _ultimo_tramo(direccion: str) -> str:
    """Último trozo de una dirección escrita con comas (suele ser el municipio)."""
    tramos = [tramo.strip() for tramo in direccion.split(",") if tramo.strip()]
    return tramos[-1] if tramos else ""


def buscar_candidatos(
    direccion: str, municipio: str = "", provincia: str = "", limite: int = 5
) -> tuple[list[dict], bool]:
    """
    Candidatos para una base de salida.

    Primero se busca la dirección completa. Si no aparece nada, se busca el
    municipio (el indicado o el último tramo de la dirección) y sus resultados
    se devuelven marcados como aproximados.

    Devuelve (resultados, respaldo).
    """
    direccion = (direccion or "").strip()
    municipio = (municipio or "").strip()
    provincia = (provincia or "").strip()
    consulta = _consulta([direccion, municipio, provincia])
    if not consulta:
        return [], False

    with _cliente() as cliente:
        resultados = buscar_lugares(cliente, f"{consulta}, Cuba", limite)
        if resultados:
            return resultados, False

        respaldo = municipio or _ultimo_tramo(direccion)
        if not respaldo:
            return [], False

        # Si el municipio tampoco aparece con la provincia del manifiesto, se
        # prueba sin ella: puede estar en otra provincia o la del manifiesto
        # venir mal escrita.
        candidatas = [_consulta([respaldo, provincia]), _consulta([respaldo])]
        ya_probadas = {consulta.lower()}
        for candidata in candidatas:
            if not candidata or candidata.lower() in ya_probadas:
                continue
            ya_probadas.add(candidata.lower())
            time.sleep(PAUSA_ENTRE_CONSULTAS)
            resultados = buscar_lugares(cliente, f"{candidata}, Cuba", limite)
            if resultados:
                break

    for lugar in resultados:
        lugar["aproximado"] = True
    return resultados, bool(resultados)


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
