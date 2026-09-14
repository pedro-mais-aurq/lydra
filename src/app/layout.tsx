import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Lydra — Decida antes que o dinheiro vá.",
  description:
    "Compare propostas, evidencie incertezas e decida antes do compromisso financeiro.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
