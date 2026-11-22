import type { NextConfig } from "next";

// Destino del proxy /api. La variable incluye el prefijo /api del backend (por
// ejemplo https://manifiesto-backend.onrender.com/api). Se leen las barras
// finales para que el rewrite no genere rutas con //.
const API_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://manifiesto-backend.onrender.com/api"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // El navegador habla siempre con este mismo origen: todo /api/* se reenvía a
  // la API real desde el servidor de Next. Así la sesión es same-origin y deja
  // de depender de CORS y de una cookie SameSite=None.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },

  // Permite que el navegador del preview (u otro host de desarrollo) cargue los
  // recursos del dev server, sin fijar el host en el código.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origen) => origen.trim())
    .filter(Boolean),
};

export default nextConfig;