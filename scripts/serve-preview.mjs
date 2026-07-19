import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
const port = Number(process.argv[3]);

if (!root || !Number.isInteger(port) || port < 1024 || port > 65535 || !statSync(root).isDirectory()) {
  process.stderr.write("Invalid preview server arguments.\n");
  process.exit(1);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolveFile(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://preview.local").pathname);
  const candidate = path.resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;

  try {
    if (statSync(candidate).isFile()) return candidate;
  } catch {}

  return path.join(root, "index.html");
}

const server = createServer((request, response) => {
  const filePath = resolveFile(request.url ?? "/");
  if (!filePath) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const metadata = statSync(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": metadata.size,
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors http://localhost:* http://127.0.0.1:*",
      "Content-Type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`PREVIEW_READY http://127.0.0.1:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
