import "dotenv/config";
import path from "path";
import fs from "fs";

// Write a dynamic fonts.conf with the actual runtime path, then point FONTCONFIG_PATH at it.
// This ensures sharp's bundled librsvg/fontconfig finds Liberation Sans in all environments.
// Must happen before any sharp import.
(function setupFontConfig() {
  const fontsDir = path.join(process.cwd(), "server", "fonts");
  const confPath = path.join(fontsDir, "fonts.conf");
  const conf = `<?xml version="1.0"?>\n<fontconfig>\n  <dir>${fontsDir}</dir>\n  <cachedir>/tmp/fc-cache-abc</cachedir>\n</fontconfig>`;
  try {
    fs.writeFileSync(confPath, conf, "utf8");
    process.env.FONTCONFIG_PATH = fontsDir;
  } catch (e) {
    console.warn("[fonts] Could not write fonts.conf:", e);
  }
})();

import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerChatRoutes } from "./chat";
import { registerIngestRoute } from "../ingest";
import { registerPdfRoute } from "../pdf";
import { registerStopsRoute } from "../stops";
import { registerExportsRoute } from "../exports";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Chat API with streaming and tool calling
  registerChatRoutes(app);
  // Ingest REST API
  registerIngestRoute(app);
  // PDF generation
  registerPdfRoute(app);
  // Stops REST API
  registerStopsRoute(app);
  // Export REST API (JSON / DOCX / Photos ZIP)
  registerExportsRoute(app);
  // Version endpoint — returns a timestamp generated at server startup.
  // This changes on every deployment/restart, allowing the client to detect new versions.
  const BUILD_ID = Date.now().toString();
  app.get("/api/version", (_req, res) => {
    res.json({ version: BUILD_ID });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
