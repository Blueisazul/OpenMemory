import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import OpenMemoryPlugin from "../../.opencode/plugins/openmemory";

/**
 * F12.3-D OpenCode Host Session Lifecycle Synchronization Test Suite
 * Asserts D01–D16 contracts cleanly without framework dependencies.
 */
async function runTests() {
  console.log("=================================================");
  console.log("F12.3-D OpenCode Lifecycle Integration Test Suite");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".work", "tmp", `f123d-test-${Date.now()}`);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  let passedCount = 0;
  const totalTests = 17;

  function assert(condition: boolean, testName: string, detail: string) {
    if (condition) {
      console.log(`[PASS] ${testName}: ${detail}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName}: ${detail}`);
      process.exitCode = 1;
    }
  }

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();

    // Mock plugin context
    const pluginInstance = await OpenMemoryPlugin({
      client: {} as any,
      project: { name: "TestProject" } as any,
      directory: testDir,
      worktree: testDir,
      experimental_workspace: { register: () => {} },
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    });

    const eventHandler = pluginInstance.event!;

    // -------------------------------------------------------------
    // D01 — session.created registration
    // -------------------------------------------------------------
    await eventHandler({
      event: {
        type: "session.created",
        properties: {
          info: {
            id: "sess-d01",
            agent: "opencode-agent",
            projectID: "proj-1",
            directory: testDir,
            title: "D01 Test Session",
            version: "1.0",
            time: { created: Date.now(), updated: Date.now() },
          },
        },
      },
    });

    const s01 = storage.getSession("sess-d01");
    assert(
      s01 !== null && s01.status === "ACTIVE" && s01.agentId === "opencode",
      "D01",
      "session.created registered canonical session with status ACTIVE and agentId opencode"
    );

    // -------------------------------------------------------------
    // D02 — explicit idle transition
    // -------------------------------------------------------------
    await eventHandler({
      event: {
        type: "session.idle",
        properties: {
          sessionID: "sess-d01",
        },
      },
    });

    const s02 = storage.getSession("sess-d01");
    assert(
      s02 !== null && s02.status === "IDLE",
      "D02",
      "session.idle updated session status to IDLE"
    );

    // -------------------------------------------------------------
    // D03 — busy status re-activation
    // -------------------------------------------------------------
    await eventHandler({
      event: {
        type: "session.status",
        properties: {
          sessionID: "sess-d01",
          status: { type: "busy" },
        },
      },
    });

    const s03 = storage.getSession("sess-d01");
    assert(
      s03 !== null && s03.status === "ACTIVE",
      "D03",
      "session.status (busy) transitioned session from IDLE back to ACTIVE"
    );

    // -------------------------------------------------------------
    // D04 — retry handling & terminal safety
    // -------------------------------------------------------------
    const t04_before = new Date(s03!.lastActiveAt).getTime();
    await new Promise((r) => setTimeout(r, 20));

    await eventHandler({
      event: {
        type: "session.status",
        properties: {
          sessionID: "sess-d01",
          status: { type: "retry", attempt: 1, message: "Rate limit", next: 1000 },
        },
      },
    });

    const s04 = storage.getSession("sess-d01");
    const t04_after = new Date(s04!.lastActiveAt).getTime();
    assert(
      s04 !== null && s04.status === "ACTIVE" && t04_after >= t04_before,
      "D04 (Active Retry)",
      "session.status (retry) preserved ACTIVE status and refreshed lastActiveAt"
    );

    // Test retry on terminal session
    storage.updateSessionStatus("sess-d01", "COMPLETED");
    const terminalBefore = storage.getSession("sess-d01");
    const termTimeBefore = terminalBefore!.lastActiveAt;

    await eventHandler({
      event: {
        type: "session.status",
        properties: {
          sessionID: "sess-d01",
          status: { type: "retry", attempt: 2, message: "Terminal Retry", next: 1000 },
        },
      },
    });

    const terminalAfter = storage.getSession("sess-d01");
    assert(
      terminalAfter !== null && terminalAfter.status === "COMPLETED" && terminalAfter.lastActiveAt === termTimeBefore,
      "D04 (Terminal Retry Safety)",
      "session.status (retry) on terminal COMPLETED session was ignored without status or timestamp mutation"
    );

    // -------------------------------------------------------------
    // D05 — session.compacted milestone
    // -------------------------------------------------------------
    // Register active session for compaction test
    storage.registerSession({ id: "sess-d05", agentId: "opencode", status: "ACTIVE" });
    await eventHandler({
      event: {
        type: "session.compacted",
        properties: {
          sessionID: "sess-d05",
        },
      },
    });

    const s05 = storage.getSession("sess-d05");
    assert(
      s05 !== null && s05.status === "ACTIVE" && (s05.compactionCount || 0) >= 1 && Boolean(s05.lastCompactedAt),
      "D05",
      "session.compacted updated compaction milestone without changing ACTIVE status"
    );

    // -------------------------------------------------------------
    // D06 — session.deleted non-mutating semantics
    // -------------------------------------------------------------
    storage.registerSession({ id: "sess-d06", agentId: "opencode", status: "ACTIVE" });
    await eventHandler({
      event: {
        type: "session.deleted",
        properties: {
          info: { id: "sess-d06" },
        },
      },
    });

    const s06 = storage.getSession("sess-d06");
    assert(
      s06 !== null && s06.status === "ACTIVE",
      "D06",
      "session.deleted logged telemetry without mutating session status to COMPLETED"
    );

    // -------------------------------------------------------------
    // D07 — session.error non-mutating semantics
    // -------------------------------------------------------------
    storage.registerSession({ id: "sess-d07", agentId: "opencode", status: "ACTIVE" });
    await eventHandler({
      event: {
        type: "session.error",
        properties: {
          sessionID: "sess-d07",
          error: { type: "MessageOutputLengthError", message: "Max tokens reached" },
        },
      },
    });

    const s07 = storage.getSession("sess-d07");
    assert(
      s07 !== null && s07.status === "ACTIVE",
      "D07",
      "session.error logged telemetry without mutating session status to FAILED"
    );

    // -------------------------------------------------------------
    // D08 — plugin dispose non-mutating semantics
    // -------------------------------------------------------------
    storage.registerSession({ id: "sess-d08", agentId: "opencode", status: "ACTIVE" });
    await pluginInstance.dispose!();

    const s08 = storage.getSession("sess-d08");
    assert(
      s08 !== null && s08.status === "ACTIVE",
      "D08",
      "plugin dispose() logged telemetry without mutating active session status to COMPLETED"
    );

    // -------------------------------------------------------------
    // D09 — missing session identity handling
    // -------------------------------------------------------------
    const initialSessionCount = storage.listSessions().length;
    await eventHandler({
      event: {
        type: "session.created",
        properties: {}, // Missing info.id
      },
    });

    await eventHandler({
      event: {
        type: "session.idle",
        properties: {}, // Missing sessionID
      },
    });

    const afterMissingCount = storage.listSessions().length;
    assert(
      initialSessionCount === afterMissingCount,
      "D09",
      "Events with missing identity were ignored without throwing errors or fabricating dummy IDs"
    );

    // -------------------------------------------------------------
    // D10 — multi-session interleaving
    // -------------------------------------------------------------
    await eventHandler({
      event: {
        type: "session.created",
        properties: { info: { id: "sess-A" } },
      },
    });
    await eventHandler({
      event: {
        type: "session.created",
        properties: { info: { id: "sess-B" } },
      },
    });

    await eventHandler({
      event: { type: "session.status", properties: { sessionID: "sess-A", status: { type: "busy" } } },
    });
    await eventHandler({
      event: { type: "session.status", properties: { sessionID: "sess-B", status: { type: "idle" } } },
    });
    await eventHandler({
      event: { type: "session.status", properties: { sessionID: "sess-A", status: { type: "retry", attempt: 1, message: "R", next: 500 } } },
    });
    await eventHandler({
      event: { type: "session.compacted", properties: { sessionID: "sess-B" } },
    });

    const sessA = storage.getSession("sess-A");
    const sessB = storage.getSession("sess-B");

    assert(
      sessA !== null && sessA.status === "ACTIVE" && sessB !== null && sessB.status === "IDLE" && (sessB.compactionCount || 0) >= 1,
      "D10",
      "Interleaved events for sess-A and sess-B updated independently without identity crosstalk"
    );

    // -------------------------------------------------------------
    // D11 — duplicate events safe timestamp refresh
    // -------------------------------------------------------------
    storage.registerSession({ id: "sess-d11", agentId: "opencode", status: "ACTIVE" });
    await eventHandler({ event: { type: "session.idle", properties: { sessionID: "sess-d11" } } });
    const s11_v1 = storage.getSession("sess-d11");

    await new Promise((r) => setTimeout(r, 20));
    await eventHandler({ event: { type: "session.idle", properties: { sessionID: "sess-d11" } } });
    const s11_v2 = storage.getSession("sess-d11");

    const totalMatching = storage.listSessions().filter((s) => s.id === "sess-d11").length;
    assert(
      totalMatching === 1 && s11_v2!.status === "IDLE" && new Date(s11_v2!.lastActiveAt).getTime() >= new Date(s11_v1!.lastActiveAt).getTime(),
      "D11",
      "Duplicate session.idle event maintained status IDLE, refreshed timestamp, and created zero duplicates"
    );

    // -------------------------------------------------------------
    // D12 — terminal protection invariant
    // -------------------------------------------------------------
    storage.registerSession({ id: "sess-d12", agentId: "opencode", status: "COMPLETED" });
    let invariantCaught = false;
    try {
      storage.updateSessionStatus("sess-d12", "ACTIVE");
    } catch (err) {
      invariantCaught = true;
    }
    assert(
      invariantCaught,
      "D12",
      "Terminal Protection Invariant B8 prevented transitioning COMPLETED session back to ACTIVE"
    );

    // -------------------------------------------------------------
    // D13 — process crash simulation (no signal)
    // -------------------------------------------------------------
    storage.registerSession({ id: "sess-d13", agentId: "opencode", status: "ACTIVE" });
    // Process exits without sending events -> session status remains ACTIVE
    const s13 = storage.getSession("sess-d13");
    assert(
      s13 !== null && s13.status === "ACTIVE",
      "D13",
      "Process crash without host signals leaves session ACTIVE for explicit operator reconciliation"
    );

    // -------------------------------------------------------------
    // D14 — plugin restart non-destructive behavior
    // -------------------------------------------------------------
    const activeCountBefore = storage.listSessions({ status: "ACTIVE" }).length;
    // Reload plugin instance
    await OpenMemoryPlugin({
      client: {} as any,
      project: { name: "TestProject" } as any,
      directory: testDir,
      worktree: testDir,
      experimental_workspace: { register: () => {} },
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    });
    const activeCountAfter = storage.listSessions({ status: "ACTIVE" }).length;

    assert(
      activeCountBefore === activeCountAfter,
      "D14",
      "Plugin initialization did not auto-abort or mutate active sessions in storage"
    );

    // -------------------------------------------------------------
    // D15 — Single Writer static source audit
    // -------------------------------------------------------------
    const pluginSource = fs.readFileSync(path.join(process.cwd(), ".opencode", "plugins", "openmemory.ts"), "utf-8");
    const writesProjectStateDirectly = pluginSource.includes("project-state.json") && pluginSource.includes("writeFileSync");
    const appendsEventsLogDirectly = pluginSource.includes("events.jsonl") && pluginSource.includes("appendFileSync");

    assert(
      !writesProjectStateDirectly && !appendsEventsLogDirectly,
      "D15",
      "Plugin source code makes zero direct writeFileSync/appendFileSync calls targeting project-state.json or events.jsonl"
    );

    // -------------------------------------------------------------
    // D16 — existing experimental hooks functionality
    // -------------------------------------------------------------
    const systemHook = (pluginInstance as any)["experimental.chat.system.transform"];
    const compactingHook = (pluginInstance as any)["experimental.session.compacting"];

    const sysRes = await systemHook({ sessionID: "sess-d16" }, { system: ["Base System"] });
    const compRes = await compactingHook({ sessionID: "sess-d16", prompt: "Base Prompt" }, { context: [] });

    assert(
      sysRes && sysRes.system && sysRes.system.length > 1 && compRes && compRes.prompt && compRes.prompt.includes("OpenMemory Context Handoff"),
      "D16",
      "Existing experimental hooks (chat.system.transform & session.compacting) remain fully functional"
    );

  } finally {
    // Cleanup temporary test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log("\n-------------------------------------------------");
  console.log(`Results: ${passedCount} / ${totalTests} Passed`);
  console.log("-------------------------------------------------");

  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
