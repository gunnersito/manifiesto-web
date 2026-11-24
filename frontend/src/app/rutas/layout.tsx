import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rutas",
};

export default function RutasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
