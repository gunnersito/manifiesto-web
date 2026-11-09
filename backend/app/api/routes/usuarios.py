from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.database import encriptar_password, get_db_connection
from app.api.routes.manifiestos import verificar_admin, verificar_lector

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])

class UsuarioCreate(BaseModel):
    username: str
    password: str
    role: str = "guest"

class UsuarioUpdate(BaseModel):
    password: str | None = None
    role: str | None = None

class PasswordUpdate(BaseModel):
    password: str

class ManifiestoSeleccionado(BaseModel):
    manifiesto_id: int | None

@router.get("/")
def listar_usuarios(admin: dict = Depends(verificar_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT username, role FROM usuarios")
        rows = cursor.fetchall()
        return [{"username": r[0], "role": r[1]} for r in rows]
    finally:
        cursor.close()
        conn.close()


@router.post("/")
def crear_usuario(user: UsuarioCreate, admin: dict = Depends(verificar_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Verificar si existe
        cursor.execute("SELECT id FROM usuarios WHERE username = %s", (user.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="El usuario ya existe")

        # Encriptar y guardar
        hashed_pwd = encriptar_password(user.password)
        cursor.execute(
            "INSERT INTO usuarios (username, password, role) VALUES (%s, %s, %s)",
            (user.username, hashed_pwd, user.role)
        )
        conn.commit()
        return {"message": "Usuario creado exitosamente"}
    finally:
        cursor.close()
        conn.close()


@router.delete("/{username}")
def eliminar_usuario(username: str, admin: dict = Depends(verificar_admin)):
    if username == admin.get("sub"):
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM usuarios WHERE username = %s", (username,))
        conn.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        return {"message": "Usuario eliminado"}
    finally:
        cursor.close()
        conn.close()


@router.put("/{username}")
def actualizar_usuario(username: str, data: UsuarioUpdate, admin: dict = Depends(verificar_admin)):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Verificar si existe
        cursor.execute("SELECT id FROM usuarios WHERE username = %s", (username,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        # Actualizar contraseña (si se envió)
        if data.password:
            hashed_pwd = encriptar_password(data.password)
            cursor.execute("UPDATE usuarios SET password = %s WHERE username = %s", (hashed_pwd, username))

        # Actualizar rol (si se envió)
        if data.role:
            cursor.execute("UPDATE usuarios SET role = %s WHERE username = %s", (data.role, username))

        conn.commit()
        return {"message": "Usuario actualizado exitosamente"}
    finally:
        cursor.close()
        conn.close()


@router.put("/perfil/password")
def actualizar_mi_password(data: PasswordUpdate, user: dict = Depends(verificar_lector)):
    username = user.get("sub")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        hashed_pwd = encriptar_password(data.password)
        cursor.execute("UPDATE usuarios SET password = %s WHERE username = %s", (hashed_pwd, username))
        conn.commit()
        return {"message": "Contraseña actualizada"}
    finally:
        cursor.close()
        conn.close()

from fastapi import APIRouter

@router.get("/crear-admin-temp")
def crear_admin_temporal():
    from app.core.database import get_db_connection, encriptar_password
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Borramos el viejo por si acaso
        cur.execute("DELETE FROM usuarios WHERE username = 'admin'")
        # Creamos el nuevo con la contraseña encriptada por tu propio código
        cur.execute(
            "INSERT INTO usuarios (username, password, role) VALUES (%s, %s, %s)",
            ("admin", encriptar_password("admin123"), "admin")
        )
        conn.commit()
        return {"message": "✅ Usuario admin creado con la contraseña 'admin123'"}
    finally:
        cur.close()
        conn.close()

@router.put("/perfil/manifiesto-activo")
def actualizar_manifiesto_activo(data: ManifiestoSeleccionado, user: dict = Depends(verificar_lector)):
    username = user.get("sub")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE usuarios SET ultimo_manifiesto_id = %s WHERE username = %s",
            (data.manifiesto_id, username)
        )
        conn.commit()
        return {"message": "Manifiesto activo actualizado"}
    finally:
        cursor.close()
        conn.close()