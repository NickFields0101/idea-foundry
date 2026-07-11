import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the completed SIFT landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Find what holds \| SIFT<\/title>/i);
  assert.match(html, /Find what holds\./);
  assert.match(html, /Generate ideas, challenge assumptions/i);
  assert.match(html, /Start with AI/);
  assert.match(html, /Start manually/);
  assert.match(html, /Personalize ideas/);
  assert.match(html, /I already have an idea/);
  assert.match(html, /No account · Deterministic scoring/);
  assert.match(html, /Use light mode/);
  assert.match(html, /data-theme="dark"/i);
  assert.match(html, /sift-brand-tornado\.png/i);
  assert.match(html, /sift-wordmark-light\.png/i);
  assert.match(html, /sift-hero\.png/i);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps deterministic scoring, privacy separation, and the social asset wired", async () => {
  const [page, layout, scoring] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/scoring.ts", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(page, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(page, /changes idea generation and ranking only—never evidence or the final decision score/i);
  assert.match(page, /AI output stays editable and never becomes evidence or a score automatically/i);
  assert.match(page, /OpenRouter/);
  assert.match(page, /Paste your OpenRouter API key/);
  assert.match(page, /queueModelSearch/);
  assert.match(page, /Type 4\.8, Opus, Sonnet, Llama/);
  assert.match(page, /scoreReview\(state\.review\)/);
  assert.match(page, /Turn the winner into a working project/);
  assert.match(page, /bridge\.run\(\{ toolId, capability, arguments: args \}\)/);
  assert.match(page, /className="current-thesis"[^\n]+SIFT_BRAND_TORNADO_URL/);
  assert.match(page, /computed fields are ignored/i);
  assert.match(layout, /NEXT_PUBLIC_SITE_URL/);
  assert.match(layout, /sift-theme-v1/);
  assert.match(layout, /images:\s*\["\/og\.png"\]/);
  assert.match(scoring, /v3-powershell-parity\/1\.0\.2/);
  assert.match(scoring, /numericAndGateEligible/);
  assert.match(scoring, /RUBRIC_MANIFEST_SHA256/);
  assert.doesNotMatch(page, /BEGIN (?:RSA )?PRIVATE KEY|wallet seed|secret phrase/i);
});
