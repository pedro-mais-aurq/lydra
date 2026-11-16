"use client";

import { useId, useState, type FormEvent } from "react";
import {
  calculatePurchaseScenario,
  formatScenarioAmount,
  type PurchaseScenarioInput,
  type ScenarioAmount,
} from "@/modules/product/purchase-scenario";
import "./purchase.css";

const emptyScenario: PurchaseScenarioInput = {
  price: "",
  freightMode: "unknown",
  freight: "",
  discount: "",
  ceiling: "",
};

type MoneyFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  error?: string;
};

function MoneyField({ id, label, value, placeholder, onChange, error }: MoneyFieldProps) {
  return (
    <div className="purchase-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        maxLength={22}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + "-error" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="purchase-error" id={id + "-error"}>{error}</p> : null}
    </div>
  );
}

function budgetMessage(balance: number, hasTotal: boolean) {
  if (balance < 0) return hasTotal ? "Acima do teto" : "Subtotal acima do teto";
  if (!hasTotal) return "Frete máximo para caber no teto";
  return "Margem até o teto";
}

export function PurchaseSimulator({ initialValues }: { initialValues?: Partial<PurchaseScenarioInput> }) {
  const id = useId();
  const [input, setInput] = useState<PurchaseScenarioInput>({ ...emptyScenario, ...initialValues });
  const [calculation, setCalculation] = useState<ReturnType<typeof calculatePurchaseScenario> | null>(null);
  const result = calculation?.ok ? calculation.scenario : null;
  const errors = calculation?.ok === false ? calculation.errors : {};

  function update<Key extends keyof PurchaseScenarioInput>(field: Key, value: PurchaseScenarioInput[Key]) {
    setInput((previous) => ({ ...previous, [field]: value }));
    setCalculation(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const calculation = calculatePurchaseScenario(input);
    setCalculation(calculation);

    if (!calculation.ok) {
      const first = Object.keys(calculation.errors)[0];
      document.getElementById(id + "-" + first)?.focus();
    }
  }

  function amountField(field: ScenarioAmount, label: string, placeholder: string) {
    return (
      <MoneyField
        id={id + "-" + field}
        label={label}
        value={input[field]}
        placeholder={placeholder}
        onChange={(value) => update(field, value)}
        error={errors[field]}
      />
    );
  }

  return (
    <div className="purchase-calculator">
      <form className="purchase-form" onSubmit={onSubmit}>
        {amountField("price", "Valor do orçamento (R$)", "Ex.: 4.500,00")}
        <div className="purchase-field">
          <label htmlFor={id + "-freight-mode"}>Frete</label>
          <select
            id={id + "-freight-mode"}
            value={input.freightMode}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "extra" || value === "included" || value === "unknown") {
                update("freightMode", value);
              }
            }}
          >
            <option value="unknown">A confirmar</option>
            <option value="included">Incluído ou sem custo extra</option>
            <option value="extra">Cobrado à parte</option>
          </select>
        </div>
        {input.freightMode === "extra" && amountField("freight", "Frete adicional (R$)", "Ex.: 200,00")}
        {amountField("discount", "Desconto (R$, opcional)", "Ex.: 150,00")}
        {amountField("ceiling", "Teto de compra (R$, opcional)", "Ex.: 4.800,00")}
        <div className="purchase-actions">
          <button className="button button-primary" type="submit">Calcular cenário <span aria-hidden="true">→</span></button>
          <button
            className="button button-outline"
            type="button"
            onClick={() => {
              setInput({ ...emptyScenario, ...initialValues });
              setCalculation(null);
            }}
          >
            {initialValues ? "Restaurar proposta" : "Limpar"}
          </button>
        </div>
      </form>
      <div className="purchase-output" role="status" aria-atomic="true">
        {result ? (
          <>
            <h2>{result.total === null ? "Subtotal sem frete" : "Total estimado"}</h2>
            <p className="purchase-amount">{formatScenarioAmount(result.total ?? result.subtotal)}</p>
            {result.total === null && <p>Confirme o frete para estimar o custo final.</p>}
            {result.remainingBudget !== null && (
              <div className="purchase-balance">
                <span>{budgetMessage(result.remainingBudget, result.total !== null)}</span>
                <strong>{formatScenarioAmount(Math.abs(result.remainingBudget))}</strong>
              </div>
            )}
          </>
        ) : (
          <>
            <h2>Estimativa da compra</h2>
            <p>{calculation ? "Revise os campos destacados para calcular." : "Informe os valores para calcular seu cenário."}</p>
          </>
        )}
      </div>
    </div>
  );
}
