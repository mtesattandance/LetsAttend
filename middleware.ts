import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Flutter Web (and other browsers) call `API_BASE_URL` on a different origin than the app
 * (e.g. localhost vs Vercel). Without CORS, `fetch` fails with "Failed to fetch".
 * Native iOS/Android do not send `Origin`; reflecting `*` is fine for those.
 */
function applyApiCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.append("Vary", "Origin");
  } else {
    response.headers.set("Access-Control-Allow-Origin", "*");
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  response.headers.set("Access-Control-Max-Age", "86400");
}

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    applyApiCors(request, res);
    return res;
  }

  const response = NextResponse.next();
  applyApiCors(request, response);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
