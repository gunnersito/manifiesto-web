"""
Pruebas de humo del backend.

Necesitan PostgreSQL: la CI lo levanta como servicio (ver .github/workflows/ci.yml)
y no hablan con Supabase, solo comprueban que la API arranca y responde.

También cubren el historial de estados: cada cambio guarda el usuario del token
y repetir el mismo estado no añade filas.
"""
import os
from io import BytesIO

# Se definen antes de importar la app: config.py y database.py leen el entorno.
os.environ.setdefault("SECRET_KEY", "clave-solo-para-pruebas")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/manifiesto_test"
)
os.environ.setdefault("SUPABASE_URL", "https://proyecto-de-pruebas.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "clave-solo-para-pruebas")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "clave-solo-para-pruebas")
# Orígenes propios para no depender de los de producción.
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

import pandas as pd  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import COL_HBL  # noqa: E402
from app.core.database import (  # noqa: E402
    get_db_connection,
    hay_hbls_sin_datos_extra,
    obtener_estados_por_hbls,
)
from app.api.routes import manifiestos as rutas_manifiestos  # noqa: E402
from app.main import app  # noqa: E402
from app.services.estados_service import enriquecer_df_con_estados  # noqa: E402

ADMIN = (os.environ["ADMIN_USERNAME"], os.environ["ADMIN_PASSWORD"])

# Datos propios de las pruebas del historial, para no tocar los reales.
HBL_USUARIO = "PRUEBA-HISTORIAL-USUARIO"
HBL_DEDUPE = "PRUEBA-HISTORIAL-DEDUPE"
HBL_MASIVO_A = "PRUEBA-HISTORIAL-MASIVO-A"
HBL_MASIVO_B = "PRUEBA-HISTORIAL-MASIVO-B"
HBL_ENRIQUECIDO = "PRUEBA-HISTORIAL-ENRIQUECIDO"
USUARIO_PRUEBA = "prueba_historial"
CLAVE_PRUEBA = "clave-solo-para-pruebas"

# Manifiesto propio para probar el listado filtrado por parada.
HASH_MANIFIESTO_PARADA = "prueba-hbls-por-parada"
HBL_PARADA = ["PRUEBA-PARADA-A", "PRUEBA-PARADA-B", "PRUEBA-PARADA-OTRA"]


@pytest.fixture(scope="module")
def cliente():
    # El lifespan crea las tablas y el admin definido en el entorno. Se usa
    # https para que el cliente envíe la cookie Secure de la sesión.
    with TestClient(app, base_url="https://testserver") as cliente:
        yield cliente


def _borrar_datos_de_prueba():
    """Deja limpias las filas que crean estas pruebas (CI y ejecuciones locales)."""
    hbls = [HBL_USUARIO, HBL_DEDUPE, HBL_MASIVO_A, HBL_MASIVO_B, HBL_ENRIQUECIDO]
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM entregas_historial WHERE hbl = ANY(%s)", (hbls,)
            )
            cursor.execute("DELETE FROM entregas WHERE hbl = ANY(%s)", (hbls,))
            cursor.execute("DELETE FROM hbls WHERE hbl = ANY(%s)", (hbls,))
            cursor.execute(
                "DELETE FROM usuarios WHERE username = %s", (USUARIO_PRUEBA,)
            )
            # Los HBLs del manifiesto de prueba caen con él (ON DELETE CASCADE).
            cursor.execute(
                "DELETE FROM manifiestos WHERE hash_archivo = %s",
                (HASH_MANIFIESTO_PARADA,),
            )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture(scope="module", autouse=True)
def datos_de_prueba_limpios(cliente):
    # Depende de cliente para que el lifespan haya creado las tablas.
    _borrar_datos_de_prueba()
    yield
    _borrar_datos_de_prueba()


def _login(cliente: TestClient, username: str, password: str) -> None:
    """Inicia sesión: el token queda solo en la cookie httpOnly del cliente."""
    respuesta = cliente.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert respuesta.status_code == 200, respuesta.text
    assert "access_token" not in respuesta.json()


def _historial(cliente: TestClient, hbl: str) -> list:
    respuesta = cliente.get(f"/api/manifiestos/historial/{hbl}")
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["historial"]


def test_health(cliente):
    respuesta = cliente.get("/health")
    assert respuesta.status_code == 200
    assert respuesta.json() == {"status": "healthy"}


def test_raiz(cliente):
    respuesta = cliente.get("/")
    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "ok"


def test_login_correcto(cliente):
    cliente.cookies.clear()
    respuesta = cliente.post(
        "/api/auth/login", json={"username": ADMIN[0], "password": ADMIN[1]}
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["role"] == "admin"
    assert cuerpo["username"] == ADMIN[0]
    assert "access_token" not in cuerpo
    assert "token_type" not in cuerpo
    assert respuesta.headers["set-cookie"].startswith("token=")


def test_login_con_password_incorrecta(cliente):
    respuesta = cliente.post(
        "/api/auth/login", json={"username": ADMIN[0], "password": "incorrecta"}
    )
    assert respuesta.status_code == 401


def test_lista_sin_cookie(cliente):
    cliente.cookies.clear()
    assert cliente.get("/api/manifiestos/lista").status_code == 401


def test_lista_con_cookie(cliente):
    _login(cliente, *ADMIN)
    respuesta = cliente.get("/api/manifiestos/lista")
    assert respuesta.status_code == 200
    assert "manifiestos" in respuesta.json()


def test_lista_con_cookie_invalida(cliente):
    cliente.cookies.clear()
    respuesta = cliente.get(
        "/api/manifiestos/lista", headers={"Cookie": "token=no-es-un-token"}
    )
    assert respuesta.status_code == 401


def test_el_historial_guarda_el_usuario_del_token(cliente):
    """El usuario sale del token: un 'usuario' en el cuerpo no lo suplanta."""
    _login(cliente, *ADMIN)
    creado = cliente.post(
        "/api/usuarios/",
        json={"username": USUARIO_PRUEBA, "password": CLAVE_PRUEBA, "role": "guest"},
    )
    assert creado.status_code == 200, creado.text

    _login(cliente, USUARIO_PRUEBA, CLAVE_PRUEBA)
    respuesta = cliente.post(
        "/api/manifiestos/estado",
        json={"hbl": HBL_USUARIO, "estado": "Despachada", "usuario": "suplantado"},
    )
    assert respuesta.status_code == 200, respuesta.text

    historial = _historial(cliente, HBL_USUARIO)
    assert len(historial) == 1
    assert historial[0]["usuario"] == USUARIO_PRUEBA
    assert historial[0]["estado"] == "Despachada"
    assert historial[0]["fecha_hora"]


def test_repetir_el_mismo_estado_no_duplica_el_historial(cliente):
    _login(cliente, *ADMIN)
    url = "/api/manifiestos/estado"

    primero = cliente.post(
        url,
        json={"hbl": HBL_DEDUPE, "estado": "Despachada"},
    )
    assert primero.status_code == 200, primero.text
    historial = _historial(cliente, HBL_DEDUPE)
    assert len(historial) == 1
    fecha_del_cambio = historial[0]["fecha_hora"]

    # Repetir el mismo estado responde bien pero no deja rastro nuevo.
    repetido = cliente.post(
        url,
        json={"hbl": HBL_DEDUPE, "estado": "Despachada"},
    )
    assert repetido.status_code == 200, repetido.text
    historial = _historial(cliente, HBL_DEDUPE)
    assert len(historial) == 1
    assert historial[0]["fecha_hora"] == fecha_del_cambio

    # Un cambio real sí se registra.
    cambio = cliente.post(
        url,
        json={"hbl": HBL_DEDUPE, "estado": "Entregada"},
    )
    assert cambio.status_code == 200, cambio.text
    assert len(_historial(cliente, HBL_DEDUPE)) == 2


def test_los_estados_masivos_tampoco_duplican_el_historial(cliente):
    _login(cliente, *ADMIN)
    hbls = [HBL_MASIVO_A, HBL_MASIVO_B]
    cuerpo = {"hbls": hbls, "estado": "Pendiente"}
    url = "/api/manifiestos/estados-masivos"

    primero = cliente.post(url, json=cuerpo)
    assert primero.status_code == 200, primero.text
    assert primero.json()["hbls_actualizados"] == 2

    repetido = cliente.post(url, json=cuerpo)
    assert repetido.status_code == 200, repetido.text
    assert repetido.json()["hbls_actualizados"] == 0

    for hbl in hbls:
        historial = _historial(cliente, hbl)
        assert len(historial) == 1
        assert historial[0]["estado"] == "Pendiente"
        assert historial[0]["usuario"] == ADMIN[0]


def test_el_login_deja_el_token_en_una_cookie_http_only(cliente):
    """El JWT viaja en una cookie httpOnly y esa cookie basta para autorizar."""
    cliente.cookies.clear()
    try:
        respuesta = cliente.post(
            "/api/auth/login",
            json={"username": ADMIN[0], "password": ADMIN[1]},
        )
        assert respuesta.status_code == 200, respuesta.text

        cookie = respuesta.headers["set-cookie"]
        assert cookie.startswith("token=")
        atributos = cookie.lower()
        assert "httponly" in atributos
        assert "secure" in atributos
        # El frontend reenvía /api desde su propio origen, así que la cookie
        # viaja same-origin y no necesita SameSite=None.
        assert "samesite=lax" in atributos
        assert "samesite=none" not in atributos

        assert "access_token" not in respuesta.json()

        # Sin cabecera Authorization: el cliente solo tiene la cookie emitida.
        lista = cliente.get("/api/manifiestos/lista")
        assert lista.status_code == 200, lista.text

        # El logout la borra y deja de autorizar.
        salida = cliente.post("/api/auth/logout")
        assert salida.status_code == 200, salida.text
        assert cliente.get("/api/manifiestos/lista").status_code == 401
    finally:
        cliente.cookies.clear()


def test_no_admite_contrasenas_cortas_ni_roles_fuera_del_enum(cliente):
    _login(cliente, *ADMIN)
    corta = cliente.post(
        "/api/usuarios/",
        json={"username": "prueba_validacion", "password": "1234567", "role": "guest"},
    )
    assert corta.status_code == 422, corta.text

    rol = cliente.post(
        "/api/usuarios/",
        json={"username": "prueba_validacion", "password": "12345678", "role": "superadmin"},
    )
    assert rol.status_code == 422, rol.text


def test_el_enriquecido_solo_consulta_los_hbls_del_dataframe(cliente):
    _login(cliente, *ADMIN)
    respuesta = cliente.post(
        "/api/manifiestos/estado",
        json={"hbl": HBL_ENRIQUECIDO, "estado": "Despachada"},
    )
    assert respuesta.status_code == 200, respuesta.text

    # La consulta trae solo el HBL pedido, no el resto de la tabla.
    assert obtener_estados_por_hbls([HBL_ENRIQUECIDO]) == {
        HBL_ENRIQUECIDO: "Despachada"
    }

    df = pd.DataFrame(
        {COL_HBL: [HBL_ENRIQUECIDO, "PRUEBA-HISTORIAL-SIN-ESTADO"]}
    )
    resultado = enriquecer_df_con_estados(df)
    assert resultado["Estado"].tolist() == ["Despachada", "Pendiente"]


def _crear_manifiesto_con_paradas(datos_extra: str | None = "{}") -> int:
    """Manifiesto de prueba con dos HBLs en una dirección y uno en otra.

    Con `datos_extra=None` se simula un manifiesto cargado antes de que las
    columnas extra (M3, carnet...) se guardaran en `hbls`.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM manifiestos WHERE hash_archivo = %s",
                (HASH_MANIFIESTO_PARADA,),
            )
            cursor.execute(
                """
                INSERT INTO manifiestos (
                    nombre_archivo, hash_archivo, fecha_subida, total_filas,
                    total_provincias, total_paradas, total_bultos, resumen_json
                ) VALUES ('prueba.xlsx', %s, '', 3, 1, 2, 3, '[]')
                RETURNING id
                """,
                (HASH_MANIFIESTO_PARADA,),
            )
            manifiesto_id = cursor.fetchone()[0]
            for hbl, direccion in [
                (HBL_PARADA[0], "CALLE 1"),
                (HBL_PARADA[1], "CALLE 1"),
                (HBL_PARADA[2], "CALLE 2"),
            ]:
                cursor.execute(
                    """
                    INSERT INTO hbls (
                        manifiesto_id, hbl, provincia, municipio, direccion,
                        remitente, destinatario, telefono, contenido,
                        bultos, peso, parada, datos_extra
                    ) VALUES (%s, %s, 'PROVINCIA-PRUEBA', 'MUNICIPIO-PRUEBA', %s, '', '', '', '', 1, 1.5, 1, %s)
                    """,
                    (manifiesto_id, hbl, direccion, datos_extra),
                )
        conn.commit()
    finally:
        conn.close()
    return manifiesto_id


def test_los_hbls_se_piden_filtrados_por_parada(cliente):
    """La ficha de una parada trae sus HBLs sin recorrer toda la provincia."""
    _login(cliente, *ADMIN)
    manifiesto_id = _crear_manifiesto_con_paradas()

    respuesta = cliente.get(
        f"/api/manifiestos/{manifiesto_id}/hbls",
        params={
            "municipio": "MUNICIPIO-PRUEBA",
            "direccion": "CALLE 1",
            "por_pagina": 200,
        },
    )
    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["total"] == 2
    assert [h["hbl"] for h in cuerpo["hbls"]] == [HBL_PARADA[0], HBL_PARADA[1]]

    # Sin dirección vienen el de la otra dirección y los dos de esta.
    todas = cliente.get(
        f"/api/manifiestos/{manifiesto_id}/hbls",
        params={"municipio": "MUNICIPIO-PRUEBA"},
    )
    assert todas.status_code == 200, todas.text
    assert todas.json()["total"] == 3


def test_el_resumen_de_provincia_sale_de_la_tabla_hbls(cliente):
    """La vista de provincia no lee el Excel: agrupa las filas de `hbls`.

    El entorno de pruebas apunta a un Supabase de mentira, así que si el
    endpoint intentara descargar el archivo original fallaría.
    """
    _login(cliente, *ADMIN)
    manifiesto_id = _crear_manifiesto_con_paradas()
    url = f"/api/manifiestos/{manifiesto_id}/provincia/PROVINCIA-PRUEBA"

    respuesta = cliente.post(url)
    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["total_hbls"] == 3
    assert cuerpo["total_hbls_sin_filtro"] == 3
    assert cuerpo["total_paradas"] == 2
    assert [(p["Dirección"], p["Cant HBLs"], p["Bultos"]) for p in cuerpo["paradas"]] == [
        ("CALLE 1", 2, 2),
        ("CALLE 2", 1, 1),
    ]

    # Un filtro sin resultados deja el resumen vacío pero conserva el total de
    # la provincia, que es el que muestra la cabecera.
    filtrado = cliente.post(url, data={"estado": "Entregada"})
    assert filtrado.status_code == 200, filtrado.text
    assert filtrado.json()["total_hbls"] == 0
    assert filtrado.json()["total_paradas"] == 0
    assert filtrado.json()["total_hbls_sin_filtro"] == 3

    ajeno = cliente.post(f"/api/manifiestos/{manifiesto_id}/provincia/OTRA-PROVINCIA")
    assert ajeno.status_code == 404, ajeno.text


def _agregar_municipio(manifiesto_id: int, hbl: str, municipio: str) -> None:
    """Suma una parada de otro municipio al manifiesto de prueba."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO hbls (
                    manifiesto_id, hbl, provincia, municipio, direccion,
                    remitente, destinatario, telefono, contenido,
                    bultos, peso, parada, datos_extra
                ) VALUES (%s, %s, 'PROVINCIA-PRUEBA', %s, 'CALLE 3', '', '', '', '', 1, 1, 1, '{}')
                """,
                (manifiesto_id, hbl, municipio),
            )
        conn.commit()
    finally:
        conn.close()


def test_asignar_todos_los_municipios_de_una_vez(cliente):
    """Un solo gesto asigna los municipios de la provincia a un repartidor."""
    _login(cliente, *ADMIN)
    manifiesto_id = _crear_manifiesto_con_paradas()
    _agregar_municipio(manifiesto_id, "PRUEBA-PARADA-C", "OTRO-MUNICIPIO")
    repartidor = "PRUEBA-REPARTIDOR"
    datos = {
        "manifiesto_id": manifiesto_id,
        "provincia": "PROVINCIA-PRUEBA",
        "repartidor": repartidor,
    }

    alta = cliente.post("/api/rutas/repartidores", json={"nombre": repartidor})
    assert alta.status_code == 200, alta.text
    try:
        respuesta = cliente.put("/api/rutas/asignaciones/todos", json=datos)
        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["municipios"] == [
            "MUNICIPIO-PRUEBA",
            "OTRO-MUNICIPIO",
        ]

        resumen = cliente.get(
            f"/api/rutas/{manifiesto_id}", params={"provincia": "PROVINCIA-PRUEBA"}
        )
        assert resumen.status_code == 200, resumen.text
        assert [m["repartidor"] for m in resumen.json()["municipios"]] == [
            repartidor,
            repartidor,
        ]

        # Un repartidor que no existe se rechaza sin tocar las asignaciones.
        ajeno = cliente.put(
            "/api/rutas/asignaciones/todos", json={**datos, "repartidor": "NO-EXISTE"}
        )
        assert ajeno.status_code == 404, ajeno.text
        assert [
            m["repartidor"]
            for m in cliente.get(
                f"/api/rutas/{manifiesto_id}",
                params={"provincia": "PROVINCIA-PRUEBA"},
            ).json()["municipios"]
        ] == [repartidor, repartidor]
    finally:
        cliente.delete(f"/api/rutas/repartidores/{repartidor}")


def test_las_exportaciones_salen_de_la_tabla_hbls(cliente):
    """Las cuatro exportaciones se generan con las filas guardadas, sin Excel."""
    _login(cliente, *ADMIN)
    manifiesto_id = _crear_manifiesto_con_paradas(
        datos_extra='{"M3": 1.0, "Categoría/Operación": "ENVIO"}'
    )

    respuestas = {}
    for ruta in (
        "exportar-por-id",
        "exportar-ruta-por-id",
        "exportar-municipios-por-id",
    ):
        respuesta = cliente.post(
            f"/api/manifiestos/{ruta}/{manifiesto_id}/PROVINCIA-PRUEBA"
        )
        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.content[:2] == b"PK"
        respuestas[ruta] = respuesta

    detalle = pd.read_excel(
        BytesIO(respuestas["exportar-por-id"].content), sheet_name="PROVINCIA-PRUEBA"
    )
    assert list(detalle["HBL Número"][:3]) == HBL_PARADA
    # Las columnas del Excel sin campo propio en `hbls` viajan en la exportación.
    assert list(detalle["M3"][:3]) == [1.0, 1.0, 1.0]
    assert list(detalle["Categoría/Operación"][:3]) == ["ENVIO"] * 3

    todas = cliente.post(f"/api/manifiestos/exportar-todas-por-id/{manifiesto_id}")
    assert todas.status_code == 200, todas.text
    hojas = pd.read_excel(BytesIO(todas.content), sheet_name=None)
    assert "PROVINCIA-PRUEBA" in hojas
    resumen = hojas["Resumen General"]
    assert resumen["Total HBLs"].iloc[0] == 3
    assert resumen["Total Paradas"].iloc[0] == 2


def test_una_exportacion_rellena_los_extra_de_un_manifiesto_antiguo(cliente, monkeypatch):
    """Un manifiesto sin columnas extra las recibe del Excel una sola vez."""
    _login(cliente, *ADMIN)
    manifiesto_id = _crear_manifiesto_con_paradas(datos_extra=None)

    archivo = pd.DataFrame({
        "HBL Número": HBL_PARADA,
        "Bultos (Cant.)": [1, 1, 1],
        "Peso (Kg)": [1.5, 1.5, 1.5],
        "M3": [1.0, 1.0, 1.0],
        "Categoría/Operación": ["ENVIO", "ENVIO", "ENVIO"],
        "Provincia": ["PROVINCIA-PRUEBA"] * 3,
        "Municipio": ["MUNICIPIO-PRUEBA"] * 3,
        "Direccion del destinatario": ["CALLE 1", "CALLE 1", "CALLE 2"],
    })
    lecturas = []

    def archivo_original(_manifiesto_id):
        lecturas.append(_manifiesto_id)
        return archivo

    monkeypatch.setattr(rutas_manifiestos, "_df_desde_archivo", archivo_original)

    url = f"/api/manifiestos/exportar-por-id/{manifiesto_id}/PROVINCIA-PRUEBA"
    primera = cliente.post(url)
    assert primera.status_code == 200, primera.text
    assert len(lecturas) == 1
    assert not hay_hbls_sin_datos_extra(manifiesto_id)

    # La segunda exportación ya no descarga el archivo original.
    segunda = cliente.post(url)
    assert segunda.status_code == 200, segunda.text
    assert len(lecturas) == 1

    detalle = pd.read_excel(BytesIO(segunda.content), sheet_name=0)
    assert list(detalle["M3"][:3]) == [1.0, 1.0, 1.0]


def test_los_listados_tienen_tope_de_pagina_y_validan_el_estado(cliente):
    _login(cliente, *ADMIN)

    demasiado = cliente.get("/api/manifiestos/hbls?por_pagina=999999")
    assert demasiado.status_code == 422, demasiado.text

    estado_invalido = cliente.get("/api/manifiestos/hbls?estado=Inventado")
    assert estado_invalido.status_code == 400, estado_invalido.text

    filtrado_demasiado = cliente.get("/api/manifiestos/1/hbls?por_pagina=999999")
    assert filtrado_demasiado.status_code == 422, filtrado_demasiado.text

    valido = cliente.get("/api/manifiestos/hbls?por_pagina=200&estado=Pendiente")
    assert valido.status_code == 200, valido.text


def test_cors_acepta_solo_el_origen_configurado(cliente):
    permitido = cliente.get(
        "/health", headers={"Origin": "http://localhost:3000"}
    )
    assert permitido.headers.get("access-control-allow-origin") == "http://localhost:3000"

    ajeno = cliente.get("/health", headers={"Origin": "https://otra-web.example"})
    assert ajeno.headers.get("access-control-allow-origin") is None
