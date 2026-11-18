import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi perfil",
};

export default function PerfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
