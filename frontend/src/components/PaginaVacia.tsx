interface Props {
  titulo: string;
  descripcion: string;
  icono?: string;
}

export default function PaginaVacia({ titulo, descripcion, icono = "🚧" }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="text-6xl mb-4">{icono}</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{titulo}</h1>
          <p className="text-slate-600">{descripcion}</p>
          <p className="text-sm text-slate-400 mt-6">
            Esta sección estará disponible próximamente.
          </p>
        </div>
      </div>
    </div>
  );
}