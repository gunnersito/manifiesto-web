import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que el navegador del preview (u otro host de desarrollo) cargue los
  // recursos del dev server, sin fijar el host en el código.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origen) => origen.trim())
    .filter(Boolean),
};

export default nextConfig;