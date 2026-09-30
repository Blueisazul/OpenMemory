import * as fs from "fs";
import * as path from "path";
import assert from "assert";
import { StorageEngine, SessionRecord, SessionStatus } from "../../src/storage";

async function runF122SessionContractTests() {
  console.log("=================================================================");
  console.log("=== F12.2 Session Contract 2.0 & Alignment Test Suite        ===");
  console.log("=================================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f122");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const storage = new StorageEngine(testDir);
  storage.ensureStorageStructure();

  try {
    // -----------------------------------------------------------------
    // Scenario 1 & 2: V1 -> V2 Session Normalization & Missing Status
    // -----------------------------------------------------------------
    console.log("[EXECUTED] Test 01: V1 Session Normalization & Missing Status Default");
    const projectStatePath = path.join(testDir, ".openmemory", "project-state.json");
    const rawV1State = {
      currentStage: "IMPLEMENTAR",
      currentStatus: "INITIALIZED",
      activeGoal: "F12.2 Testing",
      activeTasks: [],
      sessionRunCount: 1,
      lastSessionId: "sess-v1-old",
      lastUpdated: new Date().toISOString(),
      roadmap: { activePhaseId: "PHASE-1", phases: [] },
      sessions: [
        {
          id: "sess-v1-old",
          agentId: "agent-v1",
          startedAt: "2026-09-28T10:00:00.000Z",
          lastActiveAt: "2026-09-28T10:05:00.000Z",
          // Prohibited fields to test strict pruning:
          currentStage: "IMPLEMENTAR",
          activePhaseId: "PHASE-1",
          assignedTaskId: "TASK-99",
          adrsCreated: ["ADR-001"],
          researchesCreated: ["RES-001"],
          locksAcquired: ["lock-key-1"],
          parentSessionId: "sess-parent",
          forkDepth: 2,
        },
      ],
    };
    fs.writeFileSync(projectStatePath, JSON.stringify(rawV1State, null, 2), "utf-8");

    const state1 = storage.getOrInitProjectState();
    const session1 = state1.sessions?.find(s => s.id === "sess-v1-old");

    assert(session1 !== undefined, "[PASS] V1 Session loaded");
    assert(session1?.status === "ACTIVE", "[PASS] Missing status defaulted to ACTIVE");
    assert(!("currentStage" in (session1 as any)), "[PASS] Legacy currentStage strictly pruned from Session object");
    assert(!("activePhaseId" in (session1 as any)), "[PASS] Legacy activePhaseId strictly pruned from Session object");
    assert(!("assignedTaskId" in (session1 as any)), "[PASS] Prohibited assignedTaskId strictly pruned");
    assert(!("adrsCreated" in (session1 as any)), "[PASS] Prohibited adrsCreated strictly pruned");
    assert(!("researchesCreated" in (session1 as any)), "[PASS] Prohibited researchesCreated strictly pruned");
    assert(!("locksAcquired" in (session1 as any)), "[PASS] Prohibited locksAcquired strictly pruned");

    // -----------------------------------------------------------------
    // Scenario 3 & 4: Host ID & Provenance Snapshot at Creation
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 02: Host ID & Provenance Snapshot at Creation");
    const registered = storage.registerSession({
      id: "sess-v2-001",
      agentId: "agent-beta",
      hostId: "opencode",
      status: "ACTIVE",
    });

    assert(registered.hostId === "opencode", "[PASS] hostId 'opencode' stored successfully");
    assert(registered.provenance?.workflowStageAtCreation === "IMPLEMENTAR", "[PASS] Provenance workflowStageAtCreation captured snapshot");
    assert(registered.provenance?.roadmapPhaseAtCreation === "PHASE-1", "[PASS] Provenance roadmapPhaseAtCreation captured snapshot");

    // -----------------------------------------------------------------
    // Scenario 5 & 6: Provenance Immutability across State Transitions
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 03: Provenance Immutability Across State Transitions");
    const freshState = storage.getOrInitProjectState();
    freshState.currentStage = "VALIDAR";
    storage.saveProjectState(freshState);

    const reloaded = storage.getSession("sess-v2-001");
    assert(reloaded?.provenance?.workflowStageAtCreation === "IMPLEMENTAR", "[PASS] Provenance snapshot remained IMMUTABLE when currentStage changed");

    // -----------------------------------------------------------------
    // Scenario 7 & 8: Terminal State Protection (Invariant B8)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 04: Terminal State Protection (Invariant B8)");
    const completedSession = storage.updateSessionStatus("sess-v2-001", "COMPLETED");
    assert(completedSession?.status === "COMPLETED", "[PASS] Updated status to COMPLETED");
    assert(completedSession?.completedAt !== undefined, "[PASS] completedAt timestamp automatically recorded");

    let terminalProtectionTriggered = false;
    try {
      storage.updateSessionStatus("sess-v2-001", "ACTIVE");
    } catch (err: any) {
      terminalProtectionTriggered = err.message.includes("Cannot transition session");
    }
    assert(terminalProtectionTriggered, "[PASS] Transitioning COMPLETED session back to ACTIVE correctly rejected (Invariant B8)");

    // -----------------------------------------------------------------
    // Scenario 9: Compaction Milestone Metadata
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 05: Compaction Milestone Metadata");
    const activeSess = storage.registerSession({ agentId: "agent-gamma", id: "sess-v2-compact" });
    storage.updateSessionStatus("sess-v2-compact", "COMPACTED");
    const compacted = storage.getSession("sess-v2-compact");

    assert(compacted?.lastCompactedAt !== undefined, "[PASS] lastCompactedAt timestamp recorded");
    assert(compacted?.compactionCount === 1, "[PASS] compactionCount incremented to 1");
    assert(compacted?.status === "ACTIVE", "[PASS] Compaction preserves ACTIVE status (not a terminal lifecycle state)");

    // -----------------------------------------------------------------
    // Scenario 10, 11, 12, 13, 14, 15: Derived Query Helpers (No Duplication)
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 06: Derived Query Helpers for Tasks, ADRs, Research");
    const task = storage.createCoordinationTask({
      title: "Task assigned to session",
      description: "Test task",
      createdAgentId: "agent-gamma",
    });
    storage.claimCoordinationTask(task.id, "agent-gamma", "sess-v2-compact");

    const resRecord = storage.saveResearch({
      id: "res-v2-001",
      topic: "Session Research",
      category: "ARCH",
      summary: "Summary of research",
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentId: "agent-gamma",
      sessionId: "sess-v2-compact",
      items: [],
    });

    const tasksForSess = storage.getTasksForSession("sess-v2-compact");
    assert(tasksForSess.length === 1 && tasksForSess[0].id === task.id, "[PASS] getTasksForSession() derived tasks dynamically");

    const resForSess = storage.getResearchesForSession("sess-v2-compact");
    assert(resForSess.length === 1 && resForSess[0].id === "res-v2-001", "[PASS] getResearchesForSession() derived research records dynamically");

    // Check disk JSON has 0 duplicated relationship arrays on session object
    const diskJsonRaw = fs.readFileSync(projectStatePath, "utf-8");
    const diskJson = JSON.parse(diskJsonRaw);
    const compactDiskSess = diskJson.sessions.find((s: any) => s.id === "sess-v2-compact");

    assert(!("assignedTaskId" in compactDiskSess), "[PASS] project-state.json has 0 assignedTaskId on session");
    assert(!("adrsCreated" in compactDiskSess), "[PASS] project-state.json has 0 adrsCreated array on session");
    assert(!("researchesCreated" in compactDiskSess), "[PASS] project-state.json has 0 researchesCreated array on session");
    assert(!("locksAcquired" in compactDiskSess), "[PASS] project-state.json has 0 locksAcquired array on session");

    // -----------------------------------------------------------------
    // Scenario 16: Session Capping Retention & Purge Telemetry
    // -----------------------------------------------------------------
    console.log("\n[EXECUTED] Test 07: Session Capping Retention & Purge Telemetry");
    for (let i = 0; i < 105; i++) {
      storage.registerSession({ agentId: `agent-cap-${i}`, status: i % 2 === 0 ? "COMPLETED" : "ACTIVE" });
    }
    const cappedState = storage.getOrInitProjectState();
    assert(cappedState.sessions!.length <= 100, "[PASS] ProjectState.sessions array capped at <= 100 entries");

    const eventsLogPath = path.join(testDir, ".openmemory", "logs", "events.jsonl");
    const eventsContent = fs.readFileSync(eventsLogPath, "utf-8");
    assert(eventsContent.includes("session.purged"), "[PASS] Purging emitted session.purged telemetry event");

    console.log("\n=================================================================");
    console.log("=== F12.2 Session Contract 2.0 Test Suite COMPLETE: 25/25 PASS ===");
    console.log("=================================================================\n");
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runF122SessionContractTests().catch((err) => {
  console.error("F12.2 Session Contract Test Suite Failed:", err);
  process.exit(1);
});
