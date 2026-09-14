"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionGate } from "./SessionGate";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { ComparisonResultView } from "./ComparisonResultView";
import { errorMessage, type ComparisonDetail, type ProductError } from "@/modules/product/api";
import { pendingProcess, processFailure, retryFor, startProcessing, watchComparison } from "@/modules/product/processing";

export function ComparisonDetailPage({ id, processingRoute = false }: { id: string; processingRoute?: boolean }) {
  return <main className="workspace-page"><WorkspaceHeader context={processingRoute ? "Análise das propostas" : "Sua comparação"} /><SessionGate><ComparisonContent id={id} processingRoute={processingRoute} /></SessionGate></main>;
}
function ComparisonContent({ id, processingRoute }: { id: string; processingRoute: boolean }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ComparisonDetail | null>(null);
  const [error, setError] = useState<ProductError | null>(null);
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);
  const [starting, setStarting] = useState(Boolean(pendingProcess(id)));
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setError(null); setPaused(false);
    return watchComparison(id, {
      onData: (data) => { setDetail(data); setStarting(Boolean(pendingProcess(id))); setError(processFailure(id) ?? null); },
      onError: setError,
      onPaused: () => setPaused(true),
    });
  }, [id, revision]);
  useEffect(() => {
    if (processingRoute && detail?.status === "completed") router.replace(`/comparisons/${id}`);
  }, [processingRoute, detail?.status, router, id]);
  const start = async () => {
    if (!detail || starting || pendingProcess(id)) return;
    if (detail.status === "failed" && !retryFor(detail)?.retryable) return;
    if (detail.status !== "draft" && detail.status !== "failed") return;
    setStarting(true); setError(null);
    const task = startProcessing(id);
    setRevision((value) => value + 1);
    await task;
    if (mounted.current) { setStarting(false); setRevision((value) => value + 1); }
  };
  const refresh = () => setRevision((value) => value + 1);
  if (!detail) return <div className="workspace-main shell"><section className="workspace-card" aria-live="polite"><h1>{error ? "Comparação indisponível" : "Consultando comparação"}</h1>{error ? <><p role="alert">{error.message}</p><button className="button button-outline" onClick={refresh}>Consultar novamente</button></> : <p>Buscando o estado salvo das propostas.</p>}</section></div>;
  if (detail.status === "completed") return <div className="workspace-main shell"><ComparisonResultView detail={detail} /><Link className="button button-primary" href="/comparisons/new">Nova comparação</Link></div>;
  const retry = retryFor(detail);
  const heading = { draft: "Documentos recebidos", processing: "Analisando propostas", failed: "A análise não foi concluída" }[detail.status];
  return <div className="workspace-main shell">
    <div className="workspace-intro"><div><p className="workspace-kicker">03 / Leitura</p><h1>{heading}</h1><p>{detail.title}</p></div><span className="result-state">{detail.status === "draft" ? "Rascunho" : detail.status === "failed" ? "Falha" : "Em processamento"}</span></div>
    <div className="workspace-grid"><section className="workspace-card" aria-labelledby="received-title"><h2 id="received-title">Documentos desta comparação</h2><ul className="document-list">{detail.documents.map((document) => <li className="document-card" key={document.id}><span className="document-card-name">{document.fileName}</span><span className="document-status">{{ uploaded: "Recebido", processing: "Em leitura", completed: "Extração concluída", failed: "Falha na leitura" }[document.status]}</span></li>)}</ul>
      {detail.status === "draft" ? <><p>Confira os documentos recebidos antes de iniciar. A análise usará todos os arquivos listados acima.</p><button className="button button-primary" disabled={starting || detail.documents.length < 2 || detail.documents.length > 4} onClick={() => { void start(); }}>{starting ? "Solicitando análise" : "Analisar documentos recebidos"}</button>{detail.documents.length < 2 ? <p>São necessários pelo menos 2 documentos. Prepare uma nova comparação com todos os arquivos desejados.</p> : null}</> : null}
      {detail.status === "failed" ? <><p role="alert">{errorMessage(detail.errorCode ?? "INTERNAL_ERROR")}</p>{retry?.retryable ? <button className="button button-primary" disabled={starting} onClick={() => { void start(); }}>{starting ? "Solicitando análise" : "Tentar análise novamente"}</button> : <p>{retry ? "Esta falha não permite nova tentativa com os mesmos documentos." : "A permissão de nova tentativa não está disponível nesta aba. O estado salvo informa a falha, mas não se ela é temporária."}</p>}</> : null}
      <p><Link href="/comparisons/new">Preparar uma nova comparação</Link></p>
    </section><section className="workspace-card processing-card" aria-live="polite"><h2>{heading}</h2>
      <p>{detail.status === "processing" ? "O estado abaixo acompanha as confirmações recebidas da análise." : detail.status === "failed" ? "Nenhum resultado foi apresentado como concluído." : starting ? "A solicitação foi enviada. Aguardando confirmação da análise." : "A análise ainda não foi iniciada."}</p>
      <div className="process-rail">{detail.documents.map((document) => <div key={document.id} className={`process-step ${document.status === "processing" || document.status === "completed" ? "active" : ""}`}>{document.fileName}: {{ uploaded: "aguardando leitura", processing: "leitura em andamento", completed: "extração validada", failed: "leitura interrompida" }[document.status]}</div>)}</div>
      {paused ? <p>A atualização automática foi pausada. O último estado recebido continua em processamento.</p> : null}
    </section></div>
    {error ? <div className="warning-panel" role="alert"><p>{error.message}</p>{error.requestId ? <small>Referência: {error.requestId}</small> : null}</div> : null}
    {paused || error || detail.status === "failed" ? <button className="button button-outline" onClick={refresh}>Consultar estado novamente</button> : null}
  </div>;
}
