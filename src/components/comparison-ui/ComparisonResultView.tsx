import { ComparisonPurchaseSimulator } from "@/components/purchase-simulator/ComparisonPurchaseSimulator";
import type { EvidenceRef, ExtractedQuote, SupplierComparison } from "@/contracts";
import type { ComparisonDetail } from "@/modules/product/api";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export function money(value: number | null, currency: "BRL" | "UNKNOWN") {
  return value === null ? "Não informado" : currency === "BRL" ? currencyFormatter.format(value) : `${numberFormatter.format(value)} (moeda não identificada)`;
}
const completeness = { complete: "Completo", partial: "Parcial", unknown: "Desconhecido" };
const matches = { exact: "exact · correspondência exata", probable: "probable · provável", unmatched: "unmatched · sem correspondência" };
const labels: Record<string, string> = { supplierName: "Fornecedor", displayedTotal: "Total exibido", shipping: "Frete", "shipping.amount": "Valor do frete", paymentTerms: "Pagamento", deliveryDays: "Prazo", warranty: "Garantia", currency: "Moeda" };
function name(supplier: SupplierComparison) { return supplier.supplierName ?? "Fornecedor não informado"; }
export function shippingText(quote: ExtractedQuote | null) {
  if (!quote) return "Não informado";
  switch (quote.shipping.status) {
    case "included": return "Incluído";
    case "not_applicable": return "Não se aplica";
    case "not_informed": return "Não informado";
    case "unclear": return "Incerto";
    case "additional": return quote.shipping.amount === null ? "Adicional · valor não informado" : `Adicional · ${money(quote.shipping.amount, quote.currency)}`;
  }
}
function Evidence({ value }: { value: EvidenceRef }) {
  return <blockquote className="evidence-placeholder"><p>{value.text}</p><footer>{value.page === null ? "Página não informada" : `Página ${value.page}`}</footer></blockquote>;
}
export function ComparisonResultView({ detail, variant = "documents" }: { detail: ComparisonDetail; variant?: "documents" | "simulation" | "manual" }) {
  const result = detail.result;
  if (!result) return <p role="alert">O resultado não está disponível.</p>;
  const supplierFor = (id: string | null) => result.suppliers.find((supplier) => supplier.documentId === id);
  const cheapestComplete = supplierFor(result.highlights.lowestCompleteKnownCostDocumentId);
  const cheapestKnown = supplierFor(result.highlights.lowestKnownCostDocumentId);
  const fastest = supplierFor(result.highlights.fastestKnownDeliveryDocumentId);
  const quoteFor = (id: string) => detail.documents.find((document) => document.id === id)?.extractedData ?? null;
  return <section className="result-preview" aria-labelledby="result-title">
    <div className="result-preview-heading"><div><p className="workspace-kicker">04 / Área de decisão</p><h2 id="result-title">{detail.title}</h2></div><span className="result-state">{{ documents: "Comparação concluída", simulation: "Resultado simulado", manual: "Dados informados manualmente" }[variant]}</span></div>
    <div className="decision-summary">
      <div className="decision-metric"><span className="metric-label">Menor custo completo conhecido</span><strong className="metric-value">{cheapestComplete ? money(cheapestComplete.costAssessment.knownComparableTotal, cheapestComplete.currency) : "Não identificado"}</strong><span className="metric-note">{cheapestComplete ? name(cheapestComplete) : "Nenhum destaque de custo completo disponível"}</span></div>
      <div className="decision-metric"><span className="metric-label">Menor custo conhecido</span><strong className="metric-value">{cheapestKnown ? money(cheapestKnown.costAssessment.knownComparableTotal, cheapestKnown.currency) : "Não identificado"}</strong><span className="metric-note">{cheapestKnown ? `${name(cheapestKnown)} · ${completeness[cheapestKnown.costAssessment.completeness]}` : "Nenhum destaque de custo disponível"}</span></div>
      <div className="decision-metric"><span className="metric-label">Menor prazo informado</span><strong className="metric-value">{fastest?.deliveryDays == null ? "Não informado" : `${fastest.deliveryDays} dias`}</strong><span className="metric-note">{fastest ? name(fastest) : "Nenhum destaque de prazo disponível"}</span></div>
    </div>
    <p className="result-summary">{result.summary}</p>
    {result.highlights.warnings.length > 0 ? <div className="warning-panel" role="status"><h3>O que ainda precisa de atenção</h3><ul className="warning-list">{result.highlights.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
    <section className="data-section" aria-labelledby="suppliers-title">
      <div className="data-section-heading"><h3 id="suppliers-title">Propostas lado a lado</h3></div>
      <div className="table-wrap" role="region" aria-label="Tabela de fornecedores" tabIndex={0}><table className="supplier-table">
        <thead><tr>{["Fornecedor", "Total exibido", "Custo comparável", "Frete", "Prazo", "Pagamento", "Garantia", "Completude"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.suppliers.map((supplier) => {
          const quote = quoteFor(supplier.documentId);
          return <tr key={supplier.documentId}>
            <th scope="row">{name(supplier)}</th><td>{money(supplier.costAssessment.displayedTotal, supplier.currency)}</td><td>{money(supplier.costAssessment.knownComparableTotal, supplier.currency)}</td><td>{shippingText(quote)}</td><td>{supplier.deliveryDays === null ? "Não informado" : `${supplier.deliveryDays} dias`}</td><td>{quote?.paymentTerms ?? "Não informado"}</td><td>{quote?.warranty ?? "Não informado"}</td>
            <td><span className={`state-chip ${supplier.costAssessment.completeness}`}>{completeness[supplier.costAssessment.completeness]}</span>{supplier.costAssessment.reasons.length > 0 ? <ul>{supplier.costAssessment.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
    <section className="data-section" aria-labelledby="items-title">
      <div className="data-section-heading"><h3 id="items-title">Itens comparados</h3></div>
      {result.normalizedItems.length === 0 ? <p>Nenhum item disponível no resultado.</p> : result.normalizedItems.map((group, index) => <div className="normalized-group" key={index}>
        <h4><span className={`state-chip ${group.match === "unmatched" ? "partial" : ""}`}>{matches[group.match]}</span></h4>
        <div className="table-wrap" role="region" aria-label={`Grupo de itens ${index + 1}`} tabIndex={0}><table className="supplier-table"><thead><tr>{["Fornecedor", "Descrição", "Quantidade", "Unidade", "Preço unitário", "Preço total"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{group.entries.map((entry) => {
          const supplier = supplierFor(entry.documentId);
          return <tr key={`${entry.documentId}-${entry.itemIndex}`}><th scope="row">{supplier ? name(supplier) : "Fornecedor não informado"}</th><td>{entry.item.rawDescription}<details><summary>Ver evidência do item</summary><Evidence value={entry.item.evidence} /></details></td><td>{entry.item.quantity ?? "Não informado"}</td><td>{entry.item.unit ?? "Não informado"}</td><td>{money(entry.item.unitPrice, supplier?.currency ?? "UNKNOWN")}</td><td>{money(entry.item.totalPrice, supplier?.currency ?? "UNKNOWN")}</td></tr>;
        })}</tbody></table></div>
      </div>)}
    </section>
    <div className="missing-evidence-grid">
      <section className="info-panel" aria-labelledby="missing-title"><h3 id="missing-title">Informações que ainda precisam ser confirmadas</h3>{result.suppliers.map((supplier) => <div key={supplier.documentId}><h4>{name(supplier)}</h4>{supplier.missingFields.length ? <ul className="missing-list">{supplier.missingFields.map((field, index) => <li key={index}>{labels[field] ?? field}</li>)}</ul> : <p>Nenhum campo ausente registrado.</p>}</div>)}</section>
      <section className="info-panel" aria-labelledby="evidence-title"><h3 id="evidence-title">Evidências</h3>{result.suppliers.map((supplier) => {
        const quote = quoteFor(supplier.documentId);
        return <div key={supplier.documentId}><h4>{name(supplier)}</h4>{quote ? Object.entries(quote.evidence).map(([field, evidence]) => evidence ? <details key={field}><summary>{labels[field] ?? field}</summary><Evidence value={evidence} /></details> : null) : <p>Evidências indisponíveis.</p>}{quote && quote.observations.length > 0 ? <><h4>Observações do documento</h4><ul>{quote.observations.map((observation, index) => <li key={index}>{observation}</li>)}</ul></> : null}</div>;
      })}</section>
    </div>
    <ComparisonPurchaseSimulator detail={detail} />
  </section>;
}
