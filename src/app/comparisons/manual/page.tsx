import type { Metadata } from "next";
import Link from "next/link";
import { StructuredComparison } from "@/components/comparison-ui/StructuredComparison";
import { WorkspaceHeader } from "@/components/comparison-ui/WorkspaceHeader";

export const metadata: Metadata = { title: "Comparação de valores reais | Lydra" };

export default function ManualComparisonPage() {
  return (
    <main className="workspace-page">
      <WorkspaceHeader context="Comparação real" />
      <div className="workspace-main shell structured-shell">
        <div className="workspace-intro"><div>
          <h1>Compare valores reais.</h1>
          <p>Preencha os dados de 2 a 4 propostas. A Lydra calcula custos, identifica valores parciais e compara prazos.</p>
          <Link href="/comparisons/new">Ir ao envio de documentos</Link>
        </div></div>
        <StructuredComparison mode="manual" />
      </div>
    </main>
  );
}
