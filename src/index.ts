import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "http";

// --- Data layer ---
// In a real project this might come from a database or external API (like Hebcal).
// For now we hardcode a few upcoming holidays so we can focus on the MCP mechanics.
const holidays = [
  { name: "Passover (Pesach)", hebrewName: "פסח", date: "2026-04-13", duration: 8, description: "Commemorates the Exodus from Egypt. Seder nights on the first two evenings." },
  { name: "Holocaust Remembrance Day", hebrewName: "יום השואה", date: "2026-04-24", duration: 1, description: "A day of remembrance for the six million Jews killed in the Holocaust." },
  { name: "Memorial Day", hebrewName: "יום הזיכרון", date: "2026-05-05", duration: 1, description: "Remembrance day for fallen Israeli soldiers and terror victims." },
  { name: "Independence Day", hebrewName: "יום העצמאות", date: "2026-05-06", duration: 1, description: "Celebrates the establishment of the State of Israel in 1948." },
  { name: "Lag BaOmer", hebrewName: "ל״ג בעומר", date: "2026-05-16", duration: 1, description: "The 33rd day of the Omer count. Celebrated with bonfires." },
  { name: "Shavuot", hebrewName: "שבועות", date: "2026-06-02", duration: 2, description: "Commemorates the giving of the Torah at Mount Sinai." },
];

// --- MCP Server setup ---
const server = new McpServer({
  name: "hebrew-holidays-mcp",
  version: "1.0.0",
});

// Register our tool. The description is critical — Claude reads this to understand
// when and why to call this tool. Be specific and descriptive.
server.tool(
  "get_upcoming_jewish_holidays",
  "Returns a list of upcoming Jewish and Israeli holidays with their Hebrew names, Gregorian dates, duration, and a short description. Useful for planning, greetings, or answering questions about the Jewish calendar.",
  {
    // Zod schema: Claude must provide a `count` parameter (how many holidays to return).
    // .default(3) means Claude can omit it and it will fall back to 3.
    count: z.number().min(1).max(10).default(3).describe("How many upcoming holidays to return"),
  },
  async ({ count }) => {
    const today = new Date();

    // Filter to only future holidays, then take the first `count` of them
    const upcoming = holidays
      .filter(h => new Date(h.date) >= today)
      .slice(0, count);

    if (upcoming.length === 0) {
      return { content: [{ type: "text", text: "No upcoming holidays found in the database." }] };
    }

    // Format the result as readable text. Claude will incorporate this into its response.
    const formatted = upcoming.map(h =>
      `📅 ${h.name} (${h.hebrewName})\n   Date: ${h.date} | Duration: ${h.duration} day(s)\n   ${h.description}`
    ).join("\n\n");

    return {
      content: [{ type: "text", text: formatted }],
    };
  }
);

// --- HTTP Transport ---
// This is what makes the server accessible over the network (vs. stdio which is local only).
// Claude.ai and the Anthropic API will send POST requests to /mcp.
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/mcp") {
    // Collect the request body
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const transport = new StreamableHTTPServerTransport({});
        await server.connect(transport as any);
        await transport.handleRequest(req, res, JSON.parse(body));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  } else {
    // Health check endpoint — Railway uses this to verify the service is alive
    res.writeHead(200);
    res.end("Hebrew Holidays MCP server is running ✅");
  }
});

// Railway injects the PORT environment variable automatically.
// We fall back to 3000 for local development.
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
httpServer.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT}`);
});