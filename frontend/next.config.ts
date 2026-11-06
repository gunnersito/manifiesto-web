import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Permite que el build de producción termine aunque haya advertencias de ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Permite que el build de producción termine aunque haya errores de tipos
    ignoreBuildErrors: true,
  },
};

export default nextConfig;