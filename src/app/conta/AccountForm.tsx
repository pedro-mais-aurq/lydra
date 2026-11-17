"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/core/supabase/browser";

const genericError = "Confira seus dados e tente de novo.";

export function AccountForm({
  configured, email, callbackFailed,
}: { configured: boolean; email: string | null; callbackFailed: boolean }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(callbackFailed ? "O retorno do login ou da confirmação falhou. Tente de novo pelo navegador em que iniciou o processo." : "");

  const callback = () => new URL("/auth/retorno", window.location.origin).toString();

  async function google() {
    if (!configured || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const client = createSupabaseBrowserClient();
      const result = await client.auth.signInWithOAuth({
        provider: "google", options: { redirectTo: callback(), skipBrowserRedirect: true },
      });
      if (result.error || !result.data.url) throw new Error();
      window.location.assign(result.data.url);
    } catch {
      setStatus("O login pelo Google está indisponível. Tente novamente ou use seu e-mail.");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (creating && password !== form.get("confirmation")) {
      setStatus("As senhas precisam ser iguais.");
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const auth = createSupabaseBrowserClient().auth;
      const result = creating
        ? await auth.signUp({ email, password, options: { emailRedirectTo: callback() } })
        : await auth.signInWithPassword({ email, password });
      if (result.error) {
        setStatus(result.error.code === "email_not_confirmed" ? "Confirme seu e-mail pelo link recebido." : genericError);
      } else if (result.data.session) {
        window.location.assign("/conta");
      } else if (creating) {
        setStatus("Confira sua caixa de entrada para confirmar o cadastro.");
      } else {
        setStatus(genericError);
      }
    } catch {
      setStatus("O serviço de autenticação está indisponível. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.assign("/");
    } catch {
      setStatus("Não foi possível encerrar a sessão.");
      setBusy(false);
    }
  }

  if (email) return (
    <div className="workspace-card account-card">
      <h2>Sessão aberta</h2>
      <p className="account-email">{email}</p>
      <div className="account-actions">
        <Link className="button button-primary" href="/comparisons/new">Comparação real</Link>
        <button type="button" className="button button-outline" onClick={signOut} disabled={busy}>Sair</button>
      </div>
      <p role="status">{status}</p>
    </div>
  );

  return (
    <div className="workspace-card account-card">
      <div className="account-tabs" role="group" aria-label="Acesso à conta">
        <button type="button" aria-pressed={!creating} onClick={() => { setStatus(""); setCreating(false); }}>Entrar</button>
        <button type="button" aria-pressed={creating} onClick={() => { setStatus(""); setCreating(true); }}>Criar conta</button>
      </div>
      {!configured && <p className="account-service">A autenticação aguarda a conexão do Supabase.</p>}
      <button type="button" className="button button-outline account-google" disabled={!configured || busy} onClick={google}>
        Continuar com Google
      </button>
      <form className="account-form" method="post" onSubmit={submit}>
        <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={!configured || busy} /></label>
        <label>Senha<input name="password" type="password" autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 8 : undefined} maxLength={128} required disabled={!configured || busy} /></label>
        {creating && <label>Repita a senha<input name="confirmation" type="password" autoComplete="new-password" maxLength={128} required disabled={!configured || busy} /></label>}
        <button type="submit" className="button button-primary" disabled={!configured || busy}>
          {busy ? "Aguarde…" : creating ? "Criar minha conta" : "Entrar com e-mail"}
        </button>
      </form>
      <p role="status">{status}</p>
    </div>
  );
}
