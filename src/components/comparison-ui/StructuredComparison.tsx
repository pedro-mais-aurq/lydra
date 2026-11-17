"use client";

import { useRef, useState, type FormEvent } from "react";
import { detailSchema, type ComparisonDetail } from "@/modules/product/api";
import type { simulationOptions } from "@/modules/product/structured-comparison";
import { money, ComparisonResultView } from "./ComparisonResultView";
import "./structured.css";

type ManualRow = { supplier: string; amount: string; mode: "unknown" | "included" | "extra"; shipping: string; days: string };
const emptyRow: ManualRow = { supplier: "", amount: "", mode: "unknown", shipping: "", days: "" };

type StructuredComparisonProps = { mode: "simulation"; options: typeof simulationOptions } | { mode: "manual" };

export function StructuredComparison(props: StructuredComparisonProps) {
  const [selected, setSelected] = useState<string[]>(props.mode === "simulation" ? props.options.map(({ id }) => id) : []);
  const [rows, setRows] = useState<ManualRow[]>([{ ...emptyRow }, { ...emptyRow }]);
  const [result, setResult] = useState<ComparisonDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  function update(index: number, change: Partial<ManualRow>) {
    setRows((previous) => previous.map((row, position) => position === index ? { ...row, ...change } : row));
    setResult(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const simulated = props.mode === "simulation";
      const response = await fetch(simulated ? "/api/simulacoes" : "/api/comparar-valores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simulated ? selected : rows),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const detail = data && typeof data === "object" && "error" in data ? data.error : null;
        throw new Error(typeof detail === "string" ? detail : "Não foi possível comparar as propostas.");
      }
      const parsed = detailSchema.safeParse(data);
      if (!parsed.success) throw new Error("A resposta da comparação não pôde ser validada.");
      setResult(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível comparar as propostas.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <form className="workspace-card structured-form" method="post" onSubmit={submit}>
        {props.mode === "simulation" ? (
          <fieldset disabled={busy}>
            <legend>Escolha as propostas</legend>
            <div className="simulation-options">
              {props.options.map((option) => (
                <label key={option.id}>
                  <input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => {
                    setSelected(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id));
                    setResult(null);
                  }} />
                  <span>
                    <strong>{option.name}</strong>
                    <span>{money(option.total, "BRL")} · {
                      option.shipping.status === "included" ? "frete incluído"
                        : option.shipping.status === "additional" ? "frete adicional" : "frete a confirmar"
                    }</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="manual-rows">
            {rows.map((row, i) => (
              <fieldset key={i} disabled={busy}>
                <legend>Proposta {i + 1}</legend>
                <label>Fornecedor<input value={row.supplier} maxLength={90} onChange={(e) => update(i, { supplier: e.target.value })} required /></label>
                <label>Total (R$)<input inputMode="decimal" placeholder="Ex. 4.500,00" value={row.amount} maxLength={24} onChange={(e) => update(i, { amount: e.target.value })} required /></label>
                <label>Frete<select value={row.mode} onChange={(e) => update(i, { mode: e.target.value as ManualRow["mode"] })}>
                  <option value="unknown">A confirmar</option><option value="included">Incluído ou sem custo adicional</option><option value="extra">Cobrado à parte</option>
                </select></label>
                {row.mode === "extra" && <label>Frete adicional (R$)<input inputMode="decimal" maxLength={24} value={row.shipping} onChange={(e) => update(i, { shipping: e.target.value })} required /></label>}
                <label>Prazo em dias (opcional)<input inputMode="numeric" pattern="[0-9]{0,4}" maxLength={4} value={row.days} onChange={(e) => update(i, { days: e.target.value })} /></label>
                {rows.length > 2 && <button className="button button-outline" type="button" onClick={() => { setRows(rows.filter((_, position) => position !== i)); setResult(null); }}>Remover proposta {i + 1}</button>}
              </fieldset>
            ))}
          </div>
        )}
        <div className="structured-actions">
          <button className="button button-primary" type="submit" disabled={busy || (props.mode === "simulation" && selected.length < 2)}>
            {busy ? "Calculando…" : props.mode === "simulation" ? "Simular comparação" : "Comparar propostas"}
          </button>
          {props.mode === "manual" && rows.length < 4 && (
            <button className="button button-outline" type="button" disabled={busy} onClick={() => { setRows([...rows, { ...emptyRow }]); setResult(null); }}>
              Adicionar proposta
            </button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
      <div role="status" className="structured-announcement">{result && "Comparação calculada."}</div>
      {result && <ComparisonResultView key={result.id} detail={result} variant={props.mode} />}
    </>
  );
}
