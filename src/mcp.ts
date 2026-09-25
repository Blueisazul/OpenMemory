import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StorageEngine, ADRRecord } from "./storage";

export function createMCPServer(rootDir?: string): Server {
  const storage = new StorageEngine(rootDir);

  const server = new Server(
    {
      name: "openmemory",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available OpenMemory MCP tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "openmemory_status",
          description: "Get consolidated OpenMemory project context summary (phase, goal, tasks, ADRs, handoff)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "openmemory_get_handoff",
          description: "Get cross-session continuity handoff narrative (handoff.md)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "openmemory_save_adr",
          description: "Create or update an Architecture Decision Record (ADR) in MADR format atomically",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "ADR title" },
              status: {
                type: "string",
                enum: ["PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDE", "DEPRECATED"],
                description: "ADR status",
              },
              date: { type: "string", description: "Date (YYYY-MM-DD)" },
              context: { type: "string", description: "Problem or context description" },
              decision: { type: "string", description: "Architectural decision text" },
              consequences: { type: "string", description: "Positive/negative consequences" },
            },
            required: ["title", "context", "decision"],
          },
        },
        {
          name: "openmemory_create_backup",
          description: "Create an atomic snapshot backup of critical state files under .openmemory/backups/",
          inputSchema: {
            type: "object",
            properties: {
              label: { type: "string", description: "Optional backup label" },
            },
          },
        },
        {
          name: "openmemory_run_diagnostics",
          description: "Run storage engine health check, cleanup orphaned temp files, and self-heal corrupted state",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  // Handle MCP tool invocation requests
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "openmemory_status": {
        const summary = storage.formatProjectContextSummary();
        return {
          content: [
            {
              type: "text",
              text: summary,
            },
          ],
        };
      }

      case "openmemory_get_handoff": {
        const handoff = storage.getOrInitHandoff();
        return {
          content: [
            {
              type: "text",
              text: handoff,
            },
          ],
        };
      }

      case "openmemory_save_adr": {
        const title = String(args?.title || "Untitled Decision");
        const status = (args?.status as ADRRecord["status"]) || "ACCEPTED";
        const date = String(args?.date || new Date().toISOString().split("T")[0]);
        const context = String(args?.context || "");
        const decision = String(args?.decision || "");
        const consequences = args?.consequences ? String(args.consequences) : undefined;

        const record = storage.saveADR({
          title,
          status,
          date,
          context,
          decision,
          consequences,
        });

        return {
          content: [
            {
              type: "text",
              text: `[OpenMemory MCP] ADR created/updated successfully: ${record.id} - ${record.title} (${record.status})`,
            },
          ],
        };
      }

      case "openmemory_create_backup": {
        const label = String(args?.label || "mcp-backup");
        const backupMeta = storage.createBackup(label);

        return {
          content: [
            {
              type: "text",
              text: `[OpenMemory MCP] Backup created successfully: ${backupMeta.id} (${backupMeta.filesCount} files) at ${backupMeta.backupPath}`,
            },
          ],
        };
      }

      case "openmemory_run_diagnostics": {
        const report = storage.runDiagnostics();
        return {
          content: [
            {
              type: "text",
              text: `[OpenMemory MCP] Diagnostics Status: ${report.status}\nChecks:\n${report.checks
                .map((c) => `* [${c.passed ? "PASS" : "FAIL"}] ${c.name}: ${c.details}`)
                .join("\n")}\nOrphaned Temp Files Removed: ${report.orphanedTempFilesRemoved}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown MCP tool name: ${name}`);
    }
  });

  return server;
}

export async function runMCPServer(rootDir?: string): Promise<void> {
  const server = createMCPServer(rootDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[OpenMemory MCP] Server running on STDIO transport.");
}

// Execute MCP server directly if invoked from command line
if (require.main === module) {
  runMCPServer().catch((err) => {
    console.error("[OpenMemory MCP Error]", err);
    process.exit(1);
  });
}
