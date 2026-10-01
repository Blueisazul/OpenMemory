import assert from "assert";
import fs from "fs";
import path from "path";
import { StorageEngine } from "../../src/storage";

const TEST_DIR = path.join(__dirname, "../../scratch/test-f124a");

function setupTestEngine(): StorageEngine {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
  return new StorageEngine(TEST_DIR);
}

function cleanupTestEngine() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function runTests() {
  console.log("==================================================================");
  console.log("RUNNING F12.4-A TASK ORPHAN RECOVERY & OWNERSHIP AUTHORIZATION TESTS");
  console.log("==================================================================\n");

  const storage = setupTestEngine();

  try {
    // -------------------------------------------------------------------------
    // TEST T01: Owner Success
    // -------------------------------------------------------------------------
    console.log("Testing T01: Owner agent + owner session -> SUCCESS...");
    const sessA = storage.registerSession({ agentId: "agent-a", status: "ACTIVE" });
    const task1 = storage.createCoordinationTask({
      title: "Task 1",
      description: "First test task",
      createdAgentId: "agent-a",
    });

    const claim1 = storage.claimCoordinationTask(task1.id, "agent-a", sessA.id);
    assert.strictEqual(claim1.success, true, "Claim task1 succeeded");
    assert.strictEqual(claim1.task?.status, "IN_PROGRESS", "Task status is IN_PROGRESS");
    assert.strictEqual(claim1.task?.assignedAgentId, "agent-a", "Assigned agent is agent-a");
    assert.strictEqual(claim1.task?.assignedSessionId, sessA.id, "Assigned session is sessA");

    const update1 = storage.updateCoordinationTaskStatus(task1.id, "COMPLETED", "agent-a", sessA.id, "Task 1 complete");
    assert.strictEqual(update1.status, "COMPLETED", "Task updated to COMPLETED");
    assert.strictEqual(update1.resultSummary, "Task 1 complete", "Result summary saved");
    console.log("  [PASS] T01: Owner success verified.");

    // -------------------------------------------------------------------------
    // TEST T02: Wrong Agent
    // -------------------------------------------------------------------------
    console.log("\nTesting T02: Wrong agent -> REJECT...");
    const task2 = storage.createCoordinationTask({
      title: "Task 2",
      description: "Second test task",
      createdAgentId: "agent-a",
    });
    storage.claimCoordinationTask(task2.id, "agent-a", sessA.id);

    assert.throws(
      () => storage.updateCoordinationTaskStatus(task2.id, "COMPLETED", "agent-b", sessA.id),
      /Ownership authorization failed/,
      "Updating task with wrong agentId throws Error"
    );
    console.log("  [PASS] T02: Wrong agent rejected.");

    // -------------------------------------------------------------------------
    // TEST T03: Wrong Session
    // -------------------------------------------------------------------------
    console.log("\nTesting T03: Wrong session -> REJECT...");
    const sessX = storage.registerSession({ agentId: "agent-a", status: "ACTIVE" });

    assert.throws(
      () => storage.updateCoordinationTaskStatus(task2.id, "COMPLETED", "agent-a", sessX.id),
      /Ownership authorization failed/,
      "Updating task with wrong sessionId throws Error"
    );
    console.log("  [PASS] T03: Wrong session rejected.");

    // -------------------------------------------------------------------------
    // TEST T04: Missing Session
    // -------------------------------------------------------------------------
    console.log("\nTesting T04: Missing session -> REJECT...");
    assert.throws(
      () => storage.updateCoordinationTaskStatus(task2.id, "COMPLETED", "agent-a", ""),
      /Ownership authorization failed/,
      "Updating task with empty sessionId throws Error"
    );
    console.log("  [PASS] T04: Missing session rejected.");

    // -------------------------------------------------------------------------
    // TEST T05: Wrong Agent + Wrong Session
    // -------------------------------------------------------------------------
    console.log("\nTesting T05: Wrong agent + wrong session -> REJECT...");
    assert.throws(
      () => storage.updateCoordinationTaskStatus(task2.id, "COMPLETED", "agent-b", sessX.id),
      /Ownership authorization failed/,
      "Updating task with wrong agent & wrong session throws Error"
    );
    console.log("  [PASS] T05: Wrong agent + wrong session rejected.");

    // -------------------------------------------------------------------------
    // TEST T06: Stale Session after Reclaim (CRITICAL SECURITY REGRESSION TEST)
    // -------------------------------------------------------------------------
    console.log("\nTesting T06: Stale Session A after Session B reclaim -> REJECT Session A...");
    // 1. Create stale Session A and Task 3
    const staleSessA = storage.registerSession({ agentId: "agent-a", status: "ACTIVE" });
    const task3 = storage.createCoordinationTask({
      title: "Task 3",
      description: "Critical security test task",
      createdAgentId: "agent-a",
    });
    storage.claimCoordinationTask(task3.id, "agent-a", staleSessA.id);

    // Make staleSessA stale (backdate lastActiveAt by 2 hours)
    const state = storage.getOrInitProjectState();
    const targetSession = state.sessions.find(s => s.id === staleSessA.id);
    if (targetSession) {
      targetSession.lastActiveAt = new Date(Date.now() - 7200000).toISOString();
      storage.saveProjectState(state);
    }

    // 2. Reconcile sessions -> staleSessA becomes ABORTED, task3 becomes PENDING
    const recRes1 = storage.reconcileSessions({
      thresholdMs: 3600000,
      dryRun: false,
      confirm: true,
    });
    assert.strictEqual(recRes1.reconciledCount, 1, "staleSessA reconciled");
    assert.strictEqual(recRes1.tasksReleasedCount, 1, "task3 released");

    // Check task3 status in storage
    const task3AfterRec = storage.listCoordinationTasks().find(t => t.id === task3.id);
    assert.strictEqual(task3AfterRec?.status, "PENDING", "Task 3 reset to PENDING");
    assert.strictEqual(task3AfterRec?.assignedAgentId, undefined, "Task 3 assignedAgentId cleared");
    assert.strictEqual(task3AfterRec?.assignedSessionId, undefined, "Task 3 assignedSessionId cleared");

    // 3. Session B claims Task 3
    const sessB = storage.registerSession({ agentId: "agent-b", status: "ACTIVE" });
    const claimResB = storage.claimCoordinationTask(task3.id, "agent-b", sessB.id);
    assert.strictEqual(claimResB.success, true, "Session B successfully claimed Task 3");

    // 4. Session A wakes up and attempts to update Task 3
    assert.throws(
      () => storage.updateCoordinationTaskStatus(task3.id, "COMPLETED", "agent-a", staleSessA.id, "Stale completion"),
      /Ownership authorization failed/,
      "Stale Session A rejected from modifying Task 3 owned by Session B"
    );

    // Verify Task 3 remains owned by Session B in IN_PROGRESS state
    const task3Current = storage.listCoordinationTasks().find(t => t.id === task3.id);
    assert.strictEqual(task3Current?.status, "IN_PROGRESS", "Task 3 remains IN_PROGRESS");
    assert.strictEqual(task3Current?.assignedAgentId, "agent-b", "Task 3 owner remains agent-b");
    assert.strictEqual(task3Current?.assignedSessionId, sessB.id, "Task 3 owner session remains sessB");
    console.log("  [PASS] T06: Stale Session A after Session B reclaim strictly rejected.");

    // -------------------------------------------------------------------------
    // TEST T07: Terminal COMPLETED Immutability
    // -------------------------------------------------------------------------
    console.log("\nTesting T07: Terminal COMPLETED protection...");
    const task4 = storage.createCoordinationTask({
      title: "Task 4",
      description: "Terminal completed task",
      createdAgentId: "agent-b",
    });
    storage.claimCoordinationTask(task4.id, "agent-b", sessB.id);
    storage.updateCoordinationTaskStatus(task4.id, "COMPLETED", "agent-b", sessB.id, "Done");

    assert.throws(
      () => storage.updateCoordinationTaskStatus(task4.id, "FAILED", "agent-b", sessB.id, "Try again"),
      /is in terminal state 'COMPLETED'/,
      "Updating completed task throws Error"
    );
    console.log("  [PASS] T07: Terminal COMPLETED protection verified.");

    // -------------------------------------------------------------------------
    // TEST T08: Terminal FAILED Immutability
    // -------------------------------------------------------------------------
    console.log("\nTesting T08: Terminal FAILED protection...");
    const task5 = storage.createCoordinationTask({
      title: "Task 5",
      description: "Terminal failed task",
      createdAgentId: "agent-b",
    });
    storage.claimCoordinationTask(task5.id, "agent-b", sessB.id);
    storage.updateCoordinationTaskStatus(task5.id, "FAILED", "agent-b", sessB.id, "Error occurred");

    assert.throws(
      () => storage.updateCoordinationTaskStatus(task5.id, "COMPLETED", "agent-b", sessB.id, "Fixed"),
      /is in terminal state 'FAILED'/,
      "Updating failed task throws Error"
    );
    console.log("  [PASS] T08: Terminal FAILED protection verified.");

    // -------------------------------------------------------------------------
    // TEST T09: Terminal CANCELLED Immutability
    // -------------------------------------------------------------------------
    console.log("\nTesting T09: Terminal CANCELLED protection...");
    const task6 = storage.createCoordinationTask({
      title: "Task 6",
      description: "Terminal cancelled task",
      createdAgentId: "agent-b",
    });
    storage.claimCoordinationTask(task6.id, "agent-b", sessB.id);
    storage.updateCoordinationTaskStatus(task6.id, "CANCELLED", "agent-b", sessB.id, "Aborted by user");

    assert.throws(
      () => storage.updateCoordinationTaskStatus(task6.id, "IN_PROGRESS", "agent-b", sessB.id),
      /is in terminal state 'CANCELLED'/,
      "Updating cancelled task throws Error"
    );
    console.log("  [PASS] T09: Terminal CANCELLED protection verified.");

    // -------------------------------------------------------------------------
    // TEST T10: Orphan Recovery Metadata & Re-Claim
    // -------------------------------------------------------------------------
    console.log("\nTesting T10: Orphan recovery metadata & re-claim...");
    const staleSessC = storage.registerSession({ agentId: "agent-c", status: "ACTIVE" });
    const task7 = storage.createCoordinationTask({
      title: "Task 7",
      description: "Orphan recovery metadata task",
      createdAgentId: "agent-c",
    });
    storage.claimCoordinationTask(task7.id, "agent-c", staleSessC.id);

    // Backdate staleSessC
    const state2 = storage.getOrInitProjectState();
    const sessCRecord = state2.sessions.find(s => s.id === staleSessC.id);
    if (sessCRecord) {
      sessCRecord.lastActiveAt = new Date(Date.now() - 7200000).toISOString();
      storage.saveProjectState(state2);
    }

    // Run dry-run first
    const dryRunRes = storage.reconcileSessions({
      thresholdMs: 3600000,
      dryRun: true,
    });
    assert.strictEqual(dryRunRes.dryRun, true, "Dry run flag set");
    assert.strictEqual(dryRunRes.tasksWouldReleaseCount, 1, "Dry run predicts 1 task released");
    assert.strictEqual(dryRunRes.wouldReleaseTaskIds?.includes(task7.id), true, "Task 7 listed in wouldReleaseTaskIds");

    // Task 7 still IN_PROGRESS after dry run
    const task7Dry = storage.listCoordinationTasks().find(t => t.id === task7.id);
    assert.strictEqual(task7Dry?.status, "IN_PROGRESS", "Task 7 unchanged after dry run");

    // Run mutation reconciliation
    const mutRes = storage.reconcileSessions({
      thresholdMs: 3600000,
      dryRun: false,
      confirm: true,
    });
    assert.strictEqual(mutRes.dryRun, false, "Mutation mode active");
    assert.strictEqual(mutRes.tasksReleasedCount, 1, "1 task released");
    assert.strictEqual(mutRes.releasedTaskIds?.includes(task7.id), true, "Task 7 in releasedTaskIds");

    const task7Recovered = storage.listCoordinationTasks().find(t => t.id === task7.id);
    assert.strictEqual(task7Recovered?.status, "PENDING", "Task 7 reset to PENDING");
    assert.strictEqual(task7Recovered?.metadata?.orphanRecovery?.recoveredFromSessionId, staleSessC.id, "Recovery metadata recorded");
    assert.strictEqual(task7Recovered?.metadata?.orphanRecovery?.reason, "STALE_SESSION_ABORTED", "Recovery reason recorded");

    // Re-claim by Session D
    const sessD = storage.registerSession({ agentId: "agent-d", status: "ACTIVE" });
    const reclaim7 = storage.claimCoordinationTask(task7.id, "agent-d", sessD.id);
    assert.strictEqual(reclaim7.success, true, "Recovered task 7 claimed by Session D");
    console.log("  [PASS] T10: Orphan recovery metadata & re-claim verified.");

    // -------------------------------------------------------------------------
    // TEST T11: Multiple Orphan Tasks & Terminal Isolation
    // -------------------------------------------------------------------------
    console.log("\nTesting T11: Multiple orphan tasks & terminal isolation...");
    const staleSessE = storage.registerSession({ agentId: "agent-e", status: "ACTIVE" });
    const taskA = storage.createCoordinationTask({ title: "Task A", description: "A", createdAgentId: "agent-e" });
    const taskB = storage.createCoordinationTask({ title: "Task B", description: "B", createdAgentId: "agent-e" });
    const taskC = storage.createCoordinationTask({ title: "Task C", description: "C", createdAgentId: "agent-e" });

    storage.claimCoordinationTask(taskA.id, "agent-e", staleSessE.id);
    storage.claimCoordinationTask(taskB.id, "agent-e", staleSessE.id);
    storage.claimCoordinationTask(taskC.id, "agent-e", staleSessE.id);

    // Complete taskC
    storage.updateCoordinationTaskStatus(taskC.id, "COMPLETED", "agent-e", staleSessE.id, "Done C");

    // Backdate staleSessE
    const state3 = storage.getOrInitProjectState();
    const sessERecord = state3.sessions.find(s => s.id === staleSessE.id);
    if (sessERecord) {
      sessERecord.lastActiveAt = new Date(Date.now() - 7200000).toISOString();
      storage.saveProjectState(state3);
    }

    const recResE = storage.reconcileSessions({
      thresholdMs: 3600000,
      dryRun: false,
      confirm: true,
    });
    assert.strictEqual(recResE.tasksReleasedCount, 2, "Only IN_PROGRESS tasks A and B released (taskC ignored)");

    const taskAAfter = storage.listCoordinationTasks().find(t => t.id === taskA.id);
    const taskBAfter = storage.listCoordinationTasks().find(t => t.id === taskB.id);
    const taskCAfter = storage.listCoordinationTasks().find(t => t.id === taskC.id);

    assert.strictEqual(taskAAfter?.status, "PENDING", "Task A reset to PENDING");
    assert.strictEqual(taskBAfter?.status, "PENDING", "Task B reset to PENDING");
    assert.strictEqual(taskCAfter?.status, "COMPLETED", "Task C remains COMPLETED");
    console.log("  [PASS] T11: Multiple orphan tasks & terminal isolation verified.");

    // -------------------------------------------------------------------------
    // TEST T12: Reconciliation Idempotency
    // -------------------------------------------------------------------------
    console.log("\nTesting T12: Reconciliation idempotency...");
    const recResIdempotent = storage.reconcileSessions({
      thresholdMs: 3600000,
      dryRun: false,
      confirm: true,
    });
    assert.strictEqual(recResIdempotent.reconciledCount, 0, "No new sessions reconciled on second run");
    assert.strictEqual(recResIdempotent.tasksReleasedCount, 0, "0 tasks released on second run");
    console.log("  [PASS] T12: Reconciliation idempotency verified.");

    // -------------------------------------------------------------------------
    // TEST T13: Concurrent Claim
    // -------------------------------------------------------------------------
    console.log("\nTesting T13: Concurrent claim...");
    const sessE = storage.registerSession({ agentId: "agent-e1", status: "ACTIVE" });
    const sessF = storage.registerSession({ agentId: "agent-f1", status: "ACTIVE" });

    const c1 = storage.claimCoordinationTask(taskA.id, "agent-e1", sessE.id);
    assert.strictEqual(c1.success, true, "First claim on taskA succeeds");

    const c2 = storage.claimCoordinationTask(taskA.id, "agent-f1", sessF.id);
    assert.strictEqual(c2.success, false, "Second claim on taskA fails");
    assert.match(c2.reason || "", /only 'PENDING' tasks can be claimed/, "Reason indicates task is IN_PROGRESS");
    console.log("  [PASS] T13: Concurrent claim mutual exclusion verified.");

    // -------------------------------------------------------------------------
    // TEST T14: Atomic Reconciliation
    // -------------------------------------------------------------------------
    console.log("\nTesting T14: Atomic reconciliation transaction safety...");
    const staleSessG = storage.registerSession({ agentId: "agent-g", status: "ACTIVE" });
    const taskG = storage.createCoordinationTask({ title: "Task G", description: "G", createdAgentId: "agent-g" });
    storage.claimCoordinationTask(taskG.id, "agent-g", staleSessG.id);

    // Backdate staleSessG
    const state4 = storage.getOrInitProjectState();
    const sessGRecord = state4.sessions.find(s => s.id === staleSessG.id);
    if (sessGRecord) {
      sessGRecord.lastActiveAt = new Date(Date.now() - 7200000).toISOString();
      storage.saveProjectState(state4);
    }

    const recAtomic = storage.reconcileSessions({
      thresholdMs: 3600000,
      dryRun: false,
      confirm: true,
    });
    assert.strictEqual(recAtomic.reconciledCount, 1, "Session G reconciled");
    assert.strictEqual(recAtomic.tasksReleasedCount, 1, "Task G released");

    // Verify session and task states in disk state atomically updated
    const finalState = storage.getOrInitProjectState();
    const sG = finalState.sessions.find(s => s.id === staleSessG.id);
    const tG = finalState.coordinationTasks?.find(t => t.id === taskG.id);

    assert.strictEqual(sG?.status, "ABORTED", "Session G status is ABORTED");
    assert.strictEqual(tG?.status, "PENDING", "Task G status is PENDING");
    console.log("  [PASS] T14: Atomic reconciliation transaction safety verified.");

    console.log("\n==================================================================");
    console.log("ALL F12.4-A TESTS (T01 - T14) PASSED SUCCESSFULLY!");
    console.log("==================================================================\n");

  } finally {
    cleanupTestEngine();
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
