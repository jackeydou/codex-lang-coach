import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { LearningStore } from "@language-coach/core";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_768) throw new Error("Request body is too large.");
  }
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}

function dashboardRoot(): string {
  return normalize(join(dirname(fileURLToPath(import.meta.url)), "..", "dashboard", "dist"));
}

export async function startDashboardServer(
  store: LearningStore,
  preferredPort = Number(process.env.LANGUAGE_COACH_PORT || 43127),
): Promise<{ server: Server; port: number; url: string }> {
  const staticRoot = dashboardRoot();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        sendJson(response, 200, store.getDashboardData());
        return;
      }
      if (url.pathname === "/api/profile" && request.method === "PUT") {
        const input = await readJson(request);
        sendJson(response, 200, store.updateProfile({
          nativeLanguage: typeof input.nativeLanguage === "string" ? input.nativeLanguage : undefined,
          targetLanguage: typeof input.targetLanguage === "string" ? input.targetLanguage : undefined,
          coachEnabled: typeof input.coachEnabled === "boolean" ? input.coachEnabled : undefined,
        }));
        return;
      }
      if (url.pathname.startsWith("/api/notes/") && request.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.slice("/api/notes/".length));
        const deleted = store.deleteNote(id);
        sendJson(response, deleted ? 200 : 404, { deleted });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      if (!existsSync(staticRoot)) {
        response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        response.end("Dashboard assets are missing. Run `pnpm build` from the monorepo root.");
        return;
      }
      const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      const candidate = normalize(join(staticRoot, requested));
      const filePath = candidate.startsWith(staticRoot) && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : join(staticRoot, "index.html");
      response.writeHead(200, {
        "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    let candidate = preferredPort;
    const tryListen = () => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" && candidate < preferredPort + 20) {
          candidate += 1;
          tryListen();
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(candidate);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, "127.0.0.1");
    };
    tryListen();
  });

  return { server, port, url: `http://127.0.0.1:${port}` };
}
