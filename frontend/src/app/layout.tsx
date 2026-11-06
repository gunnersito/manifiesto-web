"use client"; // 👈 Necesario para usar usePathname

import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ManifiestoProvider } from "@/contexts/ManifiestoContext";
import { usePathname } from "next/navigation";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  // 👇 Si estamos en login, no mostramos el sidebar
  const esLogin = pathname === "/login";

  return (
    <html lang="es" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <ManifiestoProvider>
          {esLogin ? (
            // Vista limpia para el Login
            <main className="min-h-screen">{children}</main>
          ) : (
            // Vista con Sidebar para el resto de la app
            <div className="flex min-h-screen bg-slate-50">
              <Sidebar />
              <main className="flex-1 overflow-x-auto">{children}</main>
            </div>
          )}
        </ManifiestoProvider>
      </body>
    </html>
  );
}