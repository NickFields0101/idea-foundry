import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDirectory = path.join(projectDirectory, "dist", "client");
const workerPath = path.join(projectDirectory, "dist", "server", "index.js");
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const port = Number(portArgument?.slice("--port=".length) || process.env.PORT || 3010);
let workerVersion = "";
let workerPromise;

async function currentWorker() {
  const details = await fs.stat(workerPath);
  const version = `${details.mtimeMs}-${details.size}`;
  if (!workerPromise || version !== workerVersion) {
    workerVersion = version;
    const workerUrl = new URL(`../dist/server/index.js?preview=${encodeURIComponent(version)}`, import.meta.url);
    workerPromise = import(workerUrl.href).then((module) => module.default);
  }
  return workerPromise;
}

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function assetResponse(request) {
  const url = new URL(request.url);
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const target = path.resolve(clientDirectory, relativePath);
  if (target !== clientDirectory && !target.startsWith(`${clientDirectory}${path.sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const contents = await fs.readFile(target);
    return new Response(request.method === "HEAD" ? null : contents, {
      headers: {
        "cache-control": "no-store",
        "content-type": mimeTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream",
      },
    });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") return new Response("Not found", { status: 404 });
    throw error;
  }
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host || `127.0.0.1:${port}`}`;
    const request = new Request(new URL(incoming.url || "/", origin), {
      method: incoming.method,
      headers: incoming.headers,
    });
    const asset = await assetResponse(request);
    const response = asset.status !== 404
      ? asset
      : await (await currentWorker()).fetch(
        request,
        { ASSETS: { fetch: assetResponse } },
        { waitUntil() {}, passThroughOnException() {} },
      );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end(error instanceof Error ? error.message : "Preview failed");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`SIFT preview: http://127.0.0.1:${port}\n`);
});
