import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Todo lo que no sea el login exige sesión. La cookie `sesion` no contiene el
// token (ese es httpOnly y vive en el dominio de la API): solo marca que hay
// sesión abierta, y la API sigue siendo quien valida el token.
const RUTAS_PUBLICAS = ['/login'];

function esRutaPublica(pathname: string) {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  );
}

export function middleware(request: NextRequest) {
  const sesion = request.cookies.get('sesion')?.value;
  const { pathname } = request.nextUrl;
  const publica = esRutaPublica(pathname);

  if (!sesion && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (sesion && publica) {
    return NextResponse.redirect(new URL('/manifiestos', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Los archivos estáticos (con extensión) no necesitan sesión.
  matcher: ['/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)'],
};
