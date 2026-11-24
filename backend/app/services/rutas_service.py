"""
Cálculo de la ruta más corta entre las paradas de un repartidor.

Sin un motor de rutas por carretera se trabaja con distancia en línea recta
(haversine) multiplicada por un factor de rodeo, que es una estimación honesta
de los kilómetros reales para ordenar las paradas. El orden se resuelve con
vecino más cercano y después 2-opt, que para decenas de paradas queda en el
óptimo o a muy poca distancia de él.
"""
import math

from app.services.paradas_service import normalizar_texto

# Radio medio de la Tierra en kilómetros.
RADIO_TIERRA_KM = 6371.0

# La distancia en línea recta siempre es menor que la de carretera. Este factor
# convierte la estimación en algo parecido a kilómetros conducidos.
FACTOR_CARRETERA = 1.3


def clave_parada(provincia, municipio, direccion) -> str:
    """Clave estable de una parada para guardar y reutilizar sus coordenadas."""
    return normalizar_texto(f"{provincia}|{municipio}|{direccion}")


def clave_origen(provincia) -> str:
    """Clave de la cabecera provincial, el punto donde arranca la ruta."""
    return f"origen|{normalizar_texto(provincia)}"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en línea recta entre dos coordenadas, en kilómetros."""
    rad = math.radians
    dlat = rad(lat2 - lat1)
    dlon = rad(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2 * RADIO_TIERRA_KM * math.asin(math.sqrt(a))


def distancia_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distancia estimada por carretera entre dos puntos (lat, lon)."""
    return haversine_km(a[0], a[1], b[0], b[1]) * FACTOR_CARRETERA


def _matriz(origen, puntos) -> list[list[float]]:
    """Matriz de distancias: el índice 0 es el origen y 1..n las paradas."""
    todos = [origen] + list(puntos)
    return [[distancia_km(a, b) for b in todos] for a in todos]


def _vecino_mas_cercano(matriz: list[list[float]], inicio: int = 0) -> list[int]:
    """
    Orden por vecino más cercano. Devuelve índices de la matriz (sin el inicio).
    """
    n = len(matriz) - 1
    visitados = {inicio}
    orden = []
    actual = inicio
    while len(orden) < n:
        siguiente = min(
            (i for i in range(1, n + 1) if i not in visitados),
            key=lambda i: (matriz[actual][i], i),
        )
        orden.append(siguiente)
        visitados.add(siguiente)
        actual = siguiente
    return orden


def _dos_opt(
    matriz: list[list[float]], camino: list[int], max_iteraciones: int = 100
) -> list[int]:
    """
    Mejora el camino invirtiendo tramos mientras acorte. El primer punto queda
    fijo (el origen) y el final es libre: es un recorrido de reparto, no un
    circuito cerrado.
    """
    camino = camino[:]
    n = len(camino)
    for _ in range(max_iteraciones):
        mejorado = False
        for i in range(1, n - 1):
            for k in range(i + 1, n):
                anterior, primero = camino[i - 1], camino[i]
                ultimo = camino[k]
                siguiente = camino[k + 1] if k + 1 < n else None

                antes = matriz[anterior][primero]
                despues = matriz[anterior][ultimo]
                if siguiente is not None:
                    antes += matriz[ultimo][siguiente]
                    despues += matriz[primero][siguiente]

                if despues + 1e-9 < antes:
                    camino[i : k + 1] = reversed(camino[i : k + 1])
                    mejorado = True
        if not mejorado:
            break
    return camino


def aplicar_ubicacion(
    parada: dict, guardada: dict | None, correccion: dict | None
) -> None:
    """
    Rellena la ubicación de una parada.

    Manda la corrección hecha a mano; si no hay, la caché del geocodificador; si
    tampoco, la parada se queda sin coordenadas. La corrección puede traer
    además la dirección escrita a mano, que sustituye a la del manifiesto.
    """
    if correccion and correccion.get("lat") is not None and correccion.get("lon") is not None:
        parada["direccion"] = correccion.get("direccion") or parada["direccion"]
        parada["lat"] = correccion["lat"]
        parada["lon"] = correccion["lon"]
        parada["precision"] = "manual"
        return

    if guardada and guardada.get("lat") is not None and guardada.get("lon") is not None:
        parada["lat"] = guardada["lat"]
        parada["lon"] = guardada["lon"]
        parada["precision"] = guardada["precision"]
        return

    parada["lat"] = None
    parada["lon"] = None
    parada["precision"] = None


def resolver_origen(salida: dict | None, cabecera) -> dict:
    """
    Punto desde el que arranca la ruta de un repartidor.

    Manda la base de salida que tenga asignada; si no tiene (o no está
    ubicada), la cabecera provincial; y si tampoco hay coordenadas, la ruta
    empieza en la primera parada, como antes.
    """
    if salida and salida.get("lat") is not None and salida.get("lon") is not None:
        return {
            "lat": salida["lat"],
            "lon": salida["lon"],
            "etiqueta": salida.get("nombre") or "Punto de partida",
            "tipo": "base",
            "punto_id": salida.get("id"),
            "direccion": salida.get("direccion") or "",
        }

    if cabecera is not None:
        return {
            "lat": cabecera[0],
            "lon": cabecera[1],
            "etiqueta": "Cabecera provincial",
            "tipo": "cabecera",
            "punto_id": None,
            "direccion": "",
        }

    return {
        "lat": None,
        "lon": None,
        "etiqueta": None,
        "tipo": "primera_parada",
        "punto_id": None,
        "direccion": "",
    }


def ordenar_paradas(origen, paradas: list[dict]) -> dict:
    """
    Ordena las paradas por cercanía desde `origen`.

    `paradas` lleva `lat` y `lon` en cada elemento (None si no se pudo ubicar).
    Las que no tienen coordenadas se dejan al final, en su orden de entrada, y
    sin distancia: es preferible decirlo a inventarse un punto.

    Devuelve {"orden": [paradas ordenadas], "distancia_km": total}.
    """
    con_coords = [
        p for p in paradas if p.get("lat") is not None and p.get("lon") is not None
    ]
    sin_coords = [
        p for p in paradas if p.get("lat") is None or p.get("lon") is None
    ]

    # Las paradas sin ubicar no tienen tramo: no se sabe cuánto se tarda en llegar.
    for parada in sin_coords:
        parada["tramo_km"] = None

    if not con_coords:
        return {"orden": sin_coords, "distancia_km": 0.0}

    if origen is not None:
        matriz = _matriz(origen, [(p["lat"], p["lon"]) for p in con_coords])
        inicio = 0
    else:
        # Sin cabecera geocodificada, la ruta arranca en la primera parada.
        matriz = [
            [distancia_km(a, b) for b in [(p["lat"], p["lon"]) for p in con_coords]]
            for a in [(p["lat"], p["lon"]) for p in con_coords]
        ]
        inicio = 0

    camino = [inicio] + _vecino_mas_cercano(matriz, inicio)
    camino = _dos_opt(matriz, camino)

    # Con origen, las paradas empiezan en el índice 1 de la matriz (el 0 es él).
    desplazamiento = 1 if origen is not None else 0
    ordenados = [con_coords[i - desplazamiento] for i in camino[desplazamiento:]]

    tramos = [matriz[camino[i]][camino[i + 1]] for i in range(len(camino) - 1)]
    for posicion, parada in enumerate(ordenados):
        parada["tramo_km"] = round(sum(tramos[: posicion + desplazamiento]), 1)

    return {
        "orden": ordenados + sin_coords,
        "distancia_km": round(sum(tramos), 1),
    }
