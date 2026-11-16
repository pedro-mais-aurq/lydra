"use client";

import { useState } from "react";

const steps = [
  {
    label: "Enviar",
    heading: "Reúna as propostas.",
    description: "Envie de 2 a 4 orçamentos em PDF ou imagem para ler as condições de cada proposta.",
    sheetTitle: "Documentos da compra",
    rows: [
      { label: "Proposta A", value: "PDF" },
      { label: "Proposta B", value: "PDF" },
      { label: "Proposta C", value: "Imagem" },
    ],
    note: "A análise começa após o envio dos documentos.",
  },
  {
    label: "Comparar",
    heading: "Veja o que cada valor inclui.",
    description: "Confira o custo conhecido e as condições lado a lado. Uma proposta com frete pendente aparece como parcial.",
    sheetTitle: "Custos conhecidos",
    rows: [
      { label: "Proposta A", value: "R$ 4.700,00" },
      { label: "Proposta B", value: "R$ 4.570,00" },
      { label: "Proposta C · parcial", value: "R$ 4.300,00" },
    ],
    note: "A proposta C ainda precisa confirmar o frete.",
  },
  {
    label: "Conferir",
    heading: "Volte ao trecho original.",
    description: "Consulte o trecho do documento que sustenta um dado e veja o que precisa confirmar com o fornecedor.",
    sheetTitle: "Proposta B",
    evidence: "“Frete incluído no valor total desta proposta.”",
    note: "Página 1 · Condições de entrega",
  },
] as const;

export function ComparisonJourney() {
  const [current, setCurrent] = useState(1);
  const step = steps[current] ?? steps[0];

  return (
    <section className="landing-journey" id="como-funciona" aria-labelledby="journey-title">
      <div className="landing-container landing-chapter landing-journey-layout">
        <div>
          <p className="landing-kicker">Como funciona</p>
          <h2 id="journey-title">Da proposta<br />à <em>decisão.</em></h2>
          <div className="landing-steps" role="group" aria-label="Etapas da comparação">
            {steps.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={index === current}
                aria-controls="journey-example"
                onClick={() => setCurrent(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="landing-step-text" aria-live="polite">
            <h3>{step.heading}</h3>
            <p>{step.description}</p>
          </div>
        </div>
        <div className="landing-stage">
          <div className="landing-stage-frame" aria-hidden="true" />
          <article className="landing-sample" id="journey-example" aria-label="Exemplo ilustrativo da comparação">
            <div className="landing-sample-content" key={step.label}>
              <p className="landing-sample-label">Exemplo ilustrativo</p>
              <h3>{step.sheetTitle}</h3>
              {"rows" in step ? (
                <dl className="landing-sample-values">
                  {step.rows.map((row) => (
                    <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                  ))}
                </dl>
              ) : <blockquote>{step.evidence}</blockquote>}
              <p className="landing-sample-note">{step.note}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
