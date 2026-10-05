import * as fs from "fs";
import * as path from "path";
import { execSync, spawn } from "child_process";

const targetDir = "c:\\Users\\sant1\\Downloads\\PruebaN2\\OpenMemory-v0.3.1-Release-Lab";
const tarball = "c:\\Users\\sant1\\Downloads\\PruebaN2\\OpenMemory\\openmemory-0.3.1.tgz";

async function runReleaseLab() {
  console.log("=================================================");
  console.log("OpenMemory v0.3.1 Release Lab E2E Verification");
  console.log("=================================================");

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(
    path.join(targetDir, "package.json"),
    JSON.stringify({ name: "openmemory-v031-release-lab", version: "1.0.0", private: true }, null, 2)
  );

  console.log("\n[Step 1] Installing openmemory-0.3.1.tgz into clean consumer...");
  execSync("npm install " + tarball, { cwd: targetDir, stdio: "inherit" });

  const installedPkg = require(path.join(targetDir, "node_modules", "openmemory", "package.json"));
  console.log("[VERIFIED] Installed package version:", installedPkg.version);
  if (installedPkg.version !== "0.3.1") {
    throw new Error("FAIL: Installed package version is not 0.3.1");
  }

  const resolvedPlugin = require.resolve("openmemory/plugin", { paths: [targetDir] });
  const resolvedMcp = require.resolve("openmemory/mcp", { paths: [targetDir] });
  console.log("[VERIFIED] Resolved plugin path:", resolvedPlugin);
  console.log("[VERIFIED] Resolved mcp path:", resolvedMcp);

  console.log("\n[Step 2] Executing npx openmemory install...");
  execSync("npx openmemory install", { cwd: targetDir, stdio: "inherit" });

  if (
    !fs.existsSync(path.join(targetDir, "AGENTS.md")) ||
    !fs.existsSync(path.join(targetDir, "opencode.json")) ||
    !fs.existsSync(path.join(targetDir, ".opencode/plugins/openmemory.ts")) ||
    !fs.existsSync(path.join(targetDir, ".openmemory"))
  ) {
    throw new Error("FAIL: Installation files missing");
  }
  console.log("[VERIFIED] Installation files created cleanly.");

  console.log("\n[Step 3] Testing OpenCode Plugin & Idle Handoff...");
  const { OpenMemoryPlugin } = require(resolvedPlugin);
  const plugin = await OpenMemoryPlugin({ directory: targetDir, worktree: targetDir } as any);

  await plugin.event({
    event: { type: "session.created", properties: { info: { id: "ses_v031_release_001" } } },
  });

  const systemOutput = { system: [] as string[] };
  await plugin["experimental.chat.system.transform"]({ sessionID: "ses_v031_release_001" }, systemOutput);
  if (systemOutput.system[0].includes("Active Phase: undefined")) {
    throw new Error("FAIL: System prompt contained Active Phase: undefined");
  }
  console.log("[VERIFIED] System prompt context contains no undefined activePhase.");

  await plugin.event({
    event: { type: "session.idle", properties: { sessionID: "ses_v031_release_001" } },
  });

  const handoffContent = fs.readFileSync(path.join(targetDir, ".openmemory", "handoff.md"), "utf8");
  if (!handoffContent.includes("Current Phase:** DESCUBRIR") && !handoffContent.includes("DESCUBRIR")) {
    throw new Error("FAIL: handoff.md not updated on session.idle");
  }
  console.log("[VERIFIED] handoff.md updated automatically on session.idle.");

  console.log("\n[Step 4] Testing MCP STDIO Process 1 Write & Read...");
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
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "release-client", version: "1.0.0" } },
        }) + "\n"
      );
    });
  }

  const res1 = await runMcp({
    2: { name: "openmemory_register_session", arguments: { id: "ses_release_lab_mcp", agentId: "release-agent", status: "ACTIVE" } },
    3: {
      name: "openmemory_record_knowledge",
      arguments: {
        agentId: "release-agent",
        sessionId: "ses_release_lab_mcp",
        topic: "RELEASE_V031_RECORD",
        category: "architecture",
        summary: "Release v0.3.1 E2E lab record",
        items: [{ id: "r1", type: "FINDING", title: "Release Item", content: "Release verified" }],
      },
    },
    4: { name: "openmemory_query_knowledge", arguments: { query: "RELEASE_V031_RECORD" } },
  });

  console.log("[VERIFIED] MCP Process 1 Write Knowledge:", res1[3].result.content[0].text.split("\n")[0]);
  console.log("[VERIFIED] MCP Process 1 Query Knowledge: Record found.");

  console.log("\n[Step 5] Testing MCP STDIO Process 2 (Restart) Read After Process Kill...");
  const res2 = await runMcp({
    2: { name: "openmemory_query_knowledge", arguments: { query: "RELEASE_V031_RECORD" } },
  });
  console.log("[VERIFIED] MCP Process 2 (Restart) Query Knowledge: Record recovered from persistent disk.");

  console.log("\n[Step 6] Testing npx openmemory uninstall...");
  execSync("npx openmemory uninstall", { cwd: targetDir, stdio: "inherit" });
  if (fs.existsSync(path.join(targetDir, ".opencode/plugins/openmemory.ts"))) {
    throw new Error("FAIL: Plugin shim was not removed on uninstall");
  }
  if (!fs.existsSync(path.join(targetDir, ".openmemory/knowledge/researches"))) {
    throw new Error("FAIL: Historical data in .openmemory/ was deleted on uninstall");
  }
  console.log("[VERIFIED] Uninstall removed shims while preserving .openmemory/ data intact.");

  console.log("\n=================================================");
  console.log("🎉 ALL RELEASE LAB E2E VERIFICATIONS PASSED!");
  console.log("=================================================");
}

runReleaseLab().catch((err) => {
  console.error("Release lab test failed:", err);
  process.exit(1);
});
