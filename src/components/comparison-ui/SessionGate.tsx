"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ensureAnonymousSession } from "@/modules/product/auth";

export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    ensureAnonymousSession().then(() => { if (active) setState("ready"); }, () => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt]);
  if (state === "ready") return children;
  return <div className="workspace-main shell">
    <section className="workspace-card" aria-live="polite">
      <h1>{state === "loading" ? "Preparando sua sessão" : "Não foi possível iniciar sua sessão"}</h1>
      {state === "error" ? <><p role="alert">Confira sua conexão e tente novamente. Nenhum documento foi enviado.</p><button className="button button-primary" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }}>Tentar iniciar sessão</button></> : <p>Aguarde para continuar com seus documentos.</p>}
    </section>
  </div>;
}
