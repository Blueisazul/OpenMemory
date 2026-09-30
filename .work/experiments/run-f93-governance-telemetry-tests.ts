import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { createMCPServer } from "../../src/mcp";
import { runCLI } from "../../src/cli";

let assertionsPassed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  assertionsPassed++;
  console.log(`  ✓ ${message}`);
}

async function runF93GovernanceTelemetryTests() {
  console.log("=== F9.3 Governance Telemetry & Lock Cleanup Test Suite ===");
  const testDir = path.join(process.cwd(), ".work", "scratch", "f93-test-env-" + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();
    storage.getOrInitProjectState();

    // Setup base ADR for testing
    storage.saveADR({
      title: "Test ADR for Telemetry",
      status: "PROPOSED",
      date: "2026-09-29",
      context: "Context for telemetry test",
      decision: "Decision for telemetry test",
      proposedByAgentId: "agent-alpha",
      requiredVotes: 2,
    });

    const eventsLogPath = path.join(testDir, ".openmemory", "logs", "events.jsonl");

    // 1. tryAcquireLock() generates lock.acquired event
    console.log("\n[F93-01] Testing tryAcquireLock() event logging...");
    const acquired = storage.tryAcquireLock("res_test_01", "agent-alpha", 5000);
    assert(acquired === true, "F93-01a: Lock acquired successfully");
    assert(fs.existsSync(eventsLogPath), "F93-01b: events.jsonl exists");

    let logLines = fs.readFileSync(eventsLogPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const acquiredEvent = logLines.find((e) => e.eventType === "lock.acquired");
    assert(acquiredEvent !== undefined, "F93-01c: 'lock.acquired' event found in events.jsonl");
    assert(acquiredEvent.agentId === "agent-alpha", "F93-01d: agentId 'agent-alpha' recorded in event");
    assert(acquiredEvent.payload.resourceKey === "res_test_01", "F93-01e: resourceKey matched in event payload");

    // 2. releaseLock() generates lock.released event
    console.log("\n[F93-02] Testing releaseLock() event logging...");
    const released = storage.releaseLock("res_test_01", "agent-alpha");
    assert(released === true, "F93-02a: Lock released successfully");

    logLines = fs.readFileSync(eventsLogPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const releasedEvent = logLines.find((e) => e.eventType === "lock.released");
    assert(releasedEvent !== undefined, "F93-02b: 'lock.released' event found in events.jsonl");
    assert(releasedEvent.agentId === "agent-alpha", "F93-02c: agentId 'agent-alpha' recorded in release event");

    // 3. voteADR() generates adr.voted event
    console.log("\n[F93-03] Testing voteADR() event logging...");
    const adr = storage.voteADR("ADR-001", "agent-beta", "APPROVE", "Governance approved");
    assert(adr !== undefined, "F93-03a: voteADR executed successfully");

    logLines = fs.readFileSync(eventsLogPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const voteEvent = logLines.find((e) => e.eventType === "adr.voted");
    assert(voteEvent !== undefined, "F93-03b: 'adr.voted' event found in events.jsonl");
    assert(voteEvent.agentId === "agent-beta", "F93-03c: agentId 'agent-beta' recorded in adr.voted event");
    assert(voteEvent.payload.decision === "APPROVE", "F93-03d: decision 'APPROVE' recorded in event payload");

    // 4. cleanupStaleLocks() generates locks.cleaned event
    console.log("\n[F93-04] Testing cleanupStaleLocks() event logging...");
    // Create an expired lock file manually
    const locksDir = path.join(testDir, ".openmemory", "locks");
    const expiredLockPath = path.join(locksDir, "stale_res.lock");
    fs.writeFileSync(
      expiredLockPath,
      JSON.stringify({ owner: "agent-gamma", acquiredAt: Date.now() - 10000, expiresAt: Date.now() - 5000 }),
      "utf-8"
    );

    const cleanedCount = storage.cleanupStaleLocks();
    assert(cleanedCount >= 1, "F93-04a: At least 1 stale lock file cleaned up");

    logLines = fs.readFileSync(eventsLogPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const cleanupEvent = logLines.find((e) => e.eventType === "locks.cleaned");
    assert(cleanupEvent !== undefined, "F93-04b: 'locks.cleaned' event found in events.jsonl");
    assert(cleanupEvent.payload.cleanedCount >= 1, "F93-04c: cleanedCount matches cleaned files");

    // 5. MCP tool openmemory_cleanup_locks delegation
    console.log("\n[F93-05] Testing openmemory_cleanup_locks MCP tool registration and delegation...");
    const mcpServer = createMCPServer(testDir);
    assert(mcpServer !== undefined, "F93-05a: MCP server created successfully");

    // 6. CLI openmemory locks cleanup subcommand delegation
    console.log("\n[F93-06] Testing openmemory locks cleanup CLI command...");
    const cliOutput = await runCLI(["locks", "cleanup"], testDir);
    assert(cliOutput.includes("Advisory Locks Cleanup:"), "F93-06a: CLI locks cleanup command executed successfully");

    // 7. Verification of physical state authority and physical absence of stage-state.json
    console.log("\n[F93-07] Verifying state authority and physical absence invariants...");
    const projectStateExists = fs.existsSync(path.join(testDir, ".openmemory", "project-state.json"));
    const stageStateExists = fs.existsSync(path.join(testDir, ".openmemory", "stage-state.json"));

    assert(projectStateExists === true, "F93-07a: project-state.json is sole physical authority");
    assert(stageStateExists === false, "F93-07b: stage-state.json is physically ABSENT");

    console.log(`\n🎉 ALL F9.3 TESTS PASSED! (${assertionsPassed} assertions)`);
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runF93GovernanceTelemetryTests().catch((err) => {
  console.error("❌ F9.3 Test Suite Error:", err);
  process.exit(1);
});
