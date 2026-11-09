from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import SECRET_KEY, ALGORITHM
from typing import Optional
from fastapi.responses import Response
from io import BytesIO
from typing import List
from pathlib import Path
import hashlib

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel

from app.core.config import DB_PATH, COL_PROVINCIA, UMBRAL_SIMILITUD, COL_MUNICIPIO, COL_DIRECCION, COL_HBL, COL_BULTOS, ESTADOS
from app.services.excel_parser import (
    cargar_excel,
    listar_hojas,
    aplicar_mapeo_columnas,
    limpiar_manifiesto,
    validar_columnas_esenciales,
)
from app.services.paradas_service import (
    marcar_paradas,
    preparar_salida,
    resumen_paradas,
    ordenar_provincias,
    filtrar_hbls
)
from app.services.estados_service import enriquecer_df_con_estados, guardar_estado, guardar_estados_masivo
from app.services.excel_exporter import (
    exportar_provincia_excel,
    exportar_hoja_ruta_excel,
    exportar_todas_provincias_excel,
    exportar_por_municipios_excel
)
from app.core.database import (
    guardar_manifiesto,
    listar_manifiestos,
    obtener_manifiesto,
    obtener_hbls,
    eliminar_manifiesto,
    buscar_manifiesto_por_hash,
    obtener_ruta_archivo_original
)

router = APIRouter(prefix="/manifiestos", tags=["Manifiestos"])

security = HTTPBearer()

def verificar_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="No tienes permisos de administrador")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

def verificar_lector(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

# ============================================================
# MODELOS
# ============================================================
class EstadoUpdate(BaseModel):
    hbl: str
    estado: str

class EstadosMasivos(BaseModel):
    hbls: List[str]
    estado: str

# ============================================================
# ENDPOINTS
# ============================================================
@router.get("/ping")
async def ping():
    return {"message": "Ruta de manifiestos OK"}

@router.post("/hojas")
async def obtener_hojas(file: UploadFile = File(...)):
    contenido = await file.read()
    try:
        hojas = listar_hojas(contenido)
        return {"filename": file.filename, "hojas": hojas}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo hojas: {str(e)}")

@router.post("/upload")
async def upload_manifiesto(
    file: UploadFile = File(...),
    hoja: Optional[str] = Form(None),
    umbral: float = Form(UMBRAL_SIMILITUD),
):
    contenido = await file.read()
    try:
        df = cargar_excel(contenido, hoja)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer el archivo: {str(e)}")

    df, renames = aplicar_mapeo_columnas(df)
    faltantes = validar_columnas_esenciales(df)
    if faltantes:
        raise HTTPException(status_code=400, detail=f"Faltan columnas esenciales: {faltantes}.")

    df, filas_eliminadas = limpiar_manifiesto(df)
    df = marcar_paradas(df, umbral=umbral)
    df = enriquecer_df_con_estados(df)

    provincias = ordenar_provincias(df[COL_PROVINCIA].dropna().unique().tolist())
    resumen_provincias = []
    for prov in provincias:
        df_p = df[df[COL_PROVINCIA] == prov]
        resumen_provincias.append({
            "provincia": prov,
            "hbls": len(df_p),
            "paradas": int(df_p["Paradas"].sum()),
            "bultos": int(df_p["Bultos (Cant.)"].sum()),
        })

    preview = preparar_salida(df).head(20).fillna("").to_dict(orient="records")

    return {
        "status": "success",
        "filename": file.filename,
        "hoja": hoja if hoja and hoja != "string" else "primera hoja del archivo",
        "total_filas": len(df),
        "filas_eliminadas": filas_eliminadas,
        "columnas_renombradas": renames,
        "provincias": resumen_provincias,
        "preview": preview,
    }

@router.post("/paradas/{provincia}")
async def obtener_paradas(
    provincia: str,
    file: UploadFile = File(...),
    hoja: Optional[str] = Form(None),
    umbral: float = Form(UMBRAL_SIMILITUD),
):
    contenido = await file.read()
    df = cargar_excel(contenido, hoja)
    df, _ = aplicar_mapeo_columnas(df)
    faltantes = validar_columnas_esenciales(df)
    if faltantes:
        raise HTTPException(status_code=400, detail=f"Faltan columnas: {faltantes}")

    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df, umbral=umbral)
    df = enriquecer_df_con_estados(df)

    df_prov = df[df[COL_PROVINCIA] == provincia]
    if len(df_prov) == 0:
        raise HTTPException(status_code=404, detail=f"Provincia '{provincia}' no encontrada")

    resumen = resumen_paradas(df_prov)

    return {
        "provincia": provincia,
        "total_paradas": int(df_prov["Paradas"].sum()),
        "total_hbls": len(df_prov),
        "paradas": resumen.fillna("").to_dict(orient="records"),
    }

@router.post("/marcar-estados")
async def marcar_estados(data: EstadosMasivos):
    cantidad = guardar_estados_masivo(data.hbls, data.estado)
    return {"status": "success", "hbls_actualizados": cantidad, "estado": data.estado}

@router.post("/hbls-parada")
async def obtener_hbls_parada(
    file: UploadFile = File(...),
    provincia: str = Form(...),
    municipio: str = Form(...),
    direccion: str = Form(...),
    hoja: Optional[str] = Form(None),
    umbral: float = Form(UMBRAL_SIMILITUD),
):
    import math
    def limpiar_nan(obj):
        if isinstance(obj, dict): return {k: limpiar_nan(v) for k, v in obj.items()}
        elif isinstance(obj, list): return [limpiar_nan(v) for v in obj]
        elif isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)): return 0
        return obj

    contenido = await file.read()
    df = cargar_excel(contenido, hoja)
    df, _ = aplicar_mapeo_columnas(df)
    faltantes = validar_columnas_esenciales(df)
    if faltantes:
        raise HTTPException(status_code=400, detail=f"Faltan columnas: {faltantes}")

    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df, umbral=umbral)
    df = enriquecer_df_con_estados(df)

    mask = ((df[COL_PROVINCIA] == provincia) & (df[COL_MUNICIPIO] == municipio) & (df[COL_DIRECCION] == direccion))
    df_parada = df[mask].copy()

    if len(df_parada) == 0:
        raise HTTPException(status_code=404, detail="Parada no encontrada")

    cols = [COL_HBL, COL_DIRECCION, COL_MUNICIPIO]
    for c in ["Nombre y Apellidos del DESTINATARIO:", "Teléfono del DESTINATARIO", "Contenido del paquete (Descripción)", COL_BULTOS, "Peso (Kg)", "Estado"]:
        if c in df_parada.columns: cols.append(c)

    resultado = df_parada[cols].fillna("").to_dict(orient="records")

    return {"provincia": provincia, "municipio": municipio, "direccion": direccion, "total_hbls": len(df_parada), "hbls": limpiar_nan(resultado)}

@router.post("/estado")
async def actualizar_estado(data: EstadoUpdate):
    if data.estado not in ESTADOS:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Debe ser uno de: {ESTADOS}")
    guardar_estado(data.hbl, data.estado)
    return {"status": "success", "hbl": data.hbl, "estado": data.estado}

@router.post("/estados-masivos")
async def actualizar_estados_masivos(data: EstadosMasivos):
    if data.estado not in ESTADOS:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Debe ser uno de: {ESTADOS}")
    for hbl in data.hbls:
        guardar_estado(hbl, data.estado)
    return {"status": "success", "hbls_actualizados": len(data.hbls), "estado": data.estado}

# ============================================================
# EXPORTACIONES (Volvemos a leer del archivo físico)
# ============================================================

@router.post("/exportar-por-id/{manifiesto_id}/{provincia}")
async def exportar_provincia_por_id(manifiesto_id: int, provincia: str):
    ruta = obtener_ruta_archivo_original(manifiesto_id)
    if not Path(ruta).exists():
        raise HTTPException(status_code=404, detail="Archivo original no encontrado")
    with open(ruta, "rb") as f: contenido = f.read()

    df = cargar_excel(contenido, None)
    df, _ = aplicar_mapeo_columnas(df)
    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df)
    df = enriquecer_df_con_estados(df)

    df_prov = df[df[COL_PROVINCIA] == provincia]
    if len(df_prov) == 0: raise HTTPException(status_code=404, detail="Provincia no encontrada")

    excel_bytes = exportar_provincia_excel(df_prov)
    meta = obtener_manifiesto(manifiesto_id)
    nombre_base = meta["nombre_archivo"].replace(".xlsx", "").replace(".xls", "") if meta else str(manifiesto_id)
    return Response(content=excel_bytes, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="manifiesto_{provincia}_{nombre_base}.xlsx"'})

@router.post("/exportar-ruta-por-id/{manifiesto_id}/{provincia}")
async def exportar_ruta_por_id(manifiesto_id: int, provincia: str):
    ruta = obtener_ruta_archivo_original(manifiesto_id)
    if not Path(ruta).exists(): raise HTTPException(status_code=404, detail="Archivo original no encontrado")
    with open(ruta, "rb") as f: contenido = f.read()

    df = cargar_excel(contenido, None)
    df, _ = aplicar_mapeo_columnas(df)
    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df)
    df = enriquecer_df_con_estados(df)

    df_prov = df[df[COL_PROVINCIA] == provincia]
    if len(df_prov) == 0: raise HTTPException(status_code=404, detail="Provincia no encontrada")

    excel_bytes = exportar_hoja_ruta_excel(df_prov)
    meta = obtener_manifiesto(manifiesto_id)
    nombre_base = meta["nombre_archivo"].replace(".xlsx", "").replace(".xls", "") if meta else str(manifiesto_id)
    return Response(content=excel_bytes, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="ruta_{provincia}_{nombre_base}.xlsx"'})

@router.post("/exportar-municipios-por-id/{manifiesto_id}/{provincia}")
async def exportar_municipios_por_id(manifiesto_id: int, provincia: str):
    ruta = obtener_ruta_archivo_original(manifiesto_id)
    if not Path(ruta).exists(): raise HTTPException(status_code=404, detail="Archivo original no encontrado")
    with open(ruta, "rb") as f: contenido = f.read()

    df = cargar_excel(contenido, None)
    df, _ = aplicar_mapeo_columnas(df)
    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df)
    df = enriquecer_df_con_estados(df)

    df_prov = df[df[COL_PROVINCIA] == provincia]
    if len(df_prov) == 0: raise HTTPException(status_code=404, detail="Provincia no encontrada")

    excel_bytes = exportar_por_municipios_excel(df_prov)
    meta = obtener_manifiesto(manifiesto_id)
    nombre_base = meta["nombre_archivo"].replace(".xlsx", "").replace(".xls", "") if meta else str(manifiesto_id)
    return Response(content=excel_bytes, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="manifiesto_{provincia}_municipios_{nombre_base}.xlsx"'})

@router.post("/exportar-todas-por-id/{manifiesto_id}")
async def exportar_todas_por_id(manifiesto_id: int):
    ruta = obtener_ruta_archivo_original(manifiesto_id)
    if not Path(ruta).exists(): raise HTTPException(status_code=404, detail="Archivo original no encontrado")
    with open(ruta, "rb") as f: contenido = f.read()

    df = cargar_excel(contenido, None)
    df, _ = aplicar_mapeo_columnas(df)
    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df)
    df = enriquecer_df_con_estados(df)

    provincias = ordenar_provincias(df[COL_PROVINCIA].dropna().unique().tolist())
    excel_bytes = exportar_todas_provincias_excel(df, provincias)
    meta = obtener_manifiesto(manifiesto_id)
    nombre_base = meta["nombre_archivo"].replace(".xlsx", "").replace(".xls", "") if meta else str(manifiesto_id)
    return Response(content=excel_bytes, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="manifiesto_todas_provincias_{nombre_base}.xlsx"'})

# ============================================================
# GUARDAR Y LISTAR
# ============================================================
@router.post("/guardar", dependencies=[Depends(verificar_admin)])
async def guardar_endpoint(
    file: UploadFile = File(...),
    hoja: Optional[str] = Form(None),
    umbral: float = Form(UMBRAL_SIMILITUD),
):
    contenido = await file.read()
    hash_archivo = hashlib.md5(contenido).hexdigest()
    existente = buscar_manifiesto_por_hash(hash_archivo)
    if existente:
        return {"status": "already_exists", "manifiesto_id": existente["id"], "mensaje": "Este archivo ya está cargado", "total_filas": existente["total_filas"], "provincias": existente["resumen"]}

    df = cargar_excel(contenido, hoja)
    df, _ = aplicar_mapeo_columnas(df)
    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df, umbral=umbral)
    df = enriquecer_df_con_estados(df)

    provincias = ordenar_provincias(df[COL_PROVINCIA].dropna().unique().tolist())
    resumen = []
    for prov in provincias:
        df_p = df[df[COL_PROVINCIA] == prov]
        municipios = sorted(df_p[COL_MUNICIPIO].dropna().unique().tolist())
        resumen.append({"provincia": prov, "hbls": len(df_p), "paradas": int(df_p["Paradas"].sum()), "bultos": int(df_p["Bultos (Cant.)"].sum()), "municipios": municipios})

    manifiesto_id = guardar_manifiesto(file.filename, df, resumen, hash_archivo)

    uploads_dir = Path(DB_PATH).parent / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    ruta_archivo = uploads_dir / f"manifiesto_{manifiesto_id}.xlsx"
    with open(ruta_archivo, "wb") as f: f.write(contenido)

    return {"status": "success", "manifiesto_id": manifiesto_id, "total_filas": len(df), "provincias": resumen}

@router.get("/lista")
async def listar_endpoint():
    return {"manifiestos": listar_manifiestos()}

@router.get("/hbls")
async def hbls_registros_globales(
    manifiesto_id: Optional[int] = None,
    pagina: int = 1,
    por_pagina: int = 15,
    busqueda: str = "",
    estado: str = "",
    provincia: str = "",
):
    return obtener_hbls(manifiesto_id, pagina=pagina, por_pagina=por_pagina, busqueda=busqueda, estado=estado, provincia=provincia)

@router.get("/{manifiesto_id}/hbls")
async def hbls_endpoint_filtrado(
    manifiesto_id: int,
    pagina: int = 1,
    por_pagina: int = 15,
    busqueda: str = "",
    estado: str = "",
    provincia: str = "",
):
    return obtener_hbls(manifiesto_id, pagina=pagina, por_pagina=por_pagina, busqueda=busqueda, estado=estado, provincia=provincia)

@router.get("/{manifiesto_id}")
async def obtener_endpoint(manifiesto_id: int):
    manifiesto = obtener_manifiesto(manifiesto_id)
    if not manifiesto: raise HTTPException(status_code=404, detail="Manifiesto no encontrado")
    return manifiesto

@router.delete("/{manifiesto_id}", dependencies=[Depends(verificar_admin)])
async def eliminar_endpoint(manifiesto_id: int):
    exito = eliminar_manifiesto(manifiesto_id)
    if not exito: raise HTTPException(status_code=404, detail="Manifiesto no encontrado")
    return {"status": "success", "deleted_id": manifiesto_id}

# ============================================================
# PROVINCIA POR ID
# ============================================================
@router.post("/{manifiesto_id}/provincia/{provincia}")
async def obtener_provincia_por_id(
    manifiesto_id: int,
    provincia: str,
    busqueda: str = Form(""),
    estado: str = Form(""),
    ubicacion: str = Form(""),
):
    ruta = obtener_ruta_archivo_original(manifiesto_id)
    if not Path(ruta).exists(): raise HTTPException(status_code=404, detail="Archivo original no encontrado")
    with open(ruta, "rb") as f: contenido = f.read()

    df = cargar_excel(contenido, None)
    df, _ = aplicar_mapeo_columnas(df)
    df, _ = limpiar_manifiesto(df)
    df = marcar_paradas(df)
    df = enriquecer_df_con_estados(df)

    df_prov = df[df[COL_PROVINCIA] == provincia]
    if len(df_prov) == 0: raise HTTPException(status_code=404, detail="Provincia no encontrada")

    df_filtrado = filtrar_hbls(df_prov, busqueda=busqueda, estado=estado, ubicacion=ubicacion)

    if len(df_filtrado) > 0:
        df_filtrado = marcar_paradas(df_filtrado)
        resumen = resumen_paradas(df_filtrado)
        total_paradas = int(df_filtrado["Paradas"].sum())
    else:
        resumen = pd.DataFrame(columns=["Parada", "Destinatario", "Dirección", "Municipio", "Cant HBLs", "Bultos", "Peso (Kg)"])
        total_paradas = 0

    return {
        "provincia": provincia,
        "total_paradas": total_paradas,
        "total_hbls": len(df_filtrado),
        "total_hbls_sin_filtro": len(df_prov),
        "paradas": resumen.fillna("").to_dict(orient="records"),
    }

# ============================================================
# COMPARAR MANIFIESTOS
# ============================================================
@router.post("/comparar-manifiestos", dependencies=[Depends(verificar_admin)])
async def comparar_manifiestos(
        file_general: UploadFile = File(...),
        file_ventas: UploadFile = File(...),
):
    try:
        contenido_general = await file_general.read()
        df_general = cargar_excel(contenido_general, None)
        df_general, _ = aplicar_mapeo_columnas(df_general)
        if COL_HBL not in df_general.columns:
            raise HTTPException(status_code=400, detail="Falta columna HBL en el archivo General")

        contenido_ventas = await file_ventas.read()
        df_ventas = cargar_excel(contenido_ventas, None)
        df_ventas, _ = aplicar_mapeo_columnas(df_ventas)
        if COL_HBL not in df_ventas.columns:
            raise HTTPException(status_code=400, detail="Falta columna HBL en el archivo de Ventas")

        df_general, _ = limpiar_manifiesto(df_general)
        df_ventas, _ = limpiar_manifiesto(df_ventas)

        hbls_ventas = set(df_ventas[COL_HBL].astype(str).str.strip().tolist())
        df_filtrado = df_general[~df_general[COL_HBL].astype(str).str.strip().isin(hbls_ventas)].copy()

        if len(df_filtrado) == 0:
            raise HTTPException(status_code=400, detail="El resultado de la resta está vacío")

        df_filtrado = marcar_paradas(df_filtrado)
        df_filtrado = enriquecer_df_con_estados(df_filtrado)

        provincias = ordenar_provincias(df_filtrado[COL_PROVINCIA].dropna().unique().tolist())
        resumen = []
        for prov in provincias:
            df_p = df_filtrado[df_filtrado[COL_PROVINCIA] == prov]
            municipios = sorted(df_p[COL_MUNICIPIO].dropna().unique().tolist())
            resumen.append({"provincia": prov, "hbls": len(df_p), "paradas": int(df_p["Paradas"].sum()), "bultos": int(df_p["Bultos (Cant.)"].sum()), "municipios": municipios})

        nombre_archivo = file_general.filename
        hash_archivo = hashlib.md5(contenido_general).hexdigest() + "_resta"
        manifiesto_id = guardar_manifiesto(nombre_archivo, df_filtrado, resumen, hash_archivo)

        from pathlib import Path
        from app.core.config import DB_PATH

        uploads_dir = Path(DB_PATH).parent / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)
        ruta_archivo = uploads_dir / f"manifiesto_{manifiesto_id}.xlsx"

        # Generamos el Excel del resultado (solo una hoja, para no saturar la RAM)
        detalle = preparar_salida(df_filtrado).reset_index(drop=True)
        with pd.ExcelWriter(ruta_archivo, engine="openpyxl") as writer:
            detalle.to_excel(writer, sheet_name="Datos", index=False)

        return {"status": "success", "manifiesto_id": manifiesto_id, "total_filas": len(df_filtrado),
                "provincias": resumen}


    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")