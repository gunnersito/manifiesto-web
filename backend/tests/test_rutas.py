"""
Pruebas del cálculo de rutas.

Solo tocan funciones puras (distancias y ordenación), así que no necesitan
PostgreSQL ni el servicio de mapas: lo que se comprueba es que la ruta empieza
por lo más cercano, mejora con 2-opt y deja al final lo que no se pudo ubicar.
"""
import io
import os

import pandas as pd

# config.py exige SECRET_KEY al importarse, igual que en test_api.py.
os.environ.setdefault("SECRET_KEY", "clave-solo-para-pruebas")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/manifiesto_test"
)
os.environ.setdefault("SUPABASE_URL", "https://proyecto-de-pruebas.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "clave-solo-para-pruebas")

from app.services.excel_exporter import exportar_ruta_repartidor_excel  # noqa: E402
from app.services.rutas_service import (  # noqa: E402
    FACTOR_CARRETERA,
    distancia_km,
    haversine_km,
    ordenar_paradas,
    resolver_origen,
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


def test_el_excel_de_la_ruta_respeta_el_orden_de_la_pantalla():
    # La hoja tiene que salir igual que la pantalla: mismo orden, mismas
    # columnas y los kilómetros acumulados de cada parada.
    ruta = {
        "repartidor": "Luis",
        "provincia": "PINAR DEL RIO",
        "paradas": [
            {
                "orden": 1,
                "municipio": "Consolación del Sur",
                "direccion": "Calle 30 #1503",
                "destinatario": "Ana",
                "telefono": "5555",
                "hbls": ["A-1", "A-2"],
                "bultos": 2,
                "peso": 5.0,
                "estado": "Pendiente",
                "tramo_km": 18.4,
                "precision": "direccion",
            },
            {
                "orden": 2,
                "municipio": "Pinar del Río",
                "direccion": "Calle Martí 120",
                "destinatario": "Beto",
                "telefono": "",
                "hbls": ["B-1"],
                "bultos": 1,
                "peso": 2.5,
                "estado": "Mixto",
                "tramo_km": None,
                "precision": None,
            },
        ],
        "distancia_km": 18.4,
        "total_paradas": 2,
        "total_bultos": 3,
        "total_peso": 7.5,
        "aproximadas": 0,
        "sin_ubicar": 1,
    }

    excel = exportar_ruta_repartidor_excel(ruta)
    tabla = pd.read_excel(io.BytesIO(excel))

    assert list(tabla.columns) == [
        "Parada", "Municipio", "Dirección", "Destinatario", "Teléfono", "HBLs",
        "Bultos", "Peso (Kg)", "Estado", "Km", "Ubicación",
    ]
    assert list(tabla["Parada"].head(2)) == [1, 2]
    assert list(tabla["Dirección"].head(2)) == ["Calle 30 #1503", "Calle Martí 120"]
    kms = list(tabla["Km"].head(2))
    assert kms[0] == 18.4
    # Una parada sin ubicar no lleva kilómetros: la celda queda vacía.
    assert pd.isna(kms[1])
    assert list(tabla["Ubicación"].head(2)) == ["Exacta", "Sin ubicar"]


def test_la_base_del_repartidor_manda_sobre_la_cabecera():
    origen = resolver_origen(
        {
            "id": 3,
            "nombre": "Almacén Central",
            "direccion": "Calle Martí 120",
            "lat": 22.41,
            "lon": -83.69,
        },
        (22.31, -83.94),
    )

    assert origen["tipo"] == "base"
    assert origen["etiqueta"] == "Almacén Central"
    assert origen["punto_id"] == 3
    assert (origen["lat"], origen["lon"]) == (22.41, -83.69)


def test_sin_base_se_usa_la_cabecera_y_sin_nada_la_primera_parada():
    cabecera = resolver_origen(None, (22.31, -83.94))
    assert cabecera["tipo"] == "cabecera"
    assert cabecera["etiqueta"] == "Cabecera provincial"
    assert (cabecera["lat"], cabecera["lon"]) == (22.31, -83.94)

    sin_nada = resolver_origen(None, None)
    assert sin_nada["tipo"] == "primera_parada"
    assert sin_nada["lat"] is None
    assert sin_nada["lon"] is None


def test_la_correccion_a_mano_manda_sobre_la_cache():
    from app.services.rutas_service import aplicar_ubicacion

    parada = {"direccion": "Calle del manifiesto", "municipio": "Pinar del Río"}

    aplicar_ubicacion(
        parada,
        {"lat": 22.0, "lon": -83.0, "precision": "municipio"},
        {"direccion": "Calle corregida 123", "lat": 22.41, "lon": -83.69},
    )

    assert parada["lat"] == 22.41
    assert parada["lon"] == -83.69
    assert parada["precision"] == "manual"
    assert parada["direccion"] == "Calle corregida 123"


def test_sin_correccion_manda_la_cache_y_sin_nada_queda_sin_ubicar():
    from app.services.rutas_service import aplicar_ubicacion

    con_cache = {"direccion": "Calle 1", "municipio": "Pinar del Río"}
    aplicar_ubicacion(con_cache, {"lat": 22.0, "lon": -83.0, "precision": "municipio"}, None)
    assert (con_cache["lat"], con_cache["lon"]) == (22.0, -83.0)
    assert con_cache["precision"] == "municipio"
    assert con_cache["direccion"] == "Calle 1"

    sin_nada = {"direccion": "Calle 2", "municipio": "Pinar del Río"}
    aplicar_ubicacion(sin_nada, None, None)
    assert sin_nada["lat"] is None
    assert sin_nada["precision"] is None
