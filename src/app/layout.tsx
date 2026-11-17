import type { ReactNode } from "react";
import { getSupabasePublicConfig } from "@/core/supabase/public-config";
import "./globals.css";

export const metadata = {
  title: "Lydra — Decida antes que o dinheiro vá.",
  description:
    "Compare propostas, evidencie incertezas e decida antes do compromisso financeiro.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <script id="lydra-supabase-config" type="application/json" dangerouslySetInnerHTML={{
          __html: JSON.stringify(getSupabasePublicConfig()).replace(/</g, "\\u003c"),
        }} />
        {children}
      </body>
    </html>
  );
}
