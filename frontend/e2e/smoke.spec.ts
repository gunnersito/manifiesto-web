import { test, expect, type Page } from "@playwright/test";
import { stat } from "node:fs/promises";

// Todos los datos van por /api del propio frontend (proxy same-origin), así que
// estas pruebas también cubren que la cookie de sesión viaja bien.
async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Tu usuario").fill(process.env.E2E_USER || "admin");
  await page
    .locator('input[type="password"]')
    .fill(process.env.E2E_PASSWORD || "clave-solo-para-pruebas");
  await page.getByRole("button", { name: "Entrar" }).click();

  // El login deja la cookie de sesión y entra en la lista de manifiestos.
  await expect(page).toHaveURL(/\/manifiestos$/);
}

// Recorrido de humo contra la API y la web reales: sesión, resumen de
// provincias, HBLs de una parada y segunda página de registros.
// Los datos los siembra `e2e/seed_manifiesto.py`.
test("login → provincias → abrir parada → registros → página 2", async ({ page }) => {
  await entrar(page);

  // Resumen de provincias con los totales del manifiesto sembrado.
  await page.goto("/provincias");
  const tarjeta = page.getByRole("link", { name: /ARTEMISA/ });
  await expect(tarjeta).toContainText("18 HBLs");
  await expect(tarjeta).toContainText("3 paradas");
  await tarjeta.click();

  await expect(page).toHaveURL(/nombre=ARTEMISA/);

  // Abrir una parada carga sus HBLs desde el listado filtrado.
  const parada = page.getByRole("button", { name: /E2E PRIMERA UNO/ });
  await expect(parada).toContainText(/3\s*HBLs/);
  await parada.click();
  await expect(page.getByRole("cell", { name: "E2E-A01" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E-A02" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E-A03" })).toBeVisible();

  // Registros: 20 HBLs en páginas de 15.
  await page.goto("/registros");
  await expect(page.getByText("Página 1 de 2")).toBeVisible();
  await expect(page.getByText("1-15 de 20")).toBeVisible();

  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await expect(page.getByText("16-20 de 20")).toBeVisible();
  // El último HBL solo aparece en la segunda página.
  await expect(page.getByText("E2E-G02", { exact: true }).first()).toBeVisible();
});

// La exportación descarga un binario a través del proxy /api: si la cookie no
// llegase o la respuesta se rompiese, el navegador no recibiría el Excel.
test("exportación descarga el Excel por el proxy /api", async ({ page }) => {
  await entrar(page);

  await page.goto("/exportar");
  const boton = page.getByRole("button", { name: /Descargar Excel completo/ });
  await expect(boton).toBeVisible();

  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    boton.click(),
  ]);

  expect(descarga.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(await descarga.failure()).toBeNull();

  const ruta = await descarga.path();
  expect(ruta).toBeTruthy();
  expect((await stat(ruta!)).size).toBeGreaterThan(0);
});
