import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { loadClientConfig, loadServerConfig } from "@platform/config";
import { DESIGN_TOKENS } from "@platform/ui";

export function startAdminServer(portOverride?: number) {
  const serverConfig = loadServerConfig();
  const clientConfig = loadClientConfig();
  const port = portOverride ?? serverConfig.ADMIN_PORT;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || "/";

    if (url === "/health" || url === "/ready" || url === "/live") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          service: "admin",
          supabaseUrl: clientConfig.NEXT_PUBLIC_SUPABASE_URL,
          timestamp: new Date().toISOString()
        })
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Admin & Support Console</title>
        </head>
        <body style="font-family: ${DESIGN_TOKENS.typography.fontSans}; background: #0F172A; color: #F8FAFC; padding: 2rem;">
          <h1>Platform Admin & Support Console</h1>
          <p>Status: <span style="color: #38BDF8; font-weight: bold;">Operational</span></p>
        </body>
      </html>
    `);
  });

  server.listen(port, () => {
    console.log(`[Admin] Admin Console running at http://localhost:${port}`);
  });

  return server;
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  startAdminServer();
}
