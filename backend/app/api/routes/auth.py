from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt
from app.core.config import SECRET_KEY, ALGORITHM
from app.core.database import verificar_password, get_db_connection

router = APIRouter(prefix="/auth", tags=["Autenticación"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(data: LoginRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Usamos %s para PostgreSQL
        cursor.execute("SELECT username, password, role FROM usuarios WHERE username = %s", (data.username,))
        user = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    # Si el usuario no existe, o la contraseña no coincide
    if not user or not verificar_password(data.password, user[1]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos"
        )

    expire = datetime.utcnow() + timedelta(minutes=60 * 24 * 7)
    token_data = {
        "sub": user[0],
        "role": user[2],
        "exp": expire
    }
    token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user[2],
        "username": user[0]
    }