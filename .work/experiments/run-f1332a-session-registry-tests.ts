import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";

const testDir = path.join(process.cwd(), ".openmemory_test_f1332a");

function setupTestEnv() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
}

function cleanupTestEnv() {
  if (fs.existsSync(testDir)) {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

async function runF1332aSessionRegistrySuite() {
  console.log("=================================================");
  console.log("🧪 RUNNING F13.3.2-A SESSION REGISTRY CHARACTERIZATION SUITE");
  console.log("=================================================\n");

  setupTestEnv();

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();

    // -------------------------------------------------------------------------
    // 1. SESSION CREATION & DEFAULTS
    // -------------------------------------------------------------------------
    console.log("--- 1. Session Creation & Defaults ---");
    const session1 = storage.registerSession({
      agentId: "agent-alpha",
      metadata: { env: "test" },
    });

    if (!session1.id || !session1.id.startsWith("sess-agent-alpha-")) {
      throw new Error(`[FAIL] Unexpected session ID format: ${session1.id}`);
    }
    if (session1.status !== "ACTIVE") {
      throw new Error(`[FAIL] Default status should be ACTIVE, got ${session1.status}`);
    }
    if (session1.metadata?.env !== "test") {
      throw new Error(`[FAIL] Metadata preservation failed`);
    }

    const state = storage.getOrInitProjectState();
    if (state.lastSessionId !== session1.id) {
      throw new Error(`[FAIL] state.lastSessionId mismatch: ${state.lastSessionId}`);
    }
    if (state.sessionRunCount !== 1) {
      throw new Error(`[FAIL] state.sessionRunCount expected 1, got ${state.sessionRunCount}`);
    }
    console.log("  ✓ Session creation, default ACTIVE, metadata, state run count verified.");

    // -------------------------------------------------------------------------
    // 2. PROVENANCE CAPTURE
    // -------------------------------------------------------------------------
    console.log("--- 2. Provenance Snapshot ---");
    state.currentStage = "DISEÑAR";
    storage.saveProjectState(state);

    const session2 = storage.registerSession({
      agentId: "agent-beta",
    });
    if (session2.provenance?.workflowStageAtCreation !== "DISEÑAR") {
      throw new Error(`[FAIL] Provenance stage at creation expected DISEÑAR, got ${session2.provenance?.workflowStageAtCreation}`);
    }
    console.log("  ✓ Session provenance snapshot captured successfully.");

    // -------------------------------------------------------------------------
    // 3. RETENTION LIMIT (MAX 100 SESSIONS)
    // -------------------------------------------------------------------------
    console.log("--- 3. Retention Purge Limit (Max 100) ---");
    for (let i = 0; i < 105; i++) {
      const s = storage.registerSession({ agentId: `agent-bulk-${i}` });
      if (i < 50) {
        storage.updateSessionStatus(s.id, "COMPLETED");
      }
    }
    const allSessions = storage.listSessions();
    if (allSessions.length > 100) {
      throw new Error(`[FAIL] Sessions array exceeded 100 max limit, size=${allSessions.length}`);
    }
    console.log(`  ✓ Retention limit enforced. Total sessions capped at ${allSessions.length}.`);

    // -------------------------------------------------------------------------
    // 4. LIFECYCLE TRANSITIONS & TERMINAL INVARIANTS
    // -------------------------------------------------------------------------
    console.log("--- 4. Lifecycle Transitions & Terminal Invariants ---");
    const sessActive = storage.registerSession({ agentId: "agent-lifecycle" });

    // ACTIVE -> IDLE
    const sessIdle = storage.updateSessionStatus(sessActive.id, "IDLE");
    if (sessIdle?.status !== "IDLE") {
      throw new Error(`[FAIL] Transition ACTIVE -> IDLE failed`);
    }

    // IDLE -> ACTIVE
    const sessBackActive = storage.updateSessionStatus(sessActive.id, "ACTIVE");
    if (sessBackActive?.status !== "ACTIVE") {
      throw new Error(`[FAIL] Transition IDLE -> ACTIVE failed`);
    }

    // ACTIVE -> COMPLETED (Terminal)
    const sessCompleted = storage.updateSessionStatus(sessActive.id, "COMPLETED");
    if (sessCompleted?.status !== "COMPLETED" || !sessCompleted.completedAt) {
      throw new Error(`[FAIL] Transition ACTIVE -> COMPLETED failed`);
    }

    // Attempt Terminal -> ACTIVE (Should fail)
    let terminalErrorCaught = false;
    try {
      storage.updateSessionStatus(sessActive.id, "ACTIVE");
    } catch (err) {
      terminalErrorCaught = true;
    }
    if (!terminalErrorCaught) {
      throw new Error(`[FAIL] Terminal state resurrection prohibition was not enforced!`);
    }
    console.log("  ✓ Lifecycle transitions and terminal resurrection block verified.");

    // -------------------------------------------------------------------------
    // 5. RECONCILIATION & ORPHAN TASK RECOVERY
    // -------------------------------------------------------------------------
    console.log("--- 5. Explicit Reconciliation & Task Recovery ---");
    const staleAgentSession = storage.registerSession({ agentId: "agent-stale" });

    // Create a coordination task assigned to stale session in IN_PROGRESS state
    const task = storage.createCoordinationTask({
      title: "Orphan Task Test",
      description: "Test task for reconciliation",
      assignedTo: "agent-stale",
    });
    storage.claimCoordinationTask(task.id, "agent-stale", staleAgentSession.id);

    // Manually age the stale session timestamp
    const currentState = storage.getOrInitProjectState();
    const staleSessRecord = currentState.sessions?.find(s => s.id === staleAgentSession.id);
    if (staleSessRecord) {
      const pastTime = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
      staleSessRecord.lastActiveAt = pastTime;
      storage.saveProjectState(currentState);
    }

    // Run reconciliation in mutation mode with 1-hour threshold (3,600,000 ms)
    const reconcileResult = storage.reconcileSessions({
      thresholdMs: 3600000,
      dryRun: false,
      confirm: true,
      agentId: "test-reconciler",
    });

    if (reconcileResult.reconciledCount < 1) {
      throw new Error(`[FAIL] Expected at least 1 reconciled session, got ${reconcileResult.reconciledCount}`);
    }
    if (reconcileResult.tasksReleasedCount !== 1) {
      throw new Error(`[FAIL] Expected 1 released orphan task, got ${reconcileResult.tasksReleasedCount}`);
    }

    // Verify session status updated to ABORTED
    const updatedStaleSession = storage.getSession(staleAgentSession.id);
    if (updatedStaleSession?.status !== "ABORTED") {
      throw new Error(`[FAIL] Stale session status should be ABORTED, got ${updatedStaleSession?.status}`);
    }

    // Verify task returned to PENDING and unassigned
    const updatedTasks = storage.listCoordinationTasks();
    const recoveredTask = updatedTasks.find(t => t.id === task.id);
    if (recoveredTask?.status !== "PENDING" || recoveredTask.assignedAgentId || recoveredTask.assignedSessionId) {
      throw new Error(`[FAIL] Orphan task was not properly reset to PENDING and unassigned. Got: ${JSON.stringify(recoveredTask)}`);
    }
    console.log("  ✓ Reconciliation of stale session and orphan task recovery verified.");

    // -------------------------------------------------------------------------
    // 6. QUERIES VERIFICATION
    // -------------------------------------------------------------------------
    console.log("--- 6. Query Methods Verification ---");
    const qSession = storage.registerSession({ agentId: "agent-query-test" });
    const fetched = storage.getSession(qSession.id);
    if (fetched?.id !== qSession.id) {
      throw new Error(`[FAIL] getSession failed`);
    }

    const filtered = storage.listSessions({ agentId: "agent-query-test" });
    if (filtered.length !== 1 || filtered[0].id !== qSession.id) {
      throw new Error(`[FAIL] listSessions filter failed`);
    }

    const tasksForSess = storage.getTasksForSession(qSession.id);
    if (!Array.isArray(tasksForSess)) {
      throw new Error(`[FAIL] getTasksForSession expected array`);
    }

    const adrsForSess = storage.getADRsForSession(qSession.id);
    if (!Array.isArray(adrsForSess)) {
      throw new Error(`[FAIL] getADRsForSession expected array`);
    }

    const resForSess = storage.getResearchesForSession(qSession.id);
    if (!Array.isArray(resForSess)) {
      throw new Error(`[FAIL] getResearchesForSession expected array`);
    }
    console.log("  ✓ Query methods (getSession, listSessions, getTasksForSession, getADRsForSession, getResearchesForSession) verified.");

    // -------------------------------------------------------------------------
    // 7. EVENT STREAM LOGGING VERIFICATION
    // -------------------------------------------------------------------------
    console.log("--- 7. Event Log Stream Verification ---");
    const eventLogFile = path.join(testDir, ".openmemory", "logs", "events.jsonl");
    if (!fs.existsSync(eventLogFile)) {
      throw new Error(`[FAIL] Event log file missing at ${eventLogFile}`);
    }
    const eventContent = fs.readFileSync(eventLogFile, "utf-8");
    if (!eventContent.includes("session.registered") || !eventContent.includes("session.reconciled")) {
      throw new Error(`[FAIL] Event log stream missing expected session events`);
    }
    console.log(`  ✓ Audit events verified in canonical log path: .openmemory/logs/events.jsonl`);

    // -------------------------------------------------------------------------
    // 8. LOCK EXCEPTION SAFETY
    // -------------------------------------------------------------------------
    console.log("--- 8. Lock Exception Safety ---");
    try {
      await storage.withStateLock(() => {
        throw new Error("Simulated handler crash");
      }, "test-agent");
    } catch (_) {
      // Expected exception
    }

    // Verify lock was safely released by executing a follow-up operation
    const followUpSession = storage.registerSession({ agentId: "agent-lock-safety" });
    if (!followUpSession.id) {
      throw new Error(`[FAIL] Lock was not released after exception!`);
    }
    console.log("  ✓ Lock exception safety verified.");

    console.log("\n=================================================");
    console.log("✅ ALL F13.3.2-A CHARACTERIZATION TESTS PASSED!");
    console.log("=================================================\n");
  } finally {
    cleanupTestEnv();
  }
}

runF1332aSessionRegistrySuite().catch(err => {
  console.error("❌ F13.3.2-A TEST SUITE FAILED:", err);
  process.exit(1);
});
