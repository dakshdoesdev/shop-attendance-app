import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import session from "express-session";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(
  app: Express,
  server: Server,
  sessionMiddleware: express.RequestHandler,
) {
  const hmrOptions: any = { server };
  const publicUrl = process.env.PUBLIC_URL;
  const inferredHost = publicUrl ? (() => { try { return new URL(publicUrl).hostname; } catch { return undefined; } })() : undefined;
  const hmrHost = process.env.HMR_HOST || inferredHost;
  if (hmrHost) {
    hmrOptions.host = hmrHost;
    hmrOptions.protocol = 'wss';
    hmrOptions.clientPort = 443;
  }

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      // Allow external hosts like ngrok to reach the dev server middleware
      allowedHosts: true,
      middlewareMode: true,
      hmr: hmrOptions,
    },
    appType: "custom",
  });

  app.use(sessionMiddleware);
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    // Skip Vite handling for API routes and uploads
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/uploads")) {
      return next();
    }

    if (!vite) {
      return next();
    }

    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
      return;
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
