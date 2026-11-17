import Link from "next/link";
import { ComparisonWorkspace } from "@/components/comparison-ui/ComparisonWorkspace";
import { WorkspaceHeader } from "@/components/comparison-ui/WorkspaceHeader";
import { getSupabasePublicConfig } from "@/core/supabase/public-config";
import { readExtractionConfig } from "@/modules/extraction/providers/config";

import "@/components/comparison-ui/structured.css";

export const dynamic = "force-dynamic";

export default function NewComparisonPage() {
  let ready = false;
  if (getSupabasePublicConfig() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      readExtractionConfig(process.env);
      ready = true;
    } catch {
      // Keep the manual entry point available when the extraction provider needs configuration.
    }
  }
  if (ready) return <ComparisonWorkspace />;

  return (
    <main className="workspace-page">
      <WorkspaceHeader context="Comparação real" />
      <div className="workspace-main shell structured-shell">
        <div className="workspace-intro"><div>
          <h1>Comparação real</h1>
          <p>Compare propostas reais digitando os valores. O resultado usa as regras do comparador da Lydra.</p>
        </div></div>
        <section className="workspace-card comparison-availability">
          <h2>Envio de documentos</h2>
          <p>A leitura de PDFs e imagens fica disponível quando o banco e o serviço de extração estiverem conectados.</p>
          <Link className="button button-primary" href="/comparisons/manual">Digitar valores das propostas</Link>
        </section>
        <Link href="/simulacao">Abrir comparação simulada</Link>
      </div>
    </main>
  );
}
