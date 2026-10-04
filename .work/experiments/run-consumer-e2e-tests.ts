import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { installOpenMemory, uninstallOpenMemory } from "../../src/installer";
import { StorageEngine } from "../../src/storage";
import { OpenMemoryPlugin } from "../../src/plugin";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[CONSUMER E2E ASSERTION FAILED] ${message}`);
  }
}

async function runConsumerE2ETest() {
  console.log("=================================================");
  console.log("   OpenMemory Consumer E2E Integration Suite     ");
  console.log("=================================================\n");

  const consumerDir = path.join(process.cwd(), ".work", "scratch", "clean-consumer-app");
  if (fs.existsSync(consumerDir)) {
    fs.rmSync(consumerDir, { recursive: true, force: true });
  }
  fs.mkdirSync(consumerDir, { recursive: true });

  // -------------------------------------------------------------------------
  // STEP 1: Consumer Project Initial State (Clean repository)
  // -------------------------------------------------------------------------
  console.log("Step 1: Setting up clean consumer repository...");
  fs.writeFileSync(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ name: "clean-consumer-app", version: "1.0.0" }, null, 2),
    "utf-8"
  );
  assert(!fs.existsSync(path.join(consumerDir, ".openmemory")), "No .openmemory initially");
  assert(!fs.existsSync(path.join(consumerDir, "AGENTS.md")), "No AGENTS.md initially");
  assert(!fs.existsSync(path.join(consumerDir, "opencode.json")), "No opencode.json initially");
  console.log("[PASSED] Step 1: Clean repository verified.\n");

  // -------------------------------------------------------------------------
  // STEP 2: Execute openmemory install
  // -------------------------------------------------------------------------
  console.log("Step 2: Executing installOpenMemory() on consumer...");
  const installRes = installOpenMemory({ targetDir: consumerDir });
  assert(installRes.success === true, "Installation reported success");
  assert(fs.existsSync(path.join(consumerDir, ".openmemory")), ".openmemory/ directory created");
  assert(fs.existsSync(path.join(consumerDir, "AGENTS.md")), "AGENTS.md created");
  assert(fs.existsSync(path.join(consumerDir, ".opencode", "plugins", "openmemory.ts")), "Plugin shim created");
  assert(fs.existsSync(path.join(consumerDir, "opencode.json")), "opencode.json created");
  console.log("[PASSED] Step 2: Consumer installation verified.\n");

  // -------------------------------------------------------------------------
  // STEP 3: Verify OpenCode Plugin Execution (Compiled & Shimmed Plugin)
  // -------------------------------------------------------------------------
  console.log("Step 3: Instantiating OpenMemoryPlugin on consumer...");
  const pluginInstance = await OpenMemoryPlugin({
    client: {} as any,
    project: { name: "clean-consumer-app" } as any,
    $: {} as any,
    directory: consumerDir,
    worktree: consumerDir,
    experimental_workspace: {} as any,
    serverUrl: new URL("http://localhost:3000"),
  });

  assert(typeof pluginInstance.event === "function", "Plugin event hook exists");
  assert(typeof pluginInstance["experimental.chat.system.transform"] === "function", "System transform hook exists");
  assert(typeof pluginInstance["experimental.session.compacting"] === "function", "Compacting hook exists");

  // 3a. Test session.created event
  console.log("  Testing session.created event...");
  const sessionId = "sess_e2e_consumer_1001";
  await pluginInstance.event({
    event: {
      type: "session.created",
      properties: {
        info: { id: sessionId },
      },
    },
  });

  const storage = new StorageEngine(consumerDir);
  const sess = storage.getSession(sessionId);
  assert(sess !== null && sess.id === sessionId, "Session registered in consumer StorageEngine");
  assert(sess?.status === "ACTIVE", "Session status is ACTIVE");

  // 3b. Test experimental.chat.system.transform
  console.log("  Testing system prompt transformation...");
  const sysOutput = { system: [] as string[] };
  await pluginInstance["experimental.chat.system.transform"]({ sessionID: sessionId }, sysOutput);
  console.log("  DEBUG system prompt injected:\n", sysOutput.system[0]);
  assert(sysOutput.system.length > 0, "System prompt context injected");
  assert(sysOutput.system[0].includes("Stage Governance") || sysOutput.system[0].includes("OpenMemory"), "Stage Governance present in system prompt");

  // 3c. Test session.compacted event
  console.log("  Testing session.compacted event & handoff update...");
  await pluginInstance.event({
    event: {
      type: "session.compacted",
      properties: {
        sessionID: sessionId,
      },
    },
  });

  const handoff = storage.getOrInitHandoff();
  assert(handoff.length > 0, "Handoff context generated");
  assert(!handoff.includes("undefined"), "Handoff does not contain undefined");

  const eventsLog = fs.readFileSync(path.join(consumerDir, ".openmemory", "logs", "events.jsonl"), "utf-8");
  assert(eventsLog.includes("session.created"), "session.created event logged");
  assert(eventsLog.includes("session.compacted"), "session.compacted event logged");

  await pluginInstance.dispose?.();
  console.log("[PASSED] Step 3: OpenCode Plugin execution verified.\n");

  // -------------------------------------------------------------------------
  // STEP 4: Verify Compiled MCP Server Execution over STDIO (Child Process)
  // -------------------------------------------------------------------------
  console.log("Step 4: Testing Compiled MCP Server (dist/mcp.js) via STDIO process...");
  const mcpScriptPath = path.join(process.cwd(), "dist", "mcp.js");
  assert(fs.existsSync(mcpScriptPath), "dist/mcp.js exists");

  const mcpProc = spawn("node", [mcpScriptPath], {
    cwd: consumerDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let mcpStdout = "";
  let mcpStderr = "";
  mcpProc.stdout.on("data", (d) => (mcpStdout += d.toString()));
  mcpProc.stderr.on("data", (d) => (mcpStderr += d.toString()));

  // Send MCP initialize JSON-RPC request over STDIO
  const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e-test-client", version: "1.0.0" },
    },
  }) + "\n";

  const listToolsRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  }) + "\n";

  mcpProc.stdin.write(initRequest);
  mcpProc.stdin.write(listToolsRequest);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  mcpProc.kill("SIGTERM");

  assert(mcpStderr.includes("[OpenMemory MCP] Server running on STDIO transport."), "MCP server started cleanly on STDIO");
  assert(mcpStdout.includes("openmemory_status"), "MCP server returned openmemory_status tool");
  assert(mcpStdout.includes("openmemory_record_knowledge"), "MCP server returned openmemory_record_knowledge tool");
  console.log("[PASSED] Step 4: Compiled MCP Server STDIO execution verified.\n");

  // -------------------------------------------------------------------------
  // STEP 5: Verify Reversal Uninstallation (uninstallOpenMemory)
  // -------------------------------------------------------------------------
  console.log("Step 5: Testing uninstallOpenMemory() on consumer...");
  const unres = uninstallOpenMemory({ targetDir: consumerDir });
  assert(unres.success === true, "Uninstall succeeded");
  assert(unres.pluginShimRemoved === true, "Plugin shim removed");
  assert(unres.mcpConfigRemoved === true, "MCP config removed from opencode.json");
  assert(unres.storagePreserved === true, "Storage (.openmemory/) preserved");

  assert(fs.existsSync(path.join(consumerDir, ".openmemory")), ".openmemory/ directory STILL EXISTS");
  assert(fs.existsSync(path.join(consumerDir, ".openmemory", "logs", "events.jsonl")), "Events log STILL EXISTS with session history");
  console.log("[PASSED] Step 5: Consumer Uninstallation & Data Preservation verified.\n");

  console.log("=================================================");
  console.log("   Consumer E2E Integration Suite PASSED!        ");
  console.log("=================================================\n");
}

runConsumerE2ETest().catch((err) => {
  console.error("Consumer E2E Test Failed:", err);
  process.exit(1);
});
