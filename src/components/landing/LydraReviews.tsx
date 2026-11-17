"use client";

import { useEffect, useState, type FormEvent } from "react";

type Reviews = {
  count: number;
  average: number | null;
  notes: Array<{ score: number; note: string; date: string }>;
  canReview: boolean;
};

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function LydraReviews() {
  const [reviews, setReviews] = useState<Reviews | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(signal?: AbortSignal) {
    try {
      const result = await fetch("/api/avaliacoes", { cache: "no-store", signal });
      if (!result.ok) throw new Error();
      setReviews(await result.json() as Reviews);
    } catch {
      if (!signal?.aborted) setNotice("As avaliações estão indisponíveis agora.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/avaliacoes", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: Number(data.get("score")), note: data.get("note") || "" }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const error = result && typeof result === "object" && "error" in result ? result.error : null;
        setNotice(typeof error === "string" ? error : "Não foi possível salvar.");
        return;
      }
      form.reset();
      setNotice("Sua avaliação foi salva.");
      await refresh();
    } catch {
      setNotice("Não foi possível salvar a avaliação agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing-reviews">
      <h3>Avaliações da Lydra</h3>
      {loading && <p>Carregando avaliações…</p>}
      {reviews && <p>{reviews.average === null ? "Ainda não há avaliações." : (
        <><strong>{number.format(reviews.average)} de 5</strong> · {reviews.count} {reviews.count === 1 ? "avaliação" : "avaliações"}</>
      )}</p>}
      {reviews && reviews.notes.length > 0 && (
        <ul className="review-notes">
          {reviews.notes.map(({ score, note, date }, index) => (
            <li key={date + index}><strong>{score} de 5</strong><p>{note}</p></li>
          ))}
        </ul>
      )}
      {reviews?.canReview && (
        <form className="review-form" method="post" onSubmit={save}>
          <label>
            Sua nota
            <select name="score" defaultValue="" required disabled={busy}>
              <option value="" disabled>Selecione de 1 a 5</option>
              {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} de 5</option>)}
            </select>
          </label>
          <label>
            Comentário (opcional)
            <textarea name="note" rows={3} maxLength={500} disabled={busy} aria-describedby="review-visibility" />
          </label>
          <p id="review-visibility">A nota e o comentário ficam visíveis para quem tem acesso ao site.</p>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar avaliação"}</button>
        </form>
      )}
      <p className="review-notice" role="status">{notice}</p>
    </div>
  );
}
