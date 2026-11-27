"""
Servicio para generar archivos Excel (exportaciones).
"""
from io import BytesIO

import re
import pandas as pd
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

from app.core.config import (
    COL_HBL, COL_BULTOS, COL_DIRECCION, COL_PROVINCIA, COL_MUNICIPIO,
    COL_PARADAS,
)
from app.services.paradas_service import preparar_salida, resumen_paradas


# ============================================================
# UTILIDADES DE FORMATO
# ============================================================
def _formatear_hoja(writer, sheet_name):
    """Aplica formato de encabezado y ancho de columnas a una hoja."""
    wb = writer.book
    ws = wb[sheet_name]
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="305496")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for col_idx, col in enumerate(ws.iter_cols(min_row=1, max_row=1), start=1):
        max_len = max((len(str(c.value)) for c in col if c.value), default=10)
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 4, 45)


def _agregar_totales(ws, total_paradas, total_bultos):
    """Añade las filas de totales al pie de una hoja."""
    fila = ws.max_row + 2

    ws.cell(row=fila, column=1, value="TOTAL PARADAS PROVINCIA:").font = Font(bold=True)
    c = ws.cell(row=fila, column=2, value=total_paradas)
    c.font = Font(bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", fgColor="C00000")
    c.alignment = Alignment(horizontal="left")

    fila2 = fila + 1
    ws.cell(row=fila2, column=1, value="TOTAL BULTOS PROVINCIA:").font = Font(bold=True)
    c2 = ws.cell(row=fila2, column=2, value=total_bultos)
    c2.font = Font(bold=True, color="FFFFFF")
    c2.fill = PatternFill("solid", fgColor="305496")
    c2.alignment = Alignment(horizontal="left")


# ============================================================
# EXPORTAR PROVINCIA (manifiesto completo)
# ============================================================
def exportar_provincia_excel(df_prov: pd.DataFrame) -> bytes:
    """
    Genera un Excel con el detalle de la provincia + hoja de Paradas + totales.
    Retorna los bytes del archivo.
    """
    output = BytesIO()
    detalle = preparar_salida(df_prov).reset_index(drop=True)
    total_paradas = int(df_prov[COL_PARADAS].sum())
    total_bultos = int(df_prov[COL_BULTOS].sum())

    # Nombre de hoja seguro
    provincia = str(df_prov[COL_PROVINCIA].iloc[0])[:31]
    nombre_detalle = provincia
    nombre_resumen = "Paradas"

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        # --- Hoja 1: Detalle ---
        detalle.to_excel(writer, sheet_name=nombre_detalle, index=False)
        _formatear_hoja(writer, nombre_detalle)
        _agregar_totales(writer.book[nombre_detalle], total_paradas, total_bultos)

        # --- Hoja 2: Paradas (resumen) ---
        resumen = resumen_paradas(df_prov)
        resumen.to_excel(writer, sheet_name=nombre_resumen, index=False)
        _formatear_hoja(writer, nombre_resumen)

    output.seek(0)
    return output.getvalue()


# ============================================================
# EXPORTAR HOJA DE RUTA (simplificada para el repartidor)
# ============================================================
def exportar_hoja_ruta_excel(df: pd.DataFrame) -> bytes:
    """
    Genera la hoja de ruta para el repartidor.
    Columnas: Parada | HBL | Remitente | Destinatario | Dirección | Municipio
             | Provincia | Teléfono | Bultos | Contenido | Estado
    """
    output = BytesIO()

    COL_REMITENTE = "Nombre y Apellidos del REMITENTE:"
    COL_DESTINATARIO = "Nombre y Apellidos del DESTINATARIO:"
    COL_TELEFONO = "Teléfono del DESTINATARIO"
    COL_CONTENIDO = "Contenido del paquete (Descripción)"

    df_ord = df.sort_values([COL_MUNICIPIO, "_grupo_id", COL_HBL], kind="stable").copy()

    # Renumerar paradas secuencialmente
    mapa = {}
    contador = 0
    nuevas = []
    for gid in df_ord["_grupo_id"]:
        if gid not in mapa:
            contador += 1
            mapa[gid] = contador
        nuevas.append(mapa[gid])
    df_ord["Parada"] = nuevas

    columnas = [
        "Parada", COL_HBL, COL_REMITENTE, COL_DESTINATARIO,
        COL_DIRECCION, COL_MUNICIPIO, COL_PROVINCIA,
        COL_TELEFONO, COL_BULTOS, COL_CONTENIDO, "Estado",
    ]
    for c in columnas:
        if c not in df_ord.columns:
            df_ord[c] = ""

    df_salida = df_ord[columnas].reset_index(drop=True)

    total_paradas = df_ord["Parada"].nunique()
    total_bultos = int(pd.to_numeric(df_ord[COL_BULTOS], errors="coerce").fillna(0).sum())

    provincia = str(df[COL_PROVINCIA].iloc[0])[:26]
    nombre_hoja = f"Ruta {provincia}"[:31]

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df_salida.to_excel(writer, sheet_name=nombre_hoja, index=False)
        _formatear_hoja(writer, nombre_hoja)
        _agregar_totales(writer.book[nombre_hoja], total_paradas, total_bultos)

        # Hoja 2: Paradas (resumen)
        resumen = resumen_paradas(df)
        resumen.to_excel(writer, sheet_name="Paradas", index=False)
        _formatear_hoja(writer, "Paradas")

    output.seek(0)
    return output.getvalue()


# ============================================================
# EXPORTAR TODAS LAS PROVINCIAS (Excel masivo)
# ============================================================
def exportar_todas_provincias_excel(df: pd.DataFrame, provincias: list) -> bytes:
    """
    Genera un Excel con una hoja por provincia + hoja Resumen General.
    """
    output = BytesIO()
    resumen_general = []

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for prov in provincias:
            df_p = df[df[COL_PROVINCIA] == prov].copy()
            if len(df_p) == 0:
                continue

            detalle = preparar_salida(df_p).reset_index(drop=True)
            total_p = int(df_p[COL_PARADAS].sum())
            total_b = int(df_p[COL_BULTOS].sum())

            nombre_hoja = str(prov)[:31]
            detalle.to_excel(writer, sheet_name=nombre_hoja, index=False)
            _formatear_hoja(writer, nombre_hoja)
            _agregar_totales(writer.book[nombre_hoja], total_p, total_b)

            resumen_general.append({
                "Provincia": prov,
                "Total HBLs": len(df_p),
                "Total Bultos": total_b,
                "Total Paradas": total_p,
            })

        # Hoja Resumen General al final
        df_resumen = pd.DataFrame(resumen_general)
        df_resumen.to_excel(writer, sheet_name="Resumen General", index=False)
        _formatear_hoja(writer, "Resumen General")

    output.seek(0)
    return output.getvalue()

# ============================================================
# EXPORTAR POR MUNICIPIOS (una hoja por municipio)
# ============================================================
def exportar_por_municipios_excel(df_prov: pd.DataFrame) -> bytes:
    """
    Genera un Excel con:
    - Una hoja "Resumen General" (tabla de todos los municipios)
    - Una hoja por cada municipio, ordenadas alfabéticamente
    """
    output = BytesIO()

    municipios = sorted(df_prov[COL_MUNICIPIO].dropna().unique().tolist())

    resumen = []

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        # 1. Reservar la primera hoja para "Resumen General" (se llenará al final)
        df_temp = pd.DataFrame({"Aviso": ["Pendiente"]})
        df_temp.to_excel(writer, sheet_name="Resumen General", index=False)

        # 2. Generar una hoja por municipio
        for muni in municipios:
            df_m = df_prov[df_prov[COL_MUNICIPIO] == muni].copy()

            if len(df_m) == 0:
                continue

            detalle = preparar_salida(df_m).reset_index(drop=True)
            total_p = int(df_m[COL_PARADAS].sum())
            total_b = int(df_m[COL_BULTOS].sum())

            # Nombre de hoja seguro para Excel
            nombre_hoja = re.sub(r"[\\/*?:\[\]]", "_", str(muni))[:31]

            detalle.to_excel(writer, sheet_name=nombre_hoja, index=False)
            _formatear_hoja(writer, nombre_hoja)
            _agregar_totales(writer.book[nombre_hoja], total_p, total_b)

            # Totales para el resumen general
            peso_total = 0
            if "Peso (Kg)" in df_m.columns:
                peso_total = pd.to_numeric(df_m["Peso (Kg)"], errors="coerce").fillna(0).sum()

            resumen.append({
                "Municipio": muni,
                "Total HBLs": len(df_m),
                "Total Bultos": total_b,
                "Total Paradas": total_p,
                "Peso Total (Kg)": round(float(peso_total), 2),
            })

        # 3. Llenar la hoja "Resumen General"
        wb = writer.book
        ws = wb["Resumen General"]

        # Limpiar el contenido temporal
        for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=ws.max_column):
            for cell in row:
                cell.value = None

        # Escribir encabezados
        headers = ["Municipio", "Total HBLs", "Total Bultos", "Total Paradas", "Peso Total (Kg)"]
        for j, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=j, value=h)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="305496")
            cell.alignment = Alignment(horizontal="center", vertical="center")

        # Escribir datos
        for i, fila in enumerate(resumen, start=2):
            for j, h in enumerate(headers, start=1):
                ws.cell(row=i, column=j, value=fila[h])

        # Ancho de columnas del resumen
        for col_idx, col in enumerate(ws.iter_cols(min_row=1, max_row=1), start=1):
            max_len = max((len(str(c.value)) for c in col if c.value), default=10)
            ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 4, 30)

        # Totales generales al pie
        fila_total = len(resumen) + 3
        ws.cell(row=fila_total, column=1,
                value="TOTAL PROVINCIA:").font = Font(bold=True)

        ws.cell(row=fila_total, column=2, value=sum(r["Total HBLs"] for r in resumen))
        ws.cell(row=fila_total, column=3, value=sum(r["Total Bultos"] for r in resumen))
        ws.cell(row=fila_total, column=4, value=sum(r["Total Paradas"] for r in resumen))
        ws.cell(row=fila_total, column=5,
                value=round(sum(r["Peso Total (Kg)"] for r in resumen), 2))

        for j in range(2, 6):
            c = ws.cell(row=fila_total, column=j)
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="C00000")
            c.alignment = Alignment(horizontal="left")

    output.seek(0)
    return output.getvalue()

# ============================================================
# EXPORTAR LA RUTA ORDENADA DE UN REPARTIDOR
# ============================================================
def _agregar_totales_ruta(hoja, ruta: dict) -> int:
    """Pie con el resumen de la ruta y el aviso de cómo se calculó.

    Devuelve la fila de la nota final, para poder ajustarla al imprimir.
    """
    fila = hoja.max_row + 2
    resumen = [
        ("REPARTIDOR:", ruta["repartidor"]),
        ("PROVINCIA:", ruta["provincia"]),
        ("TOTAL PARADAS:", ruta["total_paradas"]),
        ("TOTAL BULTOS:", ruta["total_bultos"]),
        ("TOTAL PESO (KG):", ruta["total_peso"]),
        ("DISTANCIA ESTIMADA (KM):", ruta["distancia_km"]),
    ]
    origen = ruta.get("origen") or {}
    salida = {
        "base": origen.get("etiqueta") or "Base de salida",
        "cabecera": "Cabecera provincial",
        "primera_parada": "Primera parada (sin salida ubicada)",
    }.get(origen.get("tipo"))
    if salida:
        resumen.insert(1, ("SALIDA:", salida))

    if ruta.get("aproximadas"):
        resumen.append(("PARADAS CON UBICACIÓN APROXIMADA:", ruta["aproximadas"]))
    if ruta.get("sin_ubicar"):
        resumen.append(("PARADAS SIN UBICAR:", ruta["sin_ubicar"]))

    for indice, (etiqueta, valor) in enumerate(resumen):
        hoja.cell(row=fila + indice, column=1, value=etiqueta).font = Font(bold=True)
        hoja.cell(row=fila + indice, column=2, value=valor)

    nota = fila + len(resumen) + 1
    celda = hoja.cell(
        row=nota,
        column=1,
        value=(
            "Orden por cercanía desde el punto de salida del repartidor; si no "
            "tiene uno asignado, desde la cabecera provincial. La distancia "
            "está estimada por carretera y los kilómetros son acumulados."
        ),
    )
    celda.font = Font(italic=True, color="595959")
    return nota


# Anchos pensados para doblar la hoja de ruta en el campo: la dirección es la
# columna que más ocupa y el resto se ajusta para que quepa en un A4 horizontal.
ANCHOS_RUTA = {
    "Parada": 7,
    "Municipio": 18,
    "Dirección": 40,
    "Destinatario": 26,
    "Teléfono": 13,
    "HBLs": 22,
    "Bultos": 7,
    "Peso (Kg)": 9,
    "Estado": 11,
    "Km acumulados": 11,
    "Ubicación": 12,
}


def _preparar_ruta_para_imprimir(hoja, columnas: list, filas: int, nota: int) -> None:
    """Deja la hoja lista para imprimir y llevar encima.

    Congela la cabecera y la columna de la parada, activa el autofiltro sobre
    los datos (sin incluir el pie de totales), repite la cabecera en cada
    página y ajusta la impresión a una hoja de ancho en A4 horizontal.
    """
    hoja.freeze_panes = "B2"
    if filas > 0:
        hoja.auto_filter.ref = f"A1:{get_column_letter(len(columnas))}{filas + 1}"

    for indice, columna in enumerate(columnas, start=1):
        ancho = ANCHOS_RUTA.get(columna)
        if ancho:
            hoja.column_dimensions[get_column_letter(indice)].width = ancho
    for fila in hoja.iter_rows(min_row=2, max_row=filas + 1):
        for celda in fila:
            celda.alignment = Alignment(vertical="top", wrap_text=True)

    # La nota del pie ocupa todo el ancho para que no se corte al imprimir.
    if nota:
        if len(columnas) > 1:
            hoja.merge_cells(
                start_row=nota, start_column=1, end_row=nota, end_column=len(columnas)
            )
        hoja.cell(row=nota, column=1).alignment = Alignment(
            vertical="top", wrap_text=True
        )
        hoja.row_dimensions[nota].height = 30

    hoja.print_title_rows = "1:1"
    hoja.print_options.horizontalCentered = True
    hoja.page_setup.orientation = "landscape"
    hoja.page_setup.paperSize = hoja.PAPERSIZE_A4
    hoja.page_setup.fitToWidth = 1
    hoja.page_setup.fitToHeight = 0
    hoja.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    hoja.page_margins.left = 0.3
    hoja.page_margins.right = 0.3
    hoja.page_margins.top = 0.4
    hoja.page_margins.bottom = 0.4


def exportar_ruta_repartidor_excel(ruta: dict) -> bytes:
    """
    Excel de la ruta de un repartidor, en el mismo orden que la pantalla.

    Columnas: Parada | Municipio | Dirección | Destinatario | Teléfono | HBLs |
    Bultos | Peso (Kg) | Estado | Km acumulados | Ubicación
    """
    etiquetas_precision = {
        "direccion": "Exacta",
        "municipio": "Aproximada",
        "manual": "Corregida",
        None: "Sin ubicar",
    }

    filas = [
        {
            "Parada": parada["orden"],
            "Municipio": parada["municipio"],
            "Dirección": parada["direccion"],
            "Destinatario": parada["destinatario"],
            "Teléfono": parada["telefono"],
            "HBLs": ", ".join(parada["hbls"]),
            "Bultos": parada["bultos"],
            "Peso (Kg)": round(parada["peso"], 1),
            "Estado": parada["estado"],
            "Km acumulados": (
                parada["tramo_km"] if parada["tramo_km"] is not None else ""
            ),
            "Ubicación": etiquetas_precision.get(parada["precision"], "Sin ubicar"),
        }
        for parada in ruta["paradas"]
    ]

    columnas = [
        "Parada", "Municipio", "Dirección", "Destinatario", "Teléfono",
        "HBLs", "Bultos", "Peso (Kg)", "Estado", "Km acumulados", "Ubicación",
    ]
    tabla = pd.DataFrame(filas, columns=columnas)

    output = BytesIO()
    nombre_hoja = f"Ruta {ruta['repartidor']}"[:31]

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        tabla.to_excel(writer, sheet_name=nombre_hoja, index=False)
        _formatear_hoja(writer, nombre_hoja)
        hoja = writer.book[nombre_hoja]
        nota = _agregar_totales_ruta(hoja, ruta)
        _preparar_ruta_para_imprimir(hoja, columnas, len(filas), nota)

    output.seek(0)
    return output.getvalue()
