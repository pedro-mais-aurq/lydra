import { resolveUser } from "./core/auth/resolve-user";
import { respondError } from "./core/errors/respond";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the Supabase session cookie fresh on comparison requests so a client's
 * anonymous session survives across page/API navigations. Uses only the
 * public URL and anon key - never a service role key.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0], headers: Parameters<SetAllCookies>[1]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");
      },
    },
  });

  try {
    await resolveUser(supabase);
  } catch (error) {
    return respondError(error, crypto.randomUUID(), "middleware.auth");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|simulador(?:/|$)).*)"],
};
