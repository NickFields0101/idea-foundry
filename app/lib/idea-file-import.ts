import {
  IdeaImportError,
  MAX_IMPORTED_TEXT_CHARS,
  MAX_PDF_PAGES,
  decodeIdeaText,
  finalizeIdeaFileExtraction,
  ideaFileKind,
  type IdeaFileExtraction,
} from "./idea-import-core";

const PDF_TIMEOUT_MS = 30_000;

function pdfError(error: unknown) {
  if (error instanceof IdeaImportError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") {
    return new IdeaImportError("password_pdf", "This PDF is password-protected. Unlock it or paste the idea text.");
  }
  if (name === "InvalidPDFException" || name === "MissingPDFException") {
    return new IdeaImportError("invalid_pdf", "SIFT could not read this PDF. Export it again or paste the idea text.");
  }
  return new IdeaImportError(
    "worker_failed",
    error instanceof Error ? `SIFT could not extract this PDF: ${error.message}` : "SIFT could not extract this PDF.",
  );
}

async function extractPdf(file: File, signal?: AbortSignal): Promise<IdeaFileExtraction> {
  let loadingTask: { promise: Promise<unknown>; destroy: () => Promise<void> } | undefined;
  let pdfWorker: { destroy: () => void } | undefined;
  let nativeWorker: Worker | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  try {
    const stopped = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new IdeaImportError("timeout", "PDF reading took too long. Export a smaller PDF or paste the idea text."));
      }, PDF_TIMEOUT_MS);
      abortHandler = () => reject(new IdeaImportError("cancelled", "Idea import cancelled."));
      signal?.addEventListener("abort", abortHandler, { once: true });
    });
    const guarded = <T,>(operation: Promise<T>) => Promise.race([operation, stopped]);
    if (signal?.aborted) throw new IdeaImportError("cancelled", "Idea import cancelled.");
    const bytes = new Uint8Array(await guarded(file.arrayBuffer()));
    const header = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (header !== "%PDF-") {
      throw new IdeaImportError("invalid_pdf", "This file does not contain a valid PDF header.");
    }
    const [pdfjs, workerAsset] = await guarded(Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]));
    nativeWorker = new Worker(workerAsset.default, { type: "module", name: "sift-pdf-text" });
    const worker = pdfjs.PDFWorker.create({ port: nativeWorker });
    pdfWorker = worker;
    const task = pdfjs.getDocument({
      data: bytes,
      worker,
      stopAtErrors: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false,
      useWasm: false,
    });
    loadingTask = task;
    const document = await guarded(task.promise);
    const pageLimit = Math.min(document.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];
    let extractedPages = 0;
    let extractedCharacters = 0;
    let textTruncated = false;
    for (let pageNumber = 1; pageNumber <= pageLimit && !textTruncated; pageNumber += 1) {
      const page = await guarded(document.getPage(pageNumber));
      extractedPages = pageNumber;
      let pageText = "";
      const reader = page.streamTextContent().getReader();
      try {
        while (!textTruncated) {
          const result = await guarded(reader.read());
          if (result.done) break;
          const items = result.value?.items ?? [];
          for (const item of items) {
            if (!("str" in item) || typeof item.str !== "string") continue;
            const addition = `${item.str}${item.hasEOL ? "\n" : " "}`;
            const remaining = MAX_IMPORTED_TEXT_CHARS - extractedCharacters;
            if (remaining <= 0) {
              textTruncated = true;
              break;
            }
            const clipped = addition.slice(0, remaining);
            pageText += clipped;
            extractedCharacters += clipped.length;
            if (clipped.length < addition.length || extractedCharacters >= MAX_IMPORTED_TEXT_CHARS) {
              textTruncated = true;
              break;
            }
          }
        }
      } finally {
        if (textTruncated || signal?.aborted) void reader.cancel().catch(() => undefined);
        else reader.releaseLock();
      }
      if (pageText.trim()) pages.push(pageText.trim());
    }
    const pageTruncated = document.numPages > extractedPages;
    const warnings = [];
    if (pageTruncated && extractedPages === MAX_PDF_PAGES) {
      warnings.push(`Only the first ${MAX_PDF_PAGES} of ${document.numPages} pages were read.`);
    }
    if (textTruncated) warnings.push("PDF text was limited to the first 45,000 characters.");
    return finalizeIdeaFileExtraction({
      fileName: file.name,
      kind: "pdf",
      text: pages.join("\n\n"),
      pageCount: document.numPages,
      extractedPages,
      truncated: pageTruncated || textTruncated,
      warnings,
    });
  } catch (error) {
    throw pdfError(error);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortHandler) signal?.removeEventListener("abort", abortHandler);
    await loadingTask?.destroy().catch(() => undefined);
    pdfWorker?.destroy();
    nativeWorker?.terminate();
  }
}

export async function extractIdeaFile(file: File, options: { signal?: AbortSignal } = {}): Promise<IdeaFileExtraction> {
  const kind = ideaFileKind(file);
  if (kind === "pdf") return extractPdf(file, options.signal);
  if (options.signal?.aborted) throw new IdeaImportError("cancelled", "Idea import cancelled.");
  const text = decodeIdeaText(await file.arrayBuffer(), kind);
  if (options.signal?.aborted) throw new IdeaImportError("cancelled", "Idea import cancelled.");
  return finalizeIdeaFileExtraction({ fileName: file.name, kind, text });
}
