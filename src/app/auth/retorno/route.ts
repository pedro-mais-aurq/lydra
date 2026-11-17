import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { getSupabasePublicConfig } from "@/core/supabase/public-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/conta", url.origin);
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  try {
    if (getSupabasePublicConfig() && (code || (hash && (type === "email" || type === "signup")))) {
      const client = await createSupabaseServerClient();
      const result = code
        ? await client.auth.exchangeCodeForSession(code)
        : await client.auth.verifyOtp({ token_hash: hash!, type: type === "signup" ? "signup" : "email" });
      if (!result.error && result.data.session) {
        return NextResponse.redirect(destination);
      }
    }
  } catch {
    // Provider details can contain OAuth tokens and remain outside application logs.
  }
  destination.searchParams.set("retorno", "falhou");
  return NextResponse.redirect(destination);
}
