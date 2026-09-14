"use client";

import { DragEvent, ChangeEvent } from "react";

export type SelectedDocument = {
  id: string;
  name: string;
  type: string;
  size: number;
  file: File;
  uploadStatus?: string;
};

type DocumentDropzoneProps = {
  documents: SelectedDocument[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  error: string | null;
  disabled?: boolean;
};

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayType(type: string, name: string) {
  if (type === "application/pdf") return "PDF";
  const extension = name.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 4 ? extension : "IMAGEM";
}

export function DocumentDropzone({ documents, onAdd, onRemove, error, disabled = false }: DocumentDropzoneProps) {
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return;
    onAdd(Array.from(fileList));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  return (
    <section aria-labelledby="documents-title">
      <div className="section-heading-row">
        <div>
          <p className="workspace-kicker">02 / Entradas</p>
          <h2 id="documents-title">Adicione de 2 a 4 orçamentos</h2>
        </div>
        <span className="document-counter" aria-label={`${documents.length} de 4 documentos`}>
          {documents.length.toString().padStart(2, "0")} / 04
        </span>
      </div>
      <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <input
          type="file"
          disabled={disabled}
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleChange}
          aria-label="Selecionar orçamentos em PDF ou imagem"
        />
        <span className="dropzone-mark" aria-hidden="true">+</span>
        <strong>Solte os documentos aqui</strong>
        <p>ou clique para selecionar os arquivos</p>
        <small>PDF · PNG · JPEG · WEBP / até 10 MiB cada</small>
      </label>
      {error ? <p className="upload-error" role="alert">{error}</p> : null}
      {documents.length > 0 ? (
        <div className="document-list" aria-label="Documentos adicionados">
          {documents.map((document) => (
            <article className="document-card" key={document.id}>
              <div className="document-card-info">
                <span className="document-card-name" title={document.name}>{document.name}</span>
                <span className="document-card-meta">
                  {displayType(document.type, document.name)} · {formatBytes(document.size)}
                </span>
              </div>
              <span className="document-status" role="status">{document.uploadStatus ?? "Adicionado"}</span>
              <button
                className="remove-document"
                type="button"
                disabled={disabled}
                onClick={() => onRemove(document.id)}
                aria-label={`Remover ${document.name}`}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export { MAX_SIZE, ACCEPTED_TYPES };