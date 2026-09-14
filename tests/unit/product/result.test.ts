import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComparisonResultView, money, shippingText } from "@/components/comparison-ui/ComparisonResultView";
import { completedDetail } from "../../fixtures/product";
import { quote, item, ids } from "../../fixtures/comparison";
describe("product result presentation", () => {
  it("renders canonical A/B/C without promoting C to complete", () => {
    const detail = completedDetail(); const html = renderToStaticMarkup(createElement(ComparisonResultView, { detail }));
    const metrics = html.split('class="decision-metric"');
    expect(metrics[1]).toContain("4.570,00"); expect(metrics[2]).toContain("4.300,00"); expect(metrics[2]).toContain("Parcial"); expect(html).toContain("4.700,00"); expect(html).toContain("Não informado"); expect(html).toContain(detail.result!.summary);
    expect(html).not.toContain("placeholder de integração"); expect(html).not.toContain("melhor fornecedor");
  });
  it("renders null as absence and preserves UNKNOWN/included/additional semantics", () => {
    expect(money(null, "BRL")).toBe("Não informado"); expect(money(100, "UNKNOWN")).not.toContain("R$");
    expect(shippingText(quote({ shipping: { status: "not_informed", amount: null } }))).toBe("Não informado");
    expect(shippingText(quote({ shipping: { status: "included", amount: null } }))).toBe("Incluído");
    expect(shippingText(quote({ shipping: { status: "additional", amount: null } }))).toBe("Adicional · valor não informado");
    const detail = completedDetail(); const supplier = detail.result!.suppliers[0]!;
    supplier.supplierName = null; supplier.deliveryDays = null; supplier.costAssessment = { displayedTotal: null, knownComparableTotal: null, completeness: "unknown", reasons: [] };
    const html = renderToStaticMarkup(createElement(ComparisonResultView, { detail })); expect(html).toContain("Fornecedor não informado"); expect(html).not.toMatch(/R\$\s*(?:&nbsp;)?0,00/);
  });
  it("preserves normalized groups and their exact/probable/unmatched labels", () => {
    const detail = completedDetail();
    detail.result!.normalizedItems = [
      { match: "exact", entries: [{ documentId: ids[0], itemIndex: 0, item: item("Porta") }, { documentId: ids[1], itemIndex: 0, item: item("Porta") }] },
      { match: "probable", entries: [{ documentId: ids[0], itemIndex: 1, item: item("Janela", null) }, { documentId: ids[1], itemIndex: 1, item: item("Janela", null) }] },
      { match: "unmatched", entries: [{ documentId: ids[2], itemIndex: 0, item: item("Tinta") }] },
    ];
    const before = structuredClone(detail.result);
    const html = renderToStaticMarkup(createElement(ComparisonResultView, { detail }));
    for (const label of ["exact · correspondência exata", "probable · provável", "unmatched · sem correspondência"]) expect(html).toContain(label);
    expect(detail.result).toEqual(before); expect(html).toContain("Ver evidência do item");
  });
  it("escapes hostile strings and displays canonical missing fields/evidence", () => {
    const detail = completedDetail(); detail.result!.summary = '<script>alert("x")</script>'; detail.result!.suppliers[0]!.supplierName = '<img src=x onerror=alert(1)>';
    const html = renderToStaticMarkup(createElement(ComparisonResultView, { detail })); expect(html).not.toContain("<script>"); expect(html).not.toContain("<img src=x"); expect(html).toContain("&lt;script&gt;"); expect(html).toContain("Evidências"); expect(html).toContain("Prazo");
  });
});
