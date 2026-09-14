import { createComparisonSchema } from "@/core/validation/schemas";
import { validateUpload, MAX_DOCUMENTS_PER_COMPARISON } from "@/core/validation/upload";
import { AppError } from "@/core/errors/app-error";
import { comparisonApi, errorMessage } from "./api";
import type { ComparisonDto, DocumentDto } from "./api";

export function selectFiles(current: File[], incoming: File[]) {
  const files = [...current]; const errors: string[] = [];
  for (const file of incoming) {
    if (files.length >= MAX_DOCUMENTS_PER_COMPARISON) { errors.push("Uma comparação pode ter no máximo 4 documentos."); break; }
    try { validateUpload({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }); files.push(file); }
    catch (error) { errors.push(`${file.name}: ${errorMessage(error instanceof AppError ? error.code : "VALIDATION_ERROR")}`); }
  }
  return { files, error: errors.length ? errors.join(" ") : null };
}
export function validSubmission(title: string, files: File[]): boolean {
  return createComparisonSchema.safeParse({ title }).success && files.length >= 2 && files.length <= MAX_DOCUMENTS_PER_COMPARISON;
}
/** Sequential writes: never replay a non-idempotent create/upload after an ambiguous response. */
export async function createAndUpload(input: {
  title: string; files: File[]; ensureSession: () => Promise<void>;
  onCreated: (comparison: ComparisonDto) => void;
  onUploading: (index: number) => void;
  onUploaded: (index: number, document: DocumentDto) => void;
}, api = comparisonApi) {
  if (!validSubmission(input.title, input.files)) throw new Error("Informe um título e selecione de 2 a 4 documentos.");
  const selection = selectFiles([], input.files);
  if (selection.error) throw new Error(selection.error);
  await input.ensureSession();
  const created = await api.create(createComparisonSchema.parse({ title: input.title }).title);
  input.onCreated(created);
  for (const [index, file] of input.files.entries()) {
    input.onUploading(index);
    const document = await api.upload(created.id, file);
    input.onUploaded(index, document);
  }
  return created;
}
