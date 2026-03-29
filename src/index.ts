import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "http";

const holidays = [
  { name: "Passover (Pesach)", hebrewName: "פסח", date: "2026-04-13", duration: 8, description: "Commemorates the Exodus from Egypt. Seder nights on the first two evenings." },
  { name: "Holocaust Remembrance Day", hebrewName: "יום השואה", date: "2026-04-24", duration: 1, description: "A day of remembrance for the six million Jews killed in the Holocaust." },
  { name: "Memorial Day", hebrewName: "יום הזיכרון", date: "2026-05-05", duration: 1, description: "Remembrance day for fallen Israeli soldiers and terror victims." },
  { name: "Independence Day", hebrewName: "יום העצמאות", date: "2026-05-06", duration: 1, description: "Celebrates the establishment of the State of Israel in 1948." },
  { name: "Lag BaOmer", hebrewName: "ל״ג בעומר", date: "2026-05-16", duration: 1, description: "Celebrated with bonfires on the 33rd day of the Omer." },
  { name: "Shavuot", hebrewName: "שבועות", date: "2026-06-02", duration: 2, description: "Commemorates the giving of the Torah at Mount Sinai." },
];

function createServer(): McpServer {
  const server = new McpServer({
    name: "hebrew-holidays-mcp",
    version: "1.0.0",
  });

  server.tool(
    "get_upcoming_jewish_holidays",
    "Returns a list of upcoming Jewish and Israeli holidays with their Hebrew names, Gregorian dates, duration, and a short description. Useful for planning, greetings, or answering questions about the Jewish calendar.",
    {
      count: z.number().min(1).max(10).default(3).describe("How many upcoming holidays to return"),
    },
    async ({ count }) => {
      const today = new Date();
      const upcoming = holidays
        .filter(h => new Date(h.date) >= today)
        .slice(0, count);

      if (upcoming.length === 0) {
        return { content: [{ type: "text", text: "No upcoming holidays found in the database." }] };
      }

      const formatted = upcoming.map(h =>
        `📅 ${h.name} (${h.hebrewName})\n   Date: ${h.date} | Duration: ${h.duration} day(s)\n   ${h.description}`
      ).join("\n\n");

      return { content: [{ type: "text", text: formatted }] };
    }
  );

  return server;
}

// Manually handle the MCP JSON-RPC protocol without relying on session state
const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const message = JSON.parse(body) as { method: string; id: number; jsonrpc: string; params?: unknown };

        res.setHeader("Content-Type", "application/json");

        // Handle initialize — respond with server capabilities
        if (message.method === "initialize") {
          res.writeHead(200);
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: "hebrew-holidays-mcp", version: "1.0.0" },
            },
          }));
          return;
        }

        // Handle tools/list — return tool definitions directly
        if (message.method === "tools/list") {
          res.writeHead(200);
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              tools: [
                {
                  name: "get_upcoming_jewish_holidays",
                  description: "Returns a list of upcoming Jewish and Israeli holidays with their Hebrew names, Gregorian dates, duration, and a short description. Useful for planning, greetings, or answering questions about the Jewish calendar.",
                  inputSchema: {
                    type: "object",
                    properties: {
                      count: {
                        type: "number",
                        minimum: 1,
                        maximum: 10,
                        default: 3,
                        description: "How many upcoming holidays to return",
                      },
                    },
                  },
                },
              ],
            },
          }));
          return;
        }

        // Handle tools/call — actually run the tool
        if (message.method === "tools/call") {
          const params = message.params as { name: string; arguments?: { count?: number } };
          const count = params.arguments?.count ?? 3;
          const today = new Date();
          const upcoming = holidays
            .filter(h => new Date(h.date) >= today)
            .slice(0, count);

          const text = upcoming.length === 0
            ? "No upcoming holidays found."
            : upcoming.map(h =>
                `📅 ${h.name} (${h.hebrewName})\n   Date: ${h.date} | Duration: ${h.duration} day(s)\n   ${h.description}`
              ).join("\n\n");

          res.writeHead(200);
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: { content: [{ type: "text", text }] },
          }));
          return;
        }

        // Handle notifications (initialized, etc.) — just acknowledge
        if (!message.id) {
          res.writeHead(204);
          res.end();
          return;
        }

        // Unknown method
        res.writeHead(200);
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Method not found" },
        }));

      } catch (err) {
        console.error("MCP error:", err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  } else {
    res.writeHead(200);
    res.end("Hebrew Holidays MCP server is running ✅");
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
httpServer.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT}`);
});