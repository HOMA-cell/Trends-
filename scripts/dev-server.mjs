import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function toLocalPath(urlPath = "/") {
  let path = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (path === "/") path = "/index.html";
  if (path.endsWith("/")) path += "index.html";
  const normalized = normalize(path).replace(/^(\.\.[/\\])+/, "");
  return join(ROOT, normalized);
}

function resolveType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

const server = createServer(async (req, res) => {
  const requestedPath = decodeURIComponent((req.url || "/").split("?")[0] || "/");
  try {
    const filePath = toLocalPath(req.url || "/");
    const st = statSync(filePath);
    if (st.isDirectory()) {
      res.writeHead(301, { Location: `${req.url || "/"}/` });
      res.end();
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": resolveType(filePath),
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    if (requestedPath === "/favicon.ico") {
      try {
        const fallbackPath = join(ROOT, "icon.svg");
        const body = await readFile(fallbackPath);
        res.writeHead(200, {
          "Content-Type": MIME[".svg"],
          "Cache-Control": "no-store",
        });
        res.end(body);
        return;
      } catch {
        // ignore and continue to default 404
      }
    }
    if (!extname(requestedPath) || requestedPath.endsWith("/")) {
      try {
        const fallbackPath = join(ROOT, "index.html");
        const body = await readFile(fallbackPath);
        res.writeHead(200, {
          "Content-Type": MIME[".html"],
          "Cache-Control": "no-store",
        });
        res.end(body);
        return;
      } catch {
        // ignore and continue to default 404
      }
    }
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("Not Found");
  }
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Try: PORT=5173 npm run dev`
    );
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Trends dev server running at http://${HOST}:${PORT}`);
});
