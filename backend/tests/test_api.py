"""
Pruebas de humo del backend.

Necesitan PostgreSQL: la CI lo levanta como servicio (ver .github/workflows/ci.yml)
y no hablan con Supabase, solo comprueban que la API arranca y responde.

También cubren el historial de estados: cada cambio guarda el usuario del token
y repetir el mismo estado no añade filas.
"""
import os

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

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import get_db_connection  # noqa: E402
from app.main import app  # noqa: E402

ADMIN = (os.environ["ADMIN_USERNAME"], os.environ["ADMIN_PASSWORD"])

# Datos propios de las pruebas del historial, para no tocar los reales.
HBL_USUARIO = "PRUEBA-HISTORIAL-USUARIO"
HBL_DEDUPE = "PRUEBA-HISTORIAL-DEDUPE"
HBL_MASIVO_A = "PRUEBA-HISTORIAL-MASIVO-A"
HBL_MASIVO_B = "PRUEBA-HISTORIAL-MASIVO-B"
USUARIO_PRUEBA = "prueba_historial"
CLAVE_PRUEBA = "clave-solo-para-pruebas"


@pytest.fixture(scope="module")
def cliente():
    # El lifespan crea las tablas y el admin definido en el entorno.
    with TestClient(app) as cliente:
        yield cliente


def _borrar_datos_de_prueba():
    """Deja limpias las filas que crean estas pruebas (CI y ejecuciones locales)."""
    hbls = [HBL_USUARIO, HBL_DEDUPE, HBL_MASIVO_A, HBL_MASIVO_B]
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
        conn.commit()
    finally:
        conn.close()


@pytest.fixture(scope="module", autouse=True)
def datos_de_prueba_limpios(cliente):
    # Depende de cliente para que el lifespan haya creado las tablas.
    _borrar_datos_de_prueba()
    yield
    _borrar_datos_de_prueba()


def _login(cliente: TestClient, username: str, password: str) -> str:
    respuesta = cliente.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["access_token"]


def _token(cliente: TestClient) -> str:
    return _login(cliente, *ADMIN)


def _cabeceras(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _historial(cliente: TestClient, hbl: str, token: str) -> list:
    respuesta = cliente.get(
        f"/api/manifiestos/historial/{hbl}", headers=_cabeceras(token)
    )
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
    respuesta = cliente.post(
        "/api/auth/login", json={"username": ADMIN[0], "password": ADMIN[1]}
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["role"] == "admin"
    assert cuerpo["token_type"] == "bearer"
    assert cuerpo["username"] == ADMIN[0]


def test_login_con_password_incorrecta(cliente):
    respuesta = cliente.post(
        "/api/auth/login", json={"username": ADMIN[0], "password": "incorrecta"}
    )
    assert respuesta.status_code == 401


def test_lista_sin_token(cliente):
    assert cliente.get("/api/manifiestos/lista").status_code == 401


def test_lista_con_token(cliente):
    respuesta = cliente.get(
        "/api/manifiestos/lista",
        headers={"Authorization": f"Bearer {_token(cliente)}"},
    )
    assert respuesta.status_code == 200
    assert "manifiestos" in respuesta.json()


def test_lista_con_token_invalido(cliente):
    respuesta = cliente.get(
        "/api/manifiestos/lista", headers={"Authorization": "Bearer no-es-un-token"}
    )
    assert respuesta.status_code == 401


def test_el_historial_guarda_el_usuario_del_token(cliente):
    """El usuario sale del token: un 'usuario' en el cuerpo no lo suplanta."""
    admin = _token(cliente)
    creado = cliente.post(
        "/api/usuarios/",
        json={"username": USUARIO_PRUEBA, "password": CLAVE_PRUEBA, "role": "guest"},
        headers=_cabeceras(admin),
    )
    assert creado.status_code == 200, creado.text

    token = _login(cliente, USUARIO_PRUEBA, CLAVE_PRUEBA)
    respuesta = cliente.post(
        "/api/manifiestos/estado",
        json={"hbl": HBL_USUARIO, "estado": "Despachada", "usuario": "suplantado"},
        headers=_cabeceras(token),
    )
    assert respuesta.status_code == 200, respuesta.text

    historial = _historial(cliente, HBL_USUARIO, token)
    assert len(historial) == 1
    assert historial[0]["usuario"] == USUARIO_PRUEBA
    assert historial[0]["estado"] == "Despachada"
    assert historial[0]["fecha_hora"]


def test_repetir_el_mismo_estado_no_duplica_el_historial(cliente):
    token = _token(cliente)
    url = "/api/manifiestos/estado"

    primero = cliente.post(
        url,
        json={"hbl": HBL_DEDUPE, "estado": "Despachada"},
        headers=_cabeceras(token),
    )
    assert primero.status_code == 200, primero.text
    historial = _historial(cliente, HBL_DEDUPE, token)
    assert len(historial) == 1
    fecha_del_cambio = historial[0]["fecha_hora"]

    # Repetir el mismo estado responde bien pero no deja rastro nuevo.
    repetido = cliente.post(
        url,
        json={"hbl": HBL_DEDUPE, "estado": "Despachada"},
        headers=_cabeceras(token),
    )
    assert repetido.status_code == 200, repetido.text
    historial = _historial(cliente, HBL_DEDUPE, token)
    assert len(historial) == 1
    assert historial[0]["fecha_hora"] == fecha_del_cambio

    # Un cambio real sí se registra.
    cambio = cliente.post(
        url,
        json={"hbl": HBL_DEDUPE, "estado": "Entregada"},
        headers=_cabeceras(token),
    )
    assert cambio.status_code == 200, cambio.text
    assert len(_historial(cliente, HBL_DEDUPE, token)) == 2


def test_los_estados_masivos_tampoco_duplican_el_historial(cliente):
    token = _token(cliente)
    hbls = [HBL_MASIVO_A, HBL_MASIVO_B]
    cuerpo = {"hbls": hbls, "estado": "Pendiente"}
    url = "/api/manifiestos/estados-masivos"

    primero = cliente.post(url, json=cuerpo, headers=_cabeceras(token))
    assert primero.status_code == 200, primero.text
    assert primero.json()["hbls_actualizados"] == 2

    repetido = cliente.post(url, json=cuerpo, headers=_cabeceras(token))
    assert repetido.status_code == 200, repetido.text
    assert repetido.json()["hbls_actualizados"] == 0

    for hbl in hbls:
        historial = _historial(cliente, hbl, token)
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
        assert "samesite=none" in atributos

        # Sin cabecera Authorization: solo la cookie que acaba de emitir.
        lista = cliente.get(
            "/api/manifiestos/lista",
            headers={"Cookie": cookie.split(";", 1)[0]},
        )
        assert lista.status_code == 200, lista.text
    finally:
        cliente.cookies.clear()


def test_no_admite_contrasenas_cortas_ni_roles_fuera_del_enum(cliente):
    token = _token(cliente)
    corta = cliente.post(
        "/api/usuarios/",
        json={"username": "prueba_validacion", "password": "1234567", "role": "guest"},
        headers=_cabeceras(token),
    )
    assert corta.status_code == 422, corta.text

    rol = cliente.post(
        "/api/usuarios/",
        json={"username": "prueba_validacion", "password": "12345678", "role": "superadmin"},
        headers=_cabeceras(token),
    )
    assert rol.status_code == 422, rol.text


def test_cors_acepta_solo_el_origen_configurado(cliente):
    permitido = cliente.get(
        "/health", headers={"Origin": "http://localhost:3000"}
    )
    assert permitido.headers.get("access-control-allow-origin") == "http://localhost:3000"

    ajeno = cliente.get("/health", headers={"Origin": "https://otra-web.example"})
    assert ajeno.headers.get("access-control-allow-origin") is None
