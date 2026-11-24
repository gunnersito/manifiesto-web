"""
Pruebas del cálculo de rutas.

Solo tocan funciones puras (distancias y ordenación), así que no necesitan
PostgreSQL ni el servicio de mapas: lo que se comprueba es que la ruta empieza
por lo más cercano, mejora con 2-opt y deja al final lo que no se pudo ubicar.
"""
import os

# config.py exige SECRET_KEY al importarse, igual que en test_api.py.
os.environ.setdefault("SECRET_KEY", "clave-solo-para-pruebas")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/manifiesto_test"
)
os.environ.setdefault("SUPABASE_URL", "https://proyecto-de-pruebas.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "clave-solo-para-pruebas")

from app.services.rutas_service import (  # noqa: E402
    FACTOR_CARRETERA,
    distancia_km,
    haversine_km,
    ordenar_paradas,
)


def _parada(nombre: str, lat, lon) -> dict:
    return {"nombre": nombre, "direccion": nombre, "lat": lat, "lon": lon}


def test_haversine_la_habana_pinar_del_rio():
    # La Habana (23.1136, -82.3666) y Pinar del Río (22.4175, -83.6981) están a
    # unos 160 km en línea recta.
    distancia = haversine_km(23.1136, -82.3666, 22.4175, -83.6981)
    assert 150 <= distancia <= 175


def test_distancia_por_carretera_aplica_el_factor():
    recta = haversine_km(23.0, -82.0, 23.1, -82.1)
    assert distancia_km((23.0, -82.0), (23.1, -82.1)) == recta * FACTOR_CARRETERA


def test_la_ruta_empieza_por_la_parada_mas_cercana():
    origen = (22.4175, -83.6981)
    paradas = [
        _parada("lejos", 22.60, -83.40),
        _parada("cerca", 22.43, -83.69),
        _parada("medio", 22.50, -83.55),
    ]

    resultado = ordenar_paradas(origen, paradas)

    assert [p["nombre"] for p in resultado["orden"]] == ["cerca", "medio", "lejos"]


def test_recorre_las_paradas_en_linea_sin_volver_atras():
    # Cuatro paradas alineadas y desordenadas: la mejor ruta es recorrerlas de
    # oeste a este, sin saltos hacia atrás.
    origen = (22.0, -83.0)
    paradas = [
        _parada("d", 22.0, -82.70),
        _parada("b", 22.0, -82.90),
        _parada("a", 22.0, -82.95),
        _parada("c", 22.0, -82.80),
    ]

    resultado = ordenar_paradas(origen, paradas)
    nombres = [p["nombre"] for p in resultado["orden"]]

    assert nombres == ["a", "b", "c", "d"]
    # Cada parada guarda la distancia recorrida hasta ella, siempre creciente.
    tramos = [p["tramo_km"] for p in resultado["orden"]]
    assert tramos == sorted(tramos)
    assert abs(resultado["distancia_km"] - tramos[-1]) <= 0.2


def test_las_paradas_sin_coordenadas_van_al_final():
    origen = (22.4175, -83.6981)
    paradas = [
        _parada("sin ubicar", None, None),
        _parada("ubicada", 22.43, -83.69),
    ]

    resultado = ordenar_paradas(origen, paradas)

    assert [p["nombre"] for p in resultado["orden"]] == ["ubicada", "sin ubicar"]
    assert resultado["orden"][1]["tramo_km"] is None


def test_sin_coordenadas_no_se_inventa_distancia():
    paradas = [_parada("a", None, None), _parada("b", None, None)]

    resultado = ordenar_paradas((22.0, -83.0), paradas)

    assert [p["nombre"] for p in resultado["orden"]] == ["a", "b"]
    assert resultado["distancia_km"] == 0.0
