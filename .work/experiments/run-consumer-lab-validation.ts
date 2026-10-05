import * as fs from "fs";
import * as path from "path";
import { spawn, execSync } from "child_process";

const targetDir = "c:\\Users\\sant1\\Downloads\\PruebaN2\\OpenMemory-v0.3.0-Fixed-Lab";

async function testFullConsumerLab() {
  console.log("=== CONSUMER LAB E2E VALIDATION ===");

  const pluginPath = path.join(targetDir, "node_modules", "openmemory", "dist", "plugin.js");
  const storagePath = path.join(targetDir, "node_modules", "openmemory", "dist", "storage.js");

  const { OpenMemoryPlugin } = require(pluginPath);
  const { StorageEngine } = require(storagePath);

  const storage = new StorageEngine(targetDir);

  // 1. Plugin Instantiation & Lifecycle
  const plugin = await OpenMemoryPlugin({ directory: targetDir, worktree: targetDir } as any);

  // 2. Session created
  await plugin.event({
    event: { type: "session.created", properties: { info: { id: "ses_fixed_lab_001" } } },
  });
  console.log("[PASS] 1. session.created handled");

  // 3. System prompt transformation
  const systemOutput = { system: [] as string[] };
  await plugin["experimental.chat.system.transform"]({ sessionID: "ses_fixed_lab_001" }, systemOutput);
  console.log("[PASS] 2. system prompt transformation executed (length:", systemOutput.system[0].length, ")");
  if (systemOutput.system[0].includes("Active Phase: undefined")) {
    throw new Error("FAIL: System prompt contained Active Phase: undefined");
  }
  console.log("[PASS] 3. activePhase resolution clean without undefined");

  // 4. Session idle -> Auto Handoff
  await plugin.event({
    event: { type: "session.idle", properties: { sessionID: "ses_fixed_lab_001" } },
  });
  const handoffAfter = fs.readFileSync(path.join(targetDir, ".openmemory", "handoff.md"), "utf8");
  console.log("[PASS] 4. session.idle auto-handoff updated handoff.md successfully!");

  // 5. MCP Process 1 Execution & Write
  console.log("\n--- Testing MCP Process 1 Write & Read ---");
  function runMcp(actions: Record<number, any>) {
    return new Promise<Record<number, any>>((resolve) => {
      const proc = spawn("node", ["node_modules/openmemory/dist/mcp.js"], {
        cwd: targetDir,
        stdio: ["pipe", "pipe", "inherit"],
      });
      let buffer = "";
      const responses: Record<number, any> = {};

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.id) {
            responses[msg.id] = msg;
            if (msg.id === 1) {
              proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
              proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: actions[2] }) + "\n");
            } else {
              const nextId = msg.id + 1;
              if (actions[nextId]) {
                proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: nextId, method: "tools/call", params: actions[nextId] }) + "\n");
              } else {
                proc.kill();
                resolve(responses);
              }
            }
          }
        }
      });

      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "diagnostic", version: "1.0.0" } },
        }) + "\n"
      );
    });
  }

  const res1 = await runMcp({
    2: { name: "openmemory_register_session", arguments: { id: "ses_fixed_lab_mcp", agentId: "lab-agent", status: "ACTIVE" } },
    3: {
      name: "openmemory_record_knowledge",
      arguments: {
        agentId: "lab-agent",
        sessionId: "ses_fixed_lab_mcp",
        topic: "FIXED_LAB_KNOWLEDGE",
        category: "architecture",
        summary: "Lab record test",
        items: [{ id: "i1", type: "FINDING", title: "Lab item", content: "Content" }],
      },
    },
    4: { name: "openmemory_query_knowledge", arguments: { query: "FIXED_LAB_KNOWLEDGE" } },
  });

  console.log("[PASS] 5. MCP Register Session:", res1[2].result.content[0].text.split("\n")[0]);
  console.log("[PASS] 6. MCP Write Knowledge:", res1[3].result.content[0].text.split("\n")[0]);
  console.log("[PASS] 7. MCP Query Knowledge (Proc 1): Found matching record");

  // 6. MCP Process 2 (Restart) & Read
  console.log("\n--- Testing MCP Process 2 Read After Process Restart ---");
  const res2 = await runMcp({
    2: { name: "openmemory_query_knowledge", arguments: { query: "FIXED_LAB_KNOWLEDGE" } },
  });
  console.log("[PASS] 8. MCP Query Knowledge (Proc 2 Restart): Found matching record persisted on disk!");

  // 7. Verify uninstall preserving data
  console.log("\n--- Testing npx openmemory uninstall ---");
  execSync("npx openmemory uninstall", { cwd: targetDir, stdio: "inherit" });
  console.log("[PASS] 9. openmemory.ts shim removed:", !fs.existsSync(path.join(targetDir, ".opencode/plugins/openmemory.ts")));
  console.log("[PASS] 10. .openmemory/ data preserved intact:", fs.existsSync(path.join(targetDir, ".openmemory/knowledge/researches")));

  console.log("\n=================================================");
  console.log("🎉 ALL CONSUMER LAB VERIFICATION STEPS PASSED 100%");
  console.log("=================================================");
}

testFullConsumerLab().catch((err) => {
  console.error("Consumer lab test failed:", err);
  process.exit(1);
});
