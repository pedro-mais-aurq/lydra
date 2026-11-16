"use client";

import { useId, useState } from "react";
import type { ComparisonDetail } from "@/modules/product/api";
import { scenarioInputFromQuote, type PurchaseScenarioInput } from "@/modules/product/purchase-scenario";
import { PurchaseSimulator } from "./PurchaseSimulator";

export function ComparisonPurchaseSimulator({ detail }: { detail: ComparisonDetail }) {
  const [selection, setSelection] = useState("");
  const id = useId();
  const options = (detail.result?.suppliers ?? []).flatMap((supplier, index) => {
    const price = scenarioInputFromQuote(supplier.costAssessment.displayedTotal);
    if (supplier.currency !== "BRL" || price === "") return [];

    const document = detail.documents.find((item) => item.id === supplier.documentId);
    const shipping = document?.extractedData?.shipping;
    const freight = shipping?.status === "additional" ? scenarioInputFromQuote(shipping.amount) : "";
    let freightMode: PurchaseScenarioInput["freightMode"] = "unknown";
    if (shipping?.status === "included" || shipping?.status === "not_applicable") freightMode = "included";
    if (freight !== "") freightMode = "extra";

    const reference = [supplier.supplierName?.trim(), document?.fileName].filter(Boolean).join(" · ");
    const label = reference ? "Proposta " + (index + 1) + " · " + reference : "Proposta " + (index + 1);

    return [{
      id: supplier.documentId,
      label,
      input: { price, freight, freightMode },
    }];
  });
  const selected = options.find((option) => option.id === selection);

  return (
    <details className="comparison-simulation">
      <summary>Simular custo da compra</summary>
      <p>Teste outro valor de frete ou desconto e veja quanto sobra do teto. O cenário fica nesta tela.</p>
      {options.length > 0 && (
        <div className="purchase-field purchase-proposal">
          <label htmlFor={id}>Usar valores de</label>
          <select id={id} value={selected?.id ?? ""} onChange={(event) => setSelection(event.target.value)}>
            <option value="">Preencher manualmente</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      )}
      <PurchaseSimulator key={selected?.id ?? "manual"} initialValues={selected?.input} />
    </details>
  );
}
