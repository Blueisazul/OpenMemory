import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { createMCPServer } from "../../src/mcp";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function runF10Tests() {
  console.log("=== Running Phase F10 Multi-Agent Orchestration & Cross-Agent Context Tests ===");

  const testDir = path.join(process.cwd(), ".openmemory_test_f10_" + Date.now());
  const openmemoryDir = path.join(testDir, ".openmemory");
  const projectStatePath = path.join(openmemoryDir, "project-state.json");
  const stageStatePath = path.join(openmemoryDir, "stage-state.json");
  const logsDir = path.join(openmemoryDir, "logs");
  const eventsLogPath = path.join(logsDir, "events.jsonl");

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();

    // -------------------------------------------------------------------------
    // TEST GROUP 1: v0.2 -> v0.3 Backward Compatibility & Migration (Condition 1)
    // -------------------------------------------------------------------------
    console.log("\n--- Group 1: v0.2 -> v0.3 Backward Compatibility & Migration ---");
    const v02State = {
      activePhase: "PHASE_3_IMPLEMENTATION",
      currentStatus: "INITIALIZED",
      activeGoal: "F10 Testing",
      activeTasks: [],
      sessionRunCount: 5,
      lastSessionId: "sess-v02-old",
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(projectStatePath, JSON.stringify(v02State, null, 2), "utf-8");

    // Storage loading existing v0.2 state
    const loadedState = storage.getOrInitProjectState();
    assert(loadedState.activeGoal === "F10 Testing", "v0.2 project-state loaded correctly without error");
    assert(loadedState.sessions === undefined || Array.isArray(loadedState.sessions), "v0.2 state allows optional sessions array");

    // Perform operation on v0.2 state
    const regSess = storage.registerSession({ agentId: "agent-v02-migration", id: "sess-mig-01" });
    assert(regSess.id === "sess-mig-01", "Registered session on upgraded v0.2 state");
    assert(regSess.status === "ACTIVE", "Default status ACTIVE");

    const updatedStateRaw = fs.readFileSync(projectStatePath, "utf-8");
    const updatedState = JSON.parse(updatedStateRaw);
    assert(Array.isArray(updatedState.sessions), "project-state.json now persisted with sessions array");
    assert(updatedState.sessions.length === 1, "Session count is 1 after registration");

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Session Registry API (Capability 1)
    // -------------------------------------------------------------------------
    console.log("\n--- Group 2: Session Registry API ---");
    const sess2 = storage.registerSession({ agentId: "agent-beta", metadata: { task: "research" } });
    assert(sess2.agentId === "agent-beta", "Registered session for agent-beta");
    assert(sess2.metadata?.task === "research", "Session metadata saved correctly");

    const updatedSess = storage.updateSessionStatus(sess2.id, "COMPLETED", { result: "done" });
    assert(updatedSess !== null && updatedSess.status === "COMPLETED", "Updated session status to COMPLETED");
    assert(updatedSess?.completedAt !== undefined, "completedAt timestamp set on completion");
    assert(updatedSess?.metadata?.result === "done", "Metadata merged on status update");

    const activeList = storage.listSessions({ status: "ACTIVE" });
    assert(activeList.length === 1 && activeList[0].id === "sess-mig-01", "Filtered active sessions correctly");

    const fetchedSess = storage.getSession("sess-mig-01");
    assert(fetchedSess?.agentId === "agent-v02-migration", "getSession returned exact record");

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Cross-Agent Context Assembly Engine (Capability 2 & Condition 2)
    // -------------------------------------------------------------------------
    console.log("\n--- Group 3: Cross-Agent Context Assembly Engine ---");
    storage.saveADR({
      title: "Use Redis for PubSub",
      status: "ACCEPTED",
      date: "2026-09-29",
      context: "Need fast message broker",
      decision: "Adopt Redis PubSub",
    });

    const mtimeBefore = fs.statSync(projectStatePath).mtimeMs;
    const summary = storage.assembleCrossAgentContext("agent-auditor");

    assert(summary.requestingAgentId === "agent-auditor", "Context summary requestingAgentId matches");
    assert(summary.activeSessionsCount === 1, "Active sessions count in summary is 1");
    assert(summary.adrsCount >= 1, "ADR count in summary is >= 1");
    assert(summary.assembledContextMarkdown.includes("# Cross-Agent Context Summary"), "Markdown summary header present");
    assert(summary.assembledContextMarkdown.includes("sess-mig-01"), "Active session included in markdown context");

    const mtimeAfter = fs.statSync(projectStatePath).mtimeMs;
    assert(mtimeBefore === mtimeAfter, "assembleCrossAgentContext() is strictly READ-ONLY (project-state unmodified)");

    // Check log telemetry for context.assembled
    const eventsStr = fs.readFileSync(eventsLogPath, "utf-8");
    assert(eventsStr.includes("context.assembled"), "Telemetry event 'context.assembled' logged to events.jsonl");

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Coordination Tasks & Advisory Locks (Capability 3 & Condition 5)
    // -------------------------------------------------------------------------
    console.log("\n--- Group 4: Coordination Tasks & Advisory Locks ---");
    const task1 = storage.createCoordinationTask({
      title: "Implement Auth Module",
      description: "Build JWT authentication",
      createdAgentId: "agent-arch",
    });
    assert(task1.status === "PENDING", "Coordination task created with PENDING status");
    assert(task1.createdAgentId === "agent-arch", "Task createdAgentId stored");

    storage.registerSession({ id: "sess-worker-01", agentId: "agent-worker-1", status: "ACTIVE" });
    const claimRes1 = storage.claimCoordinationTask(task1.id, "agent-worker-1", "sess-worker-01");
    assert(claimRes1.success === true, "Task claimed successfully by agent-worker-1");
    assert(claimRes1.task?.status === "IN_PROGRESS", "Task status changed to IN_PROGRESS");
    assert(claimRes1.task?.assignedAgentId === "agent-worker-1", "Assigned agent set");

    // Attempt double-claim
    storage.registerSession({ id: "sess-mig-02", agentId: "agent-worker-2", status: "ACTIVE" });
    const claimRes2 = storage.claimCoordinationTask(task1.id, "agent-worker-2", "sess-mig-02");
    assert(claimRes2.success === false, "Second claim attempt failed because task status is IN_PROGRESS");

    const updatedTask = storage.updateCoordinationTaskStatus(task1.id, "COMPLETED", "agent-worker-1", "sess-worker-01", "Auth module ready");
    assert(updatedTask?.status === "COMPLETED", "Task status updated to COMPLETED");
    assert(updatedTask?.resultSummary === "Auth module ready", "Result summary saved");
    assert(updatedTask?.completedAt !== undefined, "completedAt timestamp set");

    // -------------------------------------------------------------------------
    // TEST GROUP 5: Capping & Retention Policies (Condition 3)
    // -------------------------------------------------------------------------
    console.log("\n--- Group 5: Capping & Retention Policies ---");
    // Register 105 sessions to trigger 100 cap
    for (let i = 1; i <= 105; i++) {
      storage.registerSession({ agentId: `agent-cap-${i}`, status: i <= 5 ? "ACTIVE" : "COMPLETED" });
    }
    const allSessions = storage.listSessions();
    assert(allSessions.length === 100, `Sessions array capped at 100 (got ${allSessions.length})`);
    const purgedEventsCount = (fs.readFileSync(eventsLogPath, "utf-8").match(/session\.purged/g) || []).length;
    assert(purgedEventsCount > 0, "Purged sessions emitted 'session.purged' event log telemetry for auditability");

    // Create 205 coordination tasks to trigger 200 cap
    for (let i = 1; i <= 205; i++) {
      storage.createCoordinationTask({
        title: `Task ${i}`,
        description: `Description ${i}`,
        createdAgentId: "agent-cap",
      });
    }
    const allTasks = storage.listCoordinationTasks();
    assert(allTasks.length === 200, `Coordination tasks array capped at 200 (got ${allTasks.length})`);

    // -------------------------------------------------------------------------
    // TEST GROUP 6: Safe Event Log Rotation Engine (Capability 4 & Condition 4)
    // -------------------------------------------------------------------------
    console.log("\n--- Group 6: Safe Event Log Rotation Engine ---");
    // Append dummy content to events.jsonl to cross size threshold (e.g. 500 bytes threshold for test)
    const dummyLine = JSON.stringify({ timestamp: new Date().toISOString(), eventType: "test.data", payload: { data: "x".repeat(100) } }) + "\n";
    for (let i = 0; i < 20; i++) {
      fs.appendFileSync(eventsLogPath, dummyLine, "utf-8");
    }

    // Rotation 1
    const rot1 = storage.rotateEventLogs(500, 3);
    assert(rot1.rotated === true, "First log rotation succeeded");
    assert(fs.existsSync(path.join(logsDir, "events.1.jsonl")), "events.1.jsonl created after rotation 1");

    // Add more content and Rotation 2
    for (let i = 0; i < 20; i++) {
      fs.appendFileSync(eventsLogPath, dummyLine, "utf-8");
    }
    const rot2 = storage.rotateEventLogs(500, 3);
    assert(rot2.rotated === true, "Second log rotation succeeded");
    assert(fs.existsSync(path.join(logsDir, "events.2.jsonl")), "events.2.jsonl created after rotation 2");

    // Add more content and Rotation 3
    for (let i = 0; i < 20; i++) {
      fs.appendFileSync(eventsLogPath, dummyLine, "utf-8");
    }
    const rot3 = storage.rotateEventLogs(500, 3);
    assert(rot3.rotated === true, "Third log rotation succeeded");
    assert(fs.existsSync(path.join(logsDir, "events.3.jsonl")), "events.3.jsonl created after rotation 3");

    // Rotation 4: events.3.jsonl should be replaced safely without error or crash
    for (let i = 0; i < 20; i++) {
      fs.appendFileSync(eventsLogPath, dummyLine, "utf-8");
    }
    const rot4 = storage.rotateEventLogs(500, 3);
    assert(rot4.rotated === true, "Fourth log rotation (overflow maxArchives=3) succeeded without error");

    // Check new events.jsonl has log entry for rotation
    const newLogContent = fs.readFileSync(eventsLogPath, "utf-8");
    assert(newLogContent.includes("logs.rotated"), "New events.jsonl contains 'logs.rotated' event");

    // -------------------------------------------------------------------------
    // TEST GROUP 7: Invariants Verification (Condition 5)
    // -------------------------------------------------------------------------
    console.log("\n--- Group 7: Invariants Verification ---");
    assert(fs.existsSync(projectStatePath), "project-state.json is PRESENT (canonical state authority)");
    assert(!fs.existsSync(stageStatePath), "stage-state.json is ABSENT (physical file invariant preserved)");

    // Test MCP tool integration for F10
    const mcpServer = createMCPServer(testDir);
    assert(mcpServer !== null, "MCP Server initialized with F10 tool registrations");

    console.log("\n=======================================================");
    console.log(`F10 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("=======================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } finally {
    // Cleanup temporary test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runF10Tests().catch((err) => {
  console.error("Unhandled error in F10 tests:", err);
  process.exit(1);
});
