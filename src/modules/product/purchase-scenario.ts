export type PurchaseScenarioInput = {
  price: string;
  freightMode: "unknown" | "included" | "extra";
  freight: string;
  discount: string;
  ceiling: string;
};

export type ScenarioAmount = Exclude<keyof PurchaseScenarioInput, "freightMode">;
type ScenarioErrors = Partial<Record<ScenarioAmount, string>>;
type PurchaseScenario = {
  subtotal: number;
  total: number | null;
  remainingBudget: number | null;
};

type ScenarioCalculation =
  | { ok: true; scenario: PurchaseScenario }
  | { ok: false; errors: ScenarioErrors };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quoteAmount = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatScenarioAmount(cents: number): string {
  return brl.format(cents / 100);
}

export function scenarioInputFromQuote(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0 || value >= 1e12
    || Number(value.toFixed(2)) !== value) return "";
  return quoteAmount.format(value);
}

function parseAmount(raw: string): number | null {
  const value = raw.trim().replace(/^R\$\s*/i, "");
  const match =
    /^(\d{1,12}|\d{1,3}(?:\.\d{3}){1,3})(?:,(\d{1,2}))?$/.exec(value)
    ?? /^(\d{1,12})\.(\d{1,2})$/.exec(value);
  if (!match || !match[1]) return null;

  const reais = Number(match[1].replaceAll(".", ""));
  return reais * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function calculatePurchaseScenario(input: PurchaseScenarioInput): ScenarioCalculation {
  const price = parseAmount(input.price);
  const discount = input.discount.trim() ? parseAmount(input.discount) : 0;
  const ceiling = parseAmount(input.ceiling);
  const freight = input.freightMode === "extra" ? parseAmount(input.freight) : 0;
  const errors: ScenarioErrors = {};

  if (price === null) errors.price = "Informe um valor válido para o orçamento, como 4.500,00.";
  if (discount === null) errors.discount = "Informe um desconto válido, como 150,00.";
  if (discount !== null && price !== null && discount > price) {
    errors.discount = "O desconto precisa ser igual ou menor que o valor do orçamento.";
  }
  if (freight === null) errors.freight = "Informe o frete adicional ou selecione A confirmar.";
  if (ceiling === null && input.ceiling.trim()) {
    errors.ceiling = "Informe um teto válido, como 4.800,00.";
  }

  if (price === null || discount === null || freight === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const subtotal = price - discount;
  const total = input.freightMode === "unknown" ? null : subtotal + freight;
  return {
    ok: true,
    scenario: {
      subtotal,
      total,
      remainingBudget: ceiling === null ? null : ceiling - (total ?? subtotal),
    },
  };
}
