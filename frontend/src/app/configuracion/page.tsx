"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus, Loader2, ShieldAlert, Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { obtenerUsuarios, crearUsuario, eliminarUsuario, actualizarUsuario, type UsuarioSistema } from "@/lib/api";

export default function ConfiguracionPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<string | null>(null);

  // Formulario de creación
  const [nuevoUser, setNuevoUser] = useState({ username: "", password: "", role: "guest" });
  const [confirmPasswordCreate, setConfirmPasswordCreate] = useState("");
  const [creando, setCreando] = useState(false);

  // Estados para el Modal de Edición
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioSistema | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("");
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [editPasswordConfirm, setEditPasswordConfirm] = useState("");

  const [showPassCreate, setShowPassCreate] = useState(false);
  const [showPassEdit, setShowPassEdit] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "admin") {
      setEsAdmin(false);
      setTimeout(() => router.push("/"), 2000);
    } else {
      setEsAdmin(true);
      cargarUsuarios();
    }
  }, [router]);

  const cargarUsuarios = async () => {
    setLoading(true);
    try {
      const data = await obtenerUsuarios();
      setUsuarios(data);
    } catch (err: any) {
      setError("Error al cargar usuarios. Verifica tus permisos.");
    } finally {
      setLoading(false);
    }
  };

    const handleCrearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();

    if (nuevoUser.password !== confirmPasswordCreate) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }

    setCreando(true);
    try {
      await crearUsuario(nuevoUser);
      setNuevoUser({ username: "", password: "", role: "guest" });
      setConfirmPasswordCreate(""); // Limpiar
      cargarUsuarios();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error al crear usuario");
    } finally {
      setCreando(false);
    }
  };

    const handleActualizarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioEditando) return;

    // 👇 Validación de contraseñas
    if (editPassword && editPassword !== editPasswordConfirm) {
      toast.error("Las contraseñas no coinciden. Por favor, verifica.");
      return; // Detiene la ejecución aquí
    }

    setGuardandoEdit(true);
    try {
      await actualizarUsuario(usuarioEditando.username, {
        password: editPassword || undefined,
        role: editRole,
      });
      setUsuarioEditando(null);
      setEditPassword("");
      setEditPasswordConfirm(""); // Limpiar también el confirm
      cargarUsuarios();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error al actualizar usuario");
    } finally {
      setGuardandoEdit(false);
    }
  };

  const handleEliminar = async () => {
    if (!usuarioAEliminar) return;

    try {
      await eliminarUsuario(usuarioAEliminar);
      cargarUsuarios();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error al eliminar");
    } finally {
      setUsuarioAEliminar(null);
    }
  };

  if (esAdmin === null) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  if (!esAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Acceso Denegado</h1>
        <p className="text-slate-600">Solo los administradores pueden ver esta página. Redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 px-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-500 mt-1">Gestiona los accesos y usuarios del sistema</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-blue-600" />
          Crear nuevo usuario
        </h2>

        <form onSubmit={handleCrearUsuario} className="flex flex-col md:flex-row gap-4 w-full">
          {/* Campo Usuario */}
          <div className="flex flex-col justify-end flex-1 min-w-[150px]">
            <Label className="text-sm font-medium text-slate-700 mb-2">Usuario</Label>
            <Input
              required
              value={nuevoUser.username}
              onChange={(e) => setNuevoUser({...nuevoUser, username: e.target.value})}
              placeholder="ej. juanperez"
              className="!h-[42px] bg-white"
            />
          </div>

          {/* Campo Contraseña */}
          <div className="flex flex-col justify-end flex-1 min-w-[150px]">
            <Label className="text-sm font-medium text-slate-700 mb-2">Contraseña</Label>
            <div className="relative">
              <Input
                required
                type={showPassCreate ? "text" : "password"}
                value={nuevoUser.password}
                onChange={(e) => setNuevoUser({...nuevoUser, password: e.target.value})}
                placeholder="••••••••"
                className="!h-[42px] bg-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassCreate(!showPassCreate)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPassCreate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-end flex-1 min-w-[150px]">
            <Label className="text-sm font-medium text-slate-700 mb-2">Confirmar Contraseña</Label>
            <Input
              required
              type={showPassCreate ? "text" : "password"}
              value={confirmPasswordCreate}
              onChange={(e) => setConfirmPasswordCreate(e.target.value)}
              placeholder="Repite la contraseña"
              className={`!h-[42px] bg-white ${confirmPasswordCreate && nuevoUser.password !== confirmPasswordCreate ? "border-red-500" : ""}`}
            />
          </div>

          {/* Campo Rol */}
          <div className="flex flex-col justify-end w-full md:w-[150px]">
            <Label className="text-sm font-medium text-slate-700 mb-2">Rol</Label>
            <Select value={nuevoUser.role} onValueChange={(v) => setNuevoUser({...nuevoUser, role: v || "guest"})}>
              <SelectTrigger className="w-full !h-[42px] bg-white px-3 py-2">
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value="guest">guest</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Botón Crear */}
          <div className="flex flex-col justify-end pb-[2px]">
            <Button
              type="submit"
              disabled={creando}
              className="bg-blue-600 hover:bg-blue-700 !h-[42px] px-6 font-medium"
            >
              {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear"}
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-slate-600" />
            Usuarios registrados
          </h2>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : error ? (
          <div className="p-6 text-red-600 bg-red-50">{error}</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Usuario</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Rol</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.username} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-900">{u.username}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {u.username === "admin" ? (
                      <span className="text-xs text-slate-400 italic">Protegido</span>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setUsuarioEditando(u);
                            setEditRole(u.role);
                            setEditPassword("");
                            setEditPasswordConfirm("");
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar usuario"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setUsuarioAEliminar(u.username)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar usuario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No hay usuarios registrados.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL DE EDICIÓN */}
      {usuarioEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-slate-900">Editar a {usuarioEditando.username}</h3>
              <button onClick={() => setUsuarioEditando(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleActualizarUsuario} className="p-6 space-y-4">
              <div>
                <Label className="mb-2 block">Nueva Contraseña (opcional)</Label>
                <div className="relative">
                  <Input
                    type={showPassEdit ? "text" : "password"}
                    placeholder="Dejar en blanco para no cambiar"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className={`bg-white !h-[42px] pr-10 ${
                      editPassword && editPasswordConfirm && editPassword !== editPasswordConfirm 
                        ? "border-red-500 focus-visible:ring-red-500" 
                        : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassEdit(!showPassEdit)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassEdit ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Campo Confirmar Contraseña (solo aparece si se escribe algo en el primero) */}
              {editPassword && (
                <div>
                  <Label className="mb-2 block">Confirmar Contraseña</Label>
                  <Input
                    type="password"
                    placeholder="Repite la nueva contraseña"
                    value={editPasswordConfirm}
                    onChange={(e) => setEditPasswordConfirm(e.target.value)}
                    className={`bg-white !h-[42px] ${
                      editPassword && editPasswordConfirm && editPassword !== editPasswordConfirm 
                        ? "border-red-500 focus-visible:ring-red-500" 
                        : ""
                    }`}
                  />
                  {/* 👇 AQUÍ ESTÁ EL MENSAJE AHORA 👇 */}
                  {editPassword && editPasswordConfirm && editPassword !== editPasswordConfirm && (
                    <p className="text-xs text-red-500 mt-1.5 font-medium">
                      Las contraseñas no coinciden.
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label className="mb-2 block">Rol</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v || "guest")}>
                  <SelectTrigger className="w-full !h-[42px] bg-white px-3 py-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="guest">guest</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setUsuarioEditando(null)} className="!h-[42px]">
                  Cancelar
                </Button>
                <Button type="submit" disabled={guardandoEdit} className="bg-blue-600 hover:bg-blue-700 !h-[42px]">
                  {guardandoEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Cambios"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Confirmación de Eliminación */}
      <Modal
          isOpen={usuarioAEliminar !== null}
          onClose={() => setUsuarioAEliminar(null)}
          title="Confirmar eliminación"
      >
        <p className="text-slate-600 mb-6">
          ¿Estás seguro de que quieres eliminar al usuario <b>{usuarioAEliminar}</b>? Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-3">
          <button
              onClick={() => setUsuarioAEliminar(null)}
              className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
              onClick={handleEliminar}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            Eliminar
          </button>
        </div>
      </Modal>
    </div>
  );
}