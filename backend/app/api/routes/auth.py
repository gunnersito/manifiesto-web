from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Response, status
from jose import jwt
from pydantic import BaseModel

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY
from app.core.database import get_db_connection, verificar_password

router = APIRouter(prefix="/auth", tags=["Autenticación"])

# El JWT viaja en una cookie httpOnly: el JavaScript de la app no puede leerlo.
# Como el frontend y la API están en dominios distintos, la cookie necesita
# SameSite=None y Secure para que el navegador la envíe en cada petición.
COOKIE_TOKEN = "token"
COOKIE_MAX_AGE = ACCESS_TOKEN_EXPIRE_MINUTES * 60


def _opciones_cookie() -> dict:
    return {
        "key": COOKIE_TOKEN,
        "httponly": True,
        "secure": True,
        "samesite": "none",
        "path": "/",
        "max_age": COOKIE_MAX_AGE,
    }


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(data: LoginRequest, response: Response):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT username, password, role, ultimo_manifiesto_id FROM usuarios WHERE username = %s", (data.username,))
        user = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    if not user or not verificar_password(data.password, user[1]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")

    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token_data = {"sub": user[0], "role": user[2], "exp": expire}
    token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

    response.set_cookie(value=token, **_opciones_cookie())

    # El token solo viaja en la cookie httpOnly: la respuesta no lo expone.
    return {
        "role": user[2],
        "username": user[0],
        "ultimo_manifiesto_id": user[3]
    }


@router.post("/logout")
async def logout(response: Response):
    """Borra la cookie de sesión; solo el backend puede hacerlo al ser httpOnly."""
    response.delete_cookie(
        key=COOKIE_TOKEN,
        path="/",
        httponly=True,
        secure=True,
        samesite="none",
    )
    return {"status": "success"}
