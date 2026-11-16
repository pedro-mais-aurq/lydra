import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceHeader } from "@/components/comparison-ui/WorkspaceHeader";
import { PurchaseSimulator } from "@/components/purchase-simulator/PurchaseSimulator";

export const metadata: Metadata = {
  title: "Simulador de compra | Lydra",
  description: "Calcule o efeito de frete e desconto e confira se a compra cabe no seu orçamento.",
};

export default function PurchaseSimulatorPage() {
  return (
    <>
      <WorkspaceHeader context="Simulador" />
      <main className="workspace-page purchase-page">
        <div className="workspace-main shell purchase-shell">
          <div className="purchase-heading">
            <h1>Simulador de compra</h1>
            <p>Experimente condições de frete e desconto e veja se a compra cabe no seu teto.</p>
          </div>
          <PurchaseSimulator />
          <div className="purchase-page-links">
            <p>Os cálculos rodam no seu navegador.</p>
            <Link href="/comparisons/new" prefetch={false}>Comparar propostas em PDF ou imagem <span className="action-arrow" aria-hidden="true" /></Link>
          </div>
        </div>
      </main>
    </>
  );
}
