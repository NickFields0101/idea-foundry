import assert from "node:assert/strict";
import test from "node:test";

import {
  IdeaImportError,
  MAX_IMPORTED_TEXT_CHARS,
  MAX_PDF_FILE_BYTES,
  buildIdeaImportPrompt,
  decodeIdeaText,
  finalizeIdeaFileExtraction,
  ideaConceptFromText,
  ideaFileKind,
  ideaTitleFromFileName,
  normalizeImportedIdeaText,
  suggestedIdeaTitle,
} from "../app/lib/idea-import-core.ts";

test("idea file types are bounded and checked before parsing", () => {
  assert.equal(ideaFileKind({ name: "PLAN.PDF", type: "application/pdf", size: 100 }), "pdf");
  assert.equal(ideaFileKind({ name: "idea.markdown", type: "text/plain", size: 100 }), "markdown");
  assert.equal(ideaFileKind({ name: "idea.csv", type: "text/csv", size: 100 }), "data");
  assert.throws(
    () => ideaFileKind({ name: "idea.pdf", type: "text/plain", size: 100 }),
    (error: unknown) => error instanceof IdeaImportError && error.code === "type_mismatch",
  );
  assert.throws(
    () => ideaFileKind({ name: "idea.doc", type: "application/msword", size: 100 }),
    (error: unknown) => error instanceof IdeaImportError && error.code === "unsupported_type",
  );
  assert.throws(
    () => ideaFileKind({ name: "idea.pdf", type: "application/pdf", size: MAX_PDF_FILE_BYTES + 1 }),
    (error: unknown) => error instanceof IdeaImportError && error.code === "too_large",
  );
});

test("text imports normalize safely while preserving useful paragraphs", () => {
  const normalized = normalizeImportedIdeaText("\uFEFF# Food Bridge  \r\n\r\nHelp shoppers\u0000 choose food.\r\n\r\n\r\nStart locally.  ");
  assert.equal(normalized, "# Food Bridge\n\nHelp shoppers choose food.\n\nStart locally.");
  assert.equal(suggestedIdeaTitle(normalized, "fallback.md"), "Food Bridge");
  assert.equal(ideaTitleFromFileName("healthy-food_bridge.md"), "Healthy Food Bridge");
  assert.equal(ideaConceptFromText(normalized), "Help shoppers choose food.");
});

test("a longer Markdown title is not mistaken for the idea concept", () => {
  const text = "# Neighborhood Trail Coach\n\nAn app that helps everyday walkers discover safe routes and connect with local fitness experts.";
  assert.equal(
    ideaConceptFromText(text),
    "An app that helps everyday walkers discover safe routes and connect with local fitness experts.",
  );
});

test("a PDF-style title line is excluded from the idea concept", () => {
  const text = "Neighborhood Trail Coach\nAn app that helps everyday walkers discover safe routes and connect with local fitness experts.\nThe first test recruits twenty walkers.";
  assert.equal(
    ideaConceptFromText(text),
    "An app that helps everyday walkers discover safe routes and connect with local fitness experts. The first test recruits twenty walkers.",
  );
});

test("JSON imports are validated and malformed JSON is rejected", () => {
  const bytes = new TextEncoder().encode('{"idea":"local food expert network"}').buffer;
  assert.match(decodeIdeaText(bytes, "json"), /"idea": "local food expert network"/);
  const invalid = new TextEncoder().encode("{not-json}").buffer;
  assert.throws(
    () => decodeIdeaText(invalid, "json"),
    (error: unknown) => error instanceof IdeaImportError && error.code === "invalid_json",
  );
});

test("AI structuring prompt is bounded and forbids invented evidence", () => {
  const sentinel = "DO_NOT_INCLUDE_AFTER_LIMIT";
  const prompt = buildIdeaImportPrompt({
    title: "My idea",
    text: `${"a".repeat(MAX_IMPORTED_TEXT_CHARS + 100)}${sentinel}`,
  });
  assert.ok(prompt.length < 60_000);
  assert.match(prompt, /exactly one faithful SIFT business-idea candidate/i);
  assert.match(prompt, /untrusted data/i);
  assert.match(prompt, /Do not invent interviews, customers, demand/i);
  assert.doesNotMatch(prompt, new RegExp(sentinel));
});

test("a scanned PDF receives an actionable no-text error", () => {
  assert.throws(
    () => finalizeIdeaFileExtraction({ fileName: "scan.pdf", kind: "pdf", text: "   " }),
    (error: unknown) => error instanceof IdeaImportError
      && error.code === "no_text"
      && /OCR|selectable text/i.test(error.message),
  );
});
