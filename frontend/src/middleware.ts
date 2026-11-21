import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Todo lo que no sea el login exige sesión. Sin token se vuelve al login antes
// de pintar la página, en vez de dejar que se renderice y que sus llamadas a la
// API fallen con 401.
const RUTAS_PUBLICAS = ['/login'];

function esRutaPublica(pathname: string) {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  );
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;
  const publica = esRutaPublica(pathname);

  if (!token && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (token && publica) {
    return NextResponse.redirect(new URL('/manifiestos', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Los archivos estáticos (con extensión) no necesitan sesión.
  matcher: ['/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)'],
};
