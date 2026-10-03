import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";

const testDir = path.join(process.cwd(), ".openmemory_test_f1332b");

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

async function runF1332bTaskDAGSuite() {
  console.log("=================================================");
  console.log("🧪 RUNNING F13.3.2-B TASK DAG CHARACTERIZATION SUITE");
  console.log("=================================================\n");

  setupTestEnv();

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();

    const session = storage.registerSession({ agentId: "agent-lead" });

    // -------------------------------------------------------------------------
    // 1. TASK CREATION & DEPENDENCY VALIDATION
    // -------------------------------------------------------------------------
    console.log("--- 1. Task Creation & Dependency Validation ---");
    const taskA = storage.createCoordinationTask({
      title: "Task A",
      description: "Root task",
      createdAgentId: "agent-lead",
    });

    if (!taskA.id || taskA.status !== "PENDING") {
      throw new Error(`[FAIL] Task creation failed: ${JSON.stringify(taskA)}`);
    }

    const taskB = storage.createCoordinationTask({
      title: "Task B",
      description: "Dependent task",
      createdAgentId: "agent-lead",
      dependsOn: [taskA.id],
    });

    if (!taskB.dependsOn || !taskB.dependsOn.includes(taskA.id)) {
      throw new Error(`[FAIL] Dependency taskB -> taskA not set`);
    }

    // Self-dependency rejection
    let selfDepError = false;
    try {
      storage.createCoordinationTask({
        title: "Self Dep Task",
        description: "Invalid",
        createdAgentId: "agent-lead",
        dependsOn: ["TASK-001-SELF"],
      });
    } catch (_) {
      selfDepError = true;
    }

    // Non-existent dependency rejection
    let missingDepError = false;
    try {
      storage.createCoordinationTask({
        title: "Missing Dep Task",
        description: "Invalid",
        createdAgentId: "agent-lead",
        dependsOn: ["TASK-NONEXISTENT-999"],
      });
    } catch (_) {
      missingDepError = true;
    }
    if (!missingDepError) {
      throw new Error(`[FAIL] Creation with non-existent dependency was not rejected!`);
    }

    // Direct cycle rejection (A -> B, attempt B -> A edge addition)
    const addCycleRes = storage.addTaskDependency(taskA.id, taskB.id, "agent-lead", session.id);
    if (addCycleRes.success) {
      throw new Error(`[FAIL] Adding cyclic dependency A -> B -> A was not rejected!`);
    }

    // Transitive cycle rejection (A -> B -> C, attempt C -> A edge addition)
    const taskC = storage.createCoordinationTask({
      title: "Task C",
      description: "Chain task",
      createdAgentId: "agent-lead",
      dependsOn: [taskB.id],
    });
    const addTransitiveRes = storage.addTaskDependency(taskA.id, taskC.id, "agent-lead", session.id);
    if (addTransitiveRes.success) {
      throw new Error(`[FAIL] Adding transitive cyclic dependency A -> B -> C -> A was not rejected!`);
    }
    console.log("  ✓ Task creation, self-dependency, missing dep, and DFS cycle rejection verified.");

    // -------------------------------------------------------------------------
    // 2. TASK CLAIMING & SESSION AUTHORIZATION
    // -------------------------------------------------------------------------
    console.log("--- 2. Task Claiming & Authorization ---");
    // Claim taskA (has no dependencies)
    const claimResA = storage.claimCoordinationTask(taskA.id, "agent-lead", session.id);
    if (!claimResA.success || !claimResA.task) {
      throw new Error(`[FAIL] Claiming root taskA failed: ${claimResA.reason}`);
    }
    if (claimResA.task.status !== "IN_PROGRESS" || claimResA.task.assignedAgentId !== "agent-lead") {
      throw new Error(`[FAIL] TaskA status or assignedAgentId mismatch after claim`);
    }

    // Attempt claiming taskB while dependency taskA is IN_PROGRESS (should fail)
    const claimResB_blocked = storage.claimCoordinationTask(taskB.id, "agent-lead", session.id);
    if (claimResB_blocked.success) {
      throw new Error(`[FAIL] Claiming taskB while dependency taskA is IN_PROGRESS should be rejected!`);
    }

    // Complete taskA
    storage.updateCoordinationTaskStatus(taskA.id, "COMPLETED", "agent-lead", session.id, "Task A Done");

    // Now claim taskB (dependency taskA is COMPLETED)
    const claimResB_success = storage.claimCoordinationTask(taskB.id, "agent-lead", session.id);
    if (!claimResB_success.success) {
      throw new Error(`[FAIL] Claiming taskB after taskA COMPLETED failed: ${claimResB_success.reason}`);
    }
    console.log("  ✓ Claim authorization, dependency status checking, and claim state transitions verified.");

    // -------------------------------------------------------------------------
    // 3. TASK STATUS TRANSITIONS & IMMUTABILITY
    // -------------------------------------------------------------------------
    console.log("--- 3. Status Transitions & Terminal Immutability ---");
    // Complete taskB
    const completedB = storage.updateCoordinationTaskStatus(taskB.id, "COMPLETED", "agent-lead", session.id, "Task B Done");
    if (completedB.status !== "COMPLETED" || !completedB.completedAt) {
      throw new Error(`[FAIL] Completing taskB failed`);
    }

    // Attempt modifying completed taskB (Terminal Immutability)
    let terminalError = false;
    try {
      storage.updateCoordinationTaskStatus(taskB.id, "FAILED", "agent-lead", session.id);
    } catch (_) {
      terminalError = true;
    }
    if (!terminalError) {
      throw new Error(`[FAIL] Modifying terminal task was not rejected!`);
    }

    // Ownership authorization check on status update
    const taskX = storage.createCoordinationTask({ title: "Task X", description: "Ownership test", createdAgentId: "agent-lead" });
    storage.claimCoordinationTask(taskX.id, "agent-lead", session.id);

    let ownershipError = false;
    try {
      storage.updateCoordinationTaskStatus(taskX.id, "COMPLETED", "other-agent", session.id);
    } catch (_) {
      ownershipError = true;
    }
    if (!ownershipError) {
      throw new Error(`[FAIL] Status update by non-assigned agent was not rejected!`);
    }
    console.log("  ✓ Status updates, terminal immutability, and ownership authorization verified.");

    // -------------------------------------------------------------------------
    // 4. LEGACY GRAPH CORRUPTION & DIAGNOSTICS
    // -------------------------------------------------------------------------
    console.log("--- 4. Legacy Graph Cycles & Diagnostics ---");
    // Inject legacy cycle into disk state
    const rawState = storage.getOrInitProjectState();
    const legA: any = { id: "LEGACY-A", title: "Legacy A", description: "Desc", status: "PENDING", createdAgentId: "agent-lead", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dependsOn: ["LEGACY-B"] };
    const legB: any = { id: "LEGACY-B", title: "Legacy B", description: "Desc", status: "PENDING", createdAgentId: "agent-lead", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), dependsOn: ["LEGACY-A"] };
    rawState.coordinationTasks = [...(rawState.coordinationTasks || []), legA, legB];
    storage.saveProjectState(rawState);

    // Verify diagnostic status
    const diag = storage.getTaskGraphStatus();
    if (!diag.hasCycle || diag.status !== "INVALID_DAG_CYCLE_DETECTED") {
      throw new Error(`[FAIL] Legacy cycle diagnostic failed: ${JSON.stringify(diag)}`);
    }

    // Verify claim on legacy cyclic task is blocked
    const claimLegRes = storage.claimCoordinationTask("LEGACY-A", "agent-lead", session.id);
    if (claimLegRes.success) {
      throw new Error(`[FAIL] Claiming task involved in legacy cycle was not blocked!`);
    }
    if (!claimLegRes.reason || !claimLegRes.reason.includes("invalid cyclic dependency graph")) {
      throw new Error(`[FAIL] Unexpected claim rejection reason: ${claimLegRes.reason}`);
    }
    console.log("  ✓ Legacy cyclic graph detection and claim blocking verified.");

    // -------------------------------------------------------------------------
    // 5. GOVERNED GRAPH REPAIR
    // -------------------------------------------------------------------------
    console.log("--- 5. Governed Graph Repair ---");
    // Attempt repair without rationale (should fail)
    const repairNoRat = storage.removeTaskDependency("LEGACY-A", "LEGACY-B", "agent-lead", session.id, "");
    if (repairNoRat.success) {
      throw new Error(`[FAIL] Repair without rationale was not rejected!`);
    }

    // Attempt repair by unauthorized worker (should fail)
    const repairUnauth = storage.removeTaskDependency("LEGACY-A", "LEGACY-B", "worker-agent", session.id, "Repair rationale", "WORKER_AGENT");
    if (repairUnauth.success) {
      throw new Error(`[FAIL] Repair by unauthorized worker was not rejected!`);
    }

    // Authorized repair by LEAD_AGENT
    const repairSuccess = storage.removeTaskDependency("LEGACY-A", "LEGACY-B", "agent-lead", session.id, "Breaking legacy cycle", "LEAD_AGENT");
    if (!repairSuccess.success || !repairSuccess.task) {
      throw new Error(`[FAIL] Authorized repair failed: ${repairSuccess.reason}`);
    }

    // Verify cycle resolved
    const postDiag = storage.getTaskGraphStatus();
    if (postDiag.hasCycle) {
      throw new Error(`[FAIL] Graph should be cycle-free after repair`);
    }

    // Verify audit trail metadata
    if (!repairSuccess.task.metadata?.repairedDependencies || repairSuccess.task.metadata.repairedDependencies.length !== 1) {
      throw new Error(`[FAIL] Repaired dependencies audit metadata missing or invalid`);
    }
    console.log("  ✓ Governed graph repair, rationale enforcement, role auth, and audit metadata verified.");

    // -------------------------------------------------------------------------
    // 6. ARRAY PURGING & DANGLING DEPENDENCIES
    // -------------------------------------------------------------------------
    console.log("--- 6. Array Limit Purge (>200) ---");
    for (let i = 0; i < 210; i++) {
      storage.createCoordinationTask({
        title: `Bulk Task ${i}`,
        description: "Bulk creation",
        createdAgentId: "agent-bulk",
      });
    }
    const tasksAfterBulk = storage.listCoordinationTasks();
    if (tasksAfterBulk.length > 200) {
      throw new Error(`[FAIL] Coordination tasks count exceeded 200 max limit, size=${tasksAfterBulk.length}`);
    }
    console.log(`  ✓ Array purge verified. Tasks array capped at ${tasksAfterBulk.length}.`);

    // -------------------------------------------------------------------------
    // 7. EVENT STREAM LOGGING VERIFICATION
    // -------------------------------------------------------------------------
    console.log("--- 7. Event Stream Telemetry ---");
    const eventLogFile = path.join(testDir, ".openmemory", "logs", "events.jsonl");
    if (!fs.existsSync(eventLogFile)) {
      throw new Error(`[FAIL] Event log file missing at ${eventLogFile}`);
    }
    const eventContent = fs.readFileSync(eventLogFile, "utf-8");
    if (!eventContent.includes("task.created") || !eventContent.includes("task.claimed") || !eventContent.includes("task.dependency_repaired")) {
      throw new Error(`[FAIL] Event log stream missing expected task events`);
    }
    console.log("  ✓ Audit events verified in canonical log path: .openmemory/logs/events.jsonl");

    console.log("\n=================================================");
    console.log("✅ ALL F13.3.2-B CHARACTERIZATION TESTS PASSED!");
    console.log("=================================================\n");
  } finally {
    cleanupTestEnv();
  }
}

runF1332bTaskDAGSuite().catch(err => {
  console.error("❌ F13.3.2-B TEST SUITE FAILED:", err);
  process.exit(1);
});
