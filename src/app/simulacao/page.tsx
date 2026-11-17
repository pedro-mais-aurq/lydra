import type { Metadata } from "next";
import Link from "next/link";
import { StructuredComparison } from "@/components/comparison-ui/StructuredComparison";
import { WorkspaceHeader } from "@/components/comparison-ui/WorkspaceHeader";
import { simulationOptions } from "@/modules/product/structured-comparison";

export const metadata: Metadata = { title: "Comparação simulada | Lydra" };

export default function SimulationPage() {
  return (
    <main className="workspace-page">
      <WorkspaceHeader context="Comparação simulada" />
      <div className="workspace-main shell structured-shell">
        <div className="workspace-intro"><div>
          <h1>Comparação simulada</h1>
          <p>Escolha duas ou mais propostas fictícias para recalcular custos, fretes e prazos na hora.</p>
          <Link href="/comparisons/new">Abrir comparação real</Link>
        </div></div>
        <StructuredComparison mode="simulation" options={simulationOptions} />
      </div>
    </main>
  );
}
