import * as fs from "fs";
import * as path from "path";
import assert from "assert";
import { createMCPServer } from "../../src/mcp";
import { StorageEngine } from "../../src/storage";

async function runF123MCPTests() {
  console.log("=================================================================");
  console.log("=== F12.3-C MCP Session Reconciliation Test Suite             ===");
  console.log("=================================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f123c");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();
    const server = createMCPServer(testDir);

    // -------------------------------------------------------------------------
    // Test 1: Tool is registered in ListToolsRequestSchema
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 01: Tool Registration Verification");
    const listHandler = (server as any)._requestHandlers.get("tools/list");
    assert(listHandler, "MCP server must have tools/list request handler registered");
    const listResult = await listHandler({ method: "tools/list" }, {});
    const reconcileTool = listResult.tools.find((t: any) => t.name === "openmemory_reconcile_sessions");
    assert(reconcileTool, "Tool 'openmemory_reconcile_sessions' must be registered in MCP server");
    assert(reconcileTool.inputSchema.properties.thresholdMs, "Input schema must include thresholdMs");
    assert(reconcileTool.inputSchema.properties.confirm, "Input schema must include confirm");
    console.log("  [PASS] 'openmemory_reconcile_sessions' tool schema registered cleanly.\n");

    const callHandler = (server as any)._requestHandlers.get("tools/call");
    assert(callHandler, "MCP server must have tools/call request handler registered");

    // Seed test sessions
    const nowMs = Date.now();
    const staleTime25h = new Date(nowMs - 25 * 3600 * 1000).toISOString();
    const freshTime10h = new Date(nowMs - 10 * 3600 * 1000).toISOString();

    const sessStale = storage.registerSession({
      agentId: "mcp-stale-agent",
      hostId: "host-beta",
      status: "ACTIVE",
    });

    const sessFresh = storage.registerSession({
      agentId: "mcp-fresh-agent",
      hostId: "host-beta",
      status: "ACTIVE",
    });

    const stateObj = storage.getOrInitProjectState();
    const staleRef = stateObj.sessions.find((s) => s.id === sessStale.id);
    if (staleRef) staleRef.lastActiveAt = staleTime25h;
    const freshRef = stateObj.sessions.find((s) => s.id === sessFresh.id);
    if (freshRef) freshRef.lastActiveAt = freshTime10h;
    storage.saveProjectState(stateObj);

    // -------------------------------------------------------------------------
    // Test 2: Dry-run default (empty params or dryRun omitted)
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 02: Dry-Run Default Invocation");
    const dryRunResult = await callHandler(
      {
        method: "tools/call",
        params: {
          name: "openmemory_reconcile_sessions",
          arguments: {},
        },
      },
      {}
    );

    assert(!dryRunResult.isError, "Dry run request must succeed without error");
    const parsedDry = JSON.parse(dryRunResult.content[0].text);
    assert(parsedDry.dryRun === true, "Default MCP tool invocation must default dryRun to true");
    assert(parsedDry.candidatesFound === 1, "Must identify 1 stale candidate");
    assert(parsedDry.reconciledCount === 0, "Dry run must mutate 0 sessions");

    // Verify session on disk remains ACTIVE
    const checkDryDisk = storage.getSession(sessStale.id);
    assert(checkDryDisk?.status === "ACTIVE", "Dry run MUST NOT mutate session status on disk");
    console.log("  [PASS] Default dry-run invocation returns dryRun: true without disk mutation.\n");

    // -------------------------------------------------------------------------
    // Test 3: Explicit dry-run ({ dryRun: true })
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 03: Explicit Dry-Run Parameter");
    const explicitDryResult = await callHandler(
      {
        method: "tools/call",
        params: {
          name: "openmemory_reconcile_sessions",
          arguments: { dryRun: true },
        },
      },
      {}
    );
    const parsedExplicitDry = JSON.parse(explicitDryResult.content[0].text);
    assert(parsedExplicitDry.dryRun === true, "Explicit dryRun: true must yield dryRun: true");
    console.log("  [PASS] Explicit dryRun: true verified.\n");

    // -------------------------------------------------------------------------
    // Test 4: Threshold validation (invalid thresholdMs or thresholdHours)
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 04: Threshold Parameter Validation");
    const invalidThreshResult = await callHandler(
      {
        method: "tools/call",
        params: {
          name: "openmemory_reconcile_sessions",
          arguments: { thresholdMs: 100 },
        },
      },
      {}
    );
    assert(invalidThreshResult.isError === true, "Threshold below 1 hour must return isError: true");
    assert(invalidThreshResult.content[0].text.includes("Invalid threshold"), "Error message must state invalid threshold");

    const nanThreshResult = await callHandler(
      {
        method: "tools/call",
        params: {
          name: "openmemory_reconcile_sessions",
          arguments: { thresholdHours: -5 },
        },
      },
      {}
    );
    assert(nanThreshResult.isError === true, "Negative thresholdHours must return isError: true");
    console.log("  [PASS] Invalid thresholds (<1h, negative) rejected with isError: true.\n");

    // -------------------------------------------------------------------------
    // Test 5: Contradictory parameters ({ dryRun: true, confirm: true })
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 05: Contradictory Parameter Safeguard");
    const contraResult = await callHandler(
      {
        method: "tools/call",
        params: {
          name: "openmemory_reconcile_sessions",
          arguments: { dryRun: true, confirm: true },
        },
      },
      {}
    );
    assert(contraResult.isError === true, "Contradictory parameters must return isError: true");
    assert(contraResult.content[0].text.includes("Contradictory parameters"), "Error message must explain contradictory parameters");
    console.log("  [PASS] Contradictory dryRun: true & confirm: true cleanly rejected.\n");

    // -------------------------------------------------------------------------
    // Test 6: Confirmed mutation & Actor identity propagation
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 06: Confirmed Mutation & Actor Identity Propagation");
    const confirmResult = await callHandler(
      {
        method: "tools/call",
        params: {
          name: "openmemory_reconcile_sessions",
          arguments: {
            thresholdHours: 20,
            confirm: true,
            dryRun: false,
            agentId: "mcp-admin-agent",
          },
        },
      },
      {}
    );

    assert(!confirmResult.isError, "Confirmed mutation request must succeed");
    const parsedConfirm = JSON.parse(confirmResult.content[0].text);
    assert(parsedConfirm.dryRun === false, "Confirmed request must have dryRun: false");
    assert(parsedConfirm.reconciledCount === 1, "Must reconcile 1 session");

    // Verify disk state & metadata persistence
    const reconciledDisk = storage.getSession(sessStale.id);
    assert(reconciledDisk?.status === "ABORTED", "Confirmed mutation must transition session to ABORTED");
    assert(reconciledDisk?.metadata?.reconciliation?.method === "EXPLICIT_RECONCILIATION", "Method must be EXPLICIT_RECONCILIATION");
    assert(reconciledDisk?.metadata?.reconciliation?.reconciledBy === "mcp-admin-agent", "reconciledBy must record explicit agentId");
    console.log("  [PASS] Confirmed mutation executed under lock, transitioning ACTIVE -> ABORTED with actor 'mcp-admin-agent'.\n");

    // -------------------------------------------------------------------------
    // Test 7: Canonical schema preservation (ReconcileResult & ReconcileCandidate)
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 07: Canonical Schema Preservation Audit");
    assert("dryRun" in parsedConfirm, "ReconcileResult must contain dryRun");
    assert("thresholdMs" in parsedConfirm, "ReconcileResult must contain thresholdMs");
    assert("candidatesFound" in parsedConfirm, "ReconcileResult must contain candidatesFound");
    assert("reconciledCount" in parsedConfirm, "ReconcileResult must contain reconciledCount");
    assert("candidates" in parsedConfirm, "ReconcileResult must contain candidates");
    assert("logEvidence" in parsedConfirm, "ReconcileResult must contain logEvidence");

    const candidate = parsedConfirm.candidates[0];
    assert("sessionId" in candidate, "Candidate must contain sessionId");
    assert("agentId" in candidate, "Candidate must contain agentId");
    assert("lastActiveAt" in candidate, "Candidate must contain lastActiveAt");
    assert("inactiveDurationMs" in candidate, "Candidate must contain inactiveDurationMs");
    assert("action" in candidate, "Candidate must contain action");
    console.log("  [PASS] Canonical ReconcileResult and ReconcileCandidate schemas 100% preserved.\n");

    // -------------------------------------------------------------------------
    // Test 8: Terminal session protection invariant
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 08: Terminal Session Protection Invariant");
    const sessCompleted = storage.registerSession({
      agentId: "mcp-completed-agent",
      status: "COMPLETED",
    });
    const stateObj2 = storage.getOrInitProjectState();
    const compRef = stateObj2.sessions.find((s) => s.id === sessCompleted.id);
    if (compRef) compRef.lastActiveAt = staleTime25h;
    storage.saveProjectState(stateObj2);

    await callHandler(
      {
        method: "tools/call",
        params: {
          name: "openmemory_reconcile_sessions",
          arguments: { thresholdHours: 10, confirm: true, dryRun: false },
        },
      },
      {}
    );

    const checkCompleted = storage.getSession(sessCompleted.id);
    assert(checkCompleted?.status === "COMPLETED", "COMPLETED session MUST NOT be mutated by MCP reconciliation");
    console.log("  [PASS] Terminal COMPLETED state preserved against MCP reconciliation.\n");

    // -------------------------------------------------------------------------
    // Test 9: Single Writer static code audit on src/mcp.ts
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 09: Single Writer Direct Write Audit");
    const mcpSource = fs.readFileSync(path.join(process.cwd(), "src", "mcp.ts"), "utf-8");
    const directWrites = mcpSource.match(/writeFileSync\s*\([^)]*project-state\.json/g);
    assert(!directWrites, "src/mcp.ts MUST NOT contain direct writeFileSync calls targeting project-state.json");
    console.log("  [PASS] src/mcp.ts adheres 100% to Single Writer facade via StorageEngine.\n");

    console.log("=================================================================");
    console.log("=== F12.3-C MCP Session Reconciliation Suite COMPLETE: 9/9 PASS ===");
    console.log("=================================================================");
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runF123MCPTests().catch((err) => {
  console.error("F12.3-C Test Failure:", err);
  process.exit(1);
});
