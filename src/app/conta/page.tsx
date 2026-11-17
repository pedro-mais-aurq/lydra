import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceHeader } from "@/components/comparison-ui/WorkspaceHeader";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { getSupabasePublicConfig } from "@/core/supabase/public-config";
import { AccountForm } from "./AccountForm";
import "./account.css";

export const metadata: Metadata = { title: "Minha conta | Lydra" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ retorno?: string }> }) {
  const configured = Boolean(getSupabasePublicConfig());
  let email: string | null = null;
  if (configured) {
    try {
      const { data } = await (await createSupabaseServerClient()).auth.getUser();
      if (data.user && !data.user.is_anonymous) email = data.user.email ?? null;
    } catch {
      // The form can still retry when the authentication service recovers.
    }
  }
  const { retorno } = await searchParams;

  return (
    <main className="workspace-page">
      <WorkspaceHeader context="Minha conta" />
      <section className="workspace-main shell account-layout" aria-labelledby="account-title">
        <div>
          <h1 id="account-title">Sua conta na Lydra.</h1>
          <p>Entre com o Google ou use seu e-mail para acessar sua conta.</p>
          <Link href="/simulacao">Experimentar a comparação simulada</Link>
        </div>
        <AccountForm configured={configured} email={email} callbackFailed={retorno === "falhou"} />
      </section>
    </main>
  );
}
