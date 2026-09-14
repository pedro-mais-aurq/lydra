"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentDropzone, type SelectedDocument } from "./DocumentDropzone";
import { SessionGate } from "./SessionGate";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { selectFiles, validSubmission, createAndUpload } from "@/modules/product/uploads";
import { ensureAnonymousSession } from "@/modules/product/auth";
import { asProductError } from "@/modules/product/api";
import { startProcessing } from "@/modules/product/processing";

export function ComparisonWorkspace() {
  return <main className="workspace-page"><WorkspaceHeader context="Nova comparação" /><SessionGate><NewComparison /></SessionGate></main>;
}
function NewComparison() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [activity, setActivity] = useState("Aguardando documentos");
  const submitting = useRef(false);
  const addFiles = (incoming: File[]) => {
    if (attempted) return;
    const selected = selectFiles(documents.map((document) => document.file), incoming);
    setError(selected.error);
    setDocuments(selected.files.map((file, index) => documents[index] ?? { id: crypto.randomUUID(), file, name: file.name, size: file.size, type: file.type }));
  };
  const analyze = async () => {
    if (submitting.current || attempted) return;
    const files = documents.map((document) => document.file);
    if (!validSubmission(title, files)) { setError("Informe um título e selecione de 2 a 4 documentos."); return; }
    submitting.current = true; setAttempted(true); setBusy(true); setError(null); setActivity("Criando comparação");
    let uploadingIndex: number | null = null;
    try {
      const created = await createAndUpload({ title, files, ensureSession: ensureAnonymousSession,
        onCreated: (comparison) => setComparisonId(comparison.id),
        onUploading: (index) => {
          uploadingIndex = index; setActivity(`Enviando ${files[index]?.name ?? "documento"}`);
          setDocuments((current) => current.map((document, i) => i === index ? { ...document, uploadStatus: "Enviando" } : document));
        },
        onUploaded: (index) => setDocuments((current) => current.map((document, i) => i === index ? { ...document, uploadStatus: "Enviado" } : document)),
      });
      // Keep the request alive across client navigation. The destination only reads GET.
      void startProcessing(created.id);
      router.push(`/comparisons/${created.id}/processing`);
    } catch (cause) {
      const failure = asProductError(cause);
      setError(`${uploadingIndex === null ? "" : `${files[uploadingIndex]?.name ?? "documento"}: `}${failure.message}`);
      if (uploadingIndex !== null) setDocuments((current) => current.map((document, i) => i === uploadingIndex ? { ...document, uploadStatus: "Envio não confirmado" } : document));
      setActivity("Envio interrompido");
    } finally { setBusy(false); submitting.current = false; }
  };
  return <div className="workspace-main shell">
    <div className="workspace-intro"><div><p className="workspace-kicker">01 / Ponto de partida</p><h1>O que você precisa comparar?</h1><p>Reúna as propostas. A Lydra vai organizar o que está claro e marcar o que ainda precisa ser confirmado.</p></div></div>
    <div className="workspace-grid">
      <section className="workspace-card" aria-labelledby="comparison-details-title">
        <p className="workspace-kicker">Nova comparação</p><h2 id="comparison-details-title">Dê um nome a esta decisão</h2>
        <label className="field-label" htmlFor="comparison-title">Título da comparação</label>
        <input className="comparison-title-input" id="comparison-title" type="text" value={title} disabled={attempted} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Reforma da fachada" maxLength={200} required />
        <div className="workspace-upload"><DocumentDropzone documents={documents} onAdd={addFiles} onRemove={(id) => { if (!attempted) setDocuments((current) => current.filter((document) => document.id !== id)); }} error={error} disabled={attempted} /></div>
        <div className="workspace-submit">
          <span className="upload-count" aria-live="polite">{documents.length < 2 ? `Faltam ${2 - documents.length} documento${documents.length === 0 ? "s" : ""}` : `${documents.length} documentos selecionados`}</span>
          <button className="button button-primary" type="button" onClick={() => { void analyze(); }} disabled={attempted || !validSubmission(title, documents.map((document) => document.file))}>{busy ? "Enviando propostas" : "Analisar propostas"}<span aria-hidden="true">→</span></button>
        </div>
        {attempted && !busy && error ? <div className="warning-panel"><p>O lote foi interrompido. Envios confirmados foram preservados; a análise não foi iniciada.</p>{comparisonId ? <Link className="button button-outline" href={`/comparisons/${comparisonId}`}>Consultar documentos recebidos</Link> : <p>A criação não foi confirmada. Nenhuma nova comparação será criada automaticamente.</p>}<p><button className="button button-outline" onClick={() => window.location.assign("/comparisons/new")}>Preparar outra comparação</button></p></div> : null}
      </section>
      <section className="workspace-card processing-card" aria-labelledby="processing-title" aria-live="polite">
        <p className="workspace-kicker">03 / Leitura</p><h2 id="processing-title">{activity}</h2>
        <p>{busy ? "A confirmação de cada envio aparecerá ao lado do arquivo." : "Escolha de 2 a 4 propostas para conhecer custos, prazos e informações que precisam de confirmação."}</p>
        <div className="process-rail"><div className={`process-step ${busy ? "active" : ""}`}>Recebimento dos documentos</div><div className="process-step">Leitura e validação das informações</div><div className="process-step">Comparação das propostas</div></div>
      </section>
    </div>
  </div>;
}
