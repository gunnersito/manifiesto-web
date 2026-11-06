"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ArrowLeft, Eye, EyeOff, CheckCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api"; // Importa tu instancia de axios

export default function PerfilPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem("username");
    if (!u) router.push("/login");
    else setUsername(u);
  }, [router]);

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await api.put("/usuarios/perfil/password", { password });
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Error al cambiar contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-blue-600 mb-6">
        <ArrowLeft className="w-4 h-4" /> Volver al inicio
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <div className="bg-blue-100 p-3 rounded-full">
            <KeyRound className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mi Perfil</h1>
            <p className="text-slate-500 text-sm">Hola, <b className="text-slate-700">{username}</b>. Cambia tu contraseña aquí.</p>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" /> Contraseña actualizada correctamente.
          </div>
        )}

        <form onSubmit={handleCambiarPassword} className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label>Nueva Contraseña</Label>
            <div className="relative">
              <Input
                required
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                // 👇 Borde rojo si no coinciden
                className={`!h-[42px] pr-10 ${
                  password && confirmPassword && password !== confirmPassword 
                    ? "border-red-500 focus-visible:ring-red-500" 
                    : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Campo Confirmar Contraseña */}
          <div className="space-y-2">
            <Label>Confirmar Contraseña</Label>
            <Input
              required
              type={showPass ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite tu nueva contraseña"
              // 👇 Borde rojo si no coinciden
              className={`!h-[42px] ${
                password && confirmPassword && password !== confirmPassword 
                  ? "border-red-500 focus-visible:ring-red-500" 
                  : ""
              }`}
            />
            {/* 👇 Mensaje de error debajo del segundo campo 👇 */}
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1.5 font-medium">
                Las contraseñas no coinciden.
              </p>
            )}
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 !h-[42px] mt-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar Contraseña"}
          </Button>
        </form>
      </div>
    </div>
  );
}