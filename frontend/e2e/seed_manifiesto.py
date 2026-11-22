"""
Siembra el manifiesto que usa la prueba e2e de humo.

La prueba recorre login, provincias, una parada y la página 2 de registros, así
que hacen falta un manifiesto con más de 15 HBLs y al menos una parada con
varios. Se inserta directo en la base (no pasa por Storage ni por el Excel) y se
puede ejecutar las veces que haga falta: borra el manifiesto anterior.

Uso (desde la raíz del repo, con las mismas variables que la API):

    PYTHONPATH=backend python frontend/e2e/seed_manifiesto.py
"""
import json
import os

# Igual que las pruebas del backend: sin estas variables no arranca la config.
os.environ.setdefault("SECRET_KEY", "clave-solo-para-pruebas")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/manifiesto_test"
)
os.environ.setdefault("SUPABASE_URL", "https://proyecto-de-pruebas.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "clave-solo-para-pruebas")

from psycopg2.extras import execute_batch  # noqa: E402

from app.core.database import get_db_connection, init_db  # noqa: E402

HASH_E2E = "e2e-humo"

# (provincia, municipio, dirección, destinatario de la parada, nº de HBLs)
PARADAS = [
    ("ARTEMISA", "ARTEMISA", "CALLE PRIMERA NO. 100", "E2E PRIMERA UNO", 3),
    ("ARTEMISA", "ARTEMISA", "AVENIDA SEGUNDA NO. 200", "E2E SEGUNDA DOS", 2),
    ("ARTEMISA", "ARTEMISA", "REPARTO TERCERA NO. 300", "E2E TERCERA TRES", 13),
    ("GRANMA", "BARTOLOME MASO", "CAMINO CUARTO NO. 400", "E2E CUARTA CUATRO", 2),
]


def main() -> None:
    init_db()

    filas = []
    resumen = {}
    contador = {}
    for provincia, municipio, direccion, destinatario, cantidad in PARADAS:
        grupo = resumen.setdefault(
            provincia,
            {"provincia": provincia, "hbls": 0, "paradas": 0, "bultos": 0, "municipios": []},
        )
        if municipio not in grupo["municipios"]:
            grupo["municipios"].append(municipio)
        grupo["paradas"] += 1

        for posicion in range(cantidad):
            contador[provincia] = contador.get(provincia, 0) + 1
            hbl = f"E2E-{provincia[0]}{contador[provincia]:02d}"
            grupo["hbls"] += 1
            grupo["bultos"] += 1
            filas.append(
                (
                    hbl,
                    provincia,
                    municipio,
                    direccion,
                    "E2E REMITENTE",
                    destinatario,
                    "5555",
                    f"E2E CONTENIDO {contador[provincia]}",
                    1 if posicion == 0 else 0,
                )
            )

    resumen_json = json.dumps(list(resumen.values()), ensure_ascii=False)
    total_hbls = sum(g["hbls"] for g in resumen.values())
    total_paradas = sum(g["paradas"] for g in resumen.values())

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM manifiestos WHERE hash_archivo = %s", (HASH_E2E,))
            cursor.execute(
                """
                INSERT INTO manifiestos (
                    nombre_archivo, hash_archivo, fecha_subida, total_filas,
                    total_provincias, total_paradas, total_bultos, resumen_json
                ) VALUES ('e2e.xlsx', %s, '2026-01-01 00:00:00', %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    HASH_E2E,
                    total_hbls,
                    len(resumen),
                    total_paradas,
                    total_hbls,
                    resumen_json,
                ),
            )
            manifiesto_id = cursor.fetchone()[0]

            execute_batch(
                cursor,
                """
                INSERT INTO hbls (
                    manifiesto_id, hbl, provincia, municipio, direccion, remitente,
                    destinatario, telefono, contenido, bultos, peso, parada, estado,
                    datos_extra
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 1.5, %s, 'Pendiente', '{}')
                """,
                [
                    (manifiesto_id, hbl, provincia, municipio, direccion, remitente,
                     destinatario, telefono, contenido, parada)
                    for hbl, provincia, municipio, direccion, remitente,
                    destinatario, telefono, contenido, parada in filas
                ],
            )
        conn.commit()
    finally:
        conn.close()

    print(
        f"Manifiesto e2e sembrado: id={manifiesto_id}, "
        f"{total_hbls} HBLs, {total_paradas} paradas, {len(resumen)} provincias"
    )


if __name__ == "__main__":
    main()
