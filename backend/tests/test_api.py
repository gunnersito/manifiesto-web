"""
Pruebas de humo del backend.

Necesitan PostgreSQL: la CI lo levanta como servicio (ver .github/workflows/ci.yml)
y no hablan con Supabase, solo comprueban que la API arranca y responde.
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

from app.main import app  # noqa: E402

ADMIN = (os.environ["ADMIN_USERNAME"], os.environ["ADMIN_PASSWORD"])


@pytest.fixture(scope="module")
def cliente():
    # El lifespan crea las tablas y el admin definido en el entorno.
    with TestClient(app) as cliente:
        yield cliente


def _token(cliente: TestClient) -> str:
    respuesta = cliente.post(
        "/api/auth/login", json={"username": ADMIN[0], "password": ADMIN[1]}
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["access_token"]


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


def test_cors_acepta_solo_el_origen_configurado(cliente):
    permitido = cliente.get(
        "/health", headers={"Origin": "http://localhost:3000"}
    )
    assert permitido.headers.get("access-control-allow-origin") == "http://localhost:3000"

    ajeno = cliente.get("/health", headers={"Origin": "https://otra-web.example"})
    assert ajeno.headers.get("access-control-allow-origin") is None
