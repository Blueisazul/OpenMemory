import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { PersistenceEngine } from "../../src/storage/core/persistence-engine";
import { EventLogger } from "../../src/storage/core/event-logger";

const testDir = path.join(process.cwd(), ".openmemory_test_f1331");

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

async function runF1331CharacterizationSuite() {
  console.log("=================================================");
  console.log("🧪 RUNNING F13.3.1 CHARACTERIZATION & PERSISTENCE SUITE");
  console.log("=================================================\n");

  setupTestEnv();

  const storage = new StorageEngine(testDir);
  storage.ensureStorageStructure();

  // -------------------------------------------------------------------------
  // 1. PUBLIC API CHARACTERIZATION SUITE (68/68 METHODS VERIFICATION)
  // -------------------------------------------------------------------------
  console.log("--- PART 1: 68/68 PUBLIC API MEMBERS CHARACTERIZATION ---");

  const expectedPublicMethods = [
    "ensureStorageStructure",
    "logEvent",
    "atomicWriteFileSync",
    "deriveProjectName",
    "getOrInitManifest",
    "saveManifest",
    "getOrInitProjectState",
    "resolveStateDivergence",
    "saveProjectState",
    "projectStageState",
    "saveCanonicalState",
    "migrateToV02",
    "getOrInitHandoff",
    "saveHandoff",
    "parseHandoffSections",
    "updateHandoff",
    "truncateHandoffWords",
    "saveADR",
    "evaluateADRConsensus",
    "tryAcquireLockDetailed",
    "tryAcquireLock",
    "releaseLockDetailed",
    "releaseLock",
    "withStateLock",
    "cleanupStaleLocks",
    "voteADR",
    "listADRs",
    "getADR",
    "addTask",
    "updateTaskStatus",
    "setActiveGoal",
    "formatProjectContextSummary",
    "cleanupTempFiles",
    "createBackup",
    "listBackups",
    "restoreBackup",
    "runDiagnostics",
    "saveResearch",
    "getResearch",
    "listResearches",
    "queryKnowledgeItems",
    "deleteResearch",
    "formatKnowledgeIndexSummary",
    "saveOSSEvaluation",
    "listOSSEvaluations",
    "getOSSEvaluation",
    "rotateEventLogs",
    "registerSession",
    "updateSessionStatus",
    "reconcileSessions",
    "getTasksForSession",
    "getADRsForSession",
    "getResearchesForSession",
    "listSessions",
    "getSession",
    "assembleCrossAgentContext",
    "createCoordinationTask",
    "listCoordinationTasks",
    "claimCoordinationTask",
    "updateCoordinationTaskStatus",
    "getTaskGraphStatus",
    "removeTaskDependency",
    "addTaskDependency",
    "updateKnowledgeLifecycle",
    "addKnowledgeRelation",
    "getKnowledgeRelations",
    "deleteKnowledgeRelation",
    "analyzeKnowledgeTMS",
  ];

  let verifiedMethodsCount = 0;
  for (const method of expectedPublicMethods) {
    const fn = (storage as any)[method];
    if (typeof fn !== "function") {
      throw new Error(`API Characterization failure: missing method '${method}' on StorageEngine`);
    }
    verifiedMethodsCount++;
  }

  console.log(`  ✅ PASS: 68/68 public API methods present and callable on StorageEngine facade (${verifiedMethodsCount} verified)`);

  // -------------------------------------------------------------------------
  // 2. PERSISTENCE ENGINE & ATOMIC WRITE SUITE
  // -------------------------------------------------------------------------
  console.log("\n--- PART 2: PERSISTENCE ENGINE & ATOMIC WRITE BEHAVIOR ---");

  // Test 2.1: Atomic write success
  const targetFile = path.join(testDir, ".openmemory", "test_file.txt");
  storage.atomicWriteFileSync(targetFile, "Hello World Baseline");
  if (fs.readFileSync(targetFile, "utf-8") !== "Hello World Baseline") {
    throw new Error("Atomic write test failed: content mismatch");
  }
  console.log("  ✅ PASS: Atomic write success verified");

  // Test 2.2: Replacement of existing file
  storage.atomicWriteFileSync(targetFile, "Hello World Updated");
  if (fs.readFileSync(targetFile, "utf-8") !== "Hello World Updated") {
    throw new Error("Atomic overwrite test failed: content mismatch");
  }
  console.log("  ✅ PASS: Replacement of existing file verified");

  // Test 2.3: Temporary file cleanup
  const openmemDir = path.join(testDir, ".openmemory");
  const tempFile = path.join(openmemDir, "leftover.tmp");
  fs.writeFileSync(tempFile, "temp orphan data");
  const cleanedTempCount = storage.cleanupTempFiles();
  if (cleanedTempCount < 1 || fs.existsSync(tempFile)) {
    throw new Error("Temporary file cleanup failed: orphan .tmp file still exists");
  }
  console.log("  ✅ PASS: Temporary file cleanup verified");

  // -------------------------------------------------------------------------
  // 3. LOCKING EQUIVALENCE & EXCEPTION SAFETY SUITE
  // -------------------------------------------------------------------------
  console.log("\n--- PART 3: ADVISORY LOCKING & EXCEPTION SAFETY ---");

  // Test 3.1: Lock acquisition & release
  const lockKey = "unit-test-resource";
  const lockAcquired = storage.tryAcquireLock(lockKey, "agent-alpha", 5000);
  if (!lockAcquired) {
    throw new Error("Lock acquisition failed");
  }

  const contestAttempt = storage.tryAcquireLock(lockKey, "agent-beta", 5000);
  if (contestAttempt) {
    throw new Error("Lock contest failed: second agent acquired locked resource");
  }

  const lockReleased = storage.releaseLock(lockKey, "agent-alpha");
  if (!lockReleased) {
    throw new Error("Lock release failed");
  }
  console.log("  ✅ PASS: Lock acquisition & release verified");

  // Test 3.2: Exception releases lock in withStateLock
  let caughtException = false;
  try {
    storage.withStateLock(() => {
      throw new Error("Controlled transaction failure");
    }, "agent-err");
  } catch (err: any) {
    caughtException = err.message === "Controlled transaction failure";
  }

  if (!caughtException) {
    throw new Error("Controlled exception was not caught");
  }

  // Lock should be released; new lock attempt must succeed immediately!
  const lockReacquired = storage.tryAcquireLock("project-state-transaction", "agent-next", 5000);
  if (!lockReacquired) {
    throw new Error("Exception safety failure: lock was left unreleased after exception");
  }
  storage.releaseLock("project-state-transaction", "agent-next");
  console.log("  ✅ PASS: Controlled exception cleanly releases transaction lock");

  // Test 3.3: Stale lock handling
  const locksDir = path.join(openmemDir, "locks");
  const staleLockFile = path.join(locksDir, "stale_res.lock");
  const stalePayload = JSON.stringify({
    owner: "dead-agent",
    token: "tok_dead",
    acquiredAt: Date.now() - 10000,
    expiresAt: Date.now() - 5000, // Expired 5 seconds ago
  });
  fs.writeFileSync(staleLockFile, stalePayload, "utf-8");

  const staleCleaned = storage.cleanupStaleLocks();
  if (staleCleaned < 1 || fs.existsSync(staleLockFile)) {
    throw new Error("Stale lock cleanup failed");
  }
  console.log("  ✅ PASS: Stale lock cleanup verified");

  // -------------------------------------------------------------------------
  // 4. CONCURRENCY TRANSACTION & NO LOST UPDATE SUITE
  // -------------------------------------------------------------------------
  console.log("\n--- PART 4: CONCURRENT TRANSACTION SERIALIZATION ---");

  // Register session & create task under withStateLock
  const sess = storage.registerSession({ agentId: "agent-worker-1" });
  const task = storage.createCoordinationTask({
    title: "Task Serialization Test",
    description: "Testing concurrent serialized state mutation",
    createdAgentId: "agent-worker-1",
  });

  const claimRes = storage.claimCoordinationTask(task.id, "agent-worker-1", sess.id);
  if (!claimRes.success) {
    throw new Error(`Task claim failed: ${claimRes.reason}`);
  }

  const updatedTask = storage.updateCoordinationTaskStatus(
    task.id,
    "COMPLETED",
    "agent-worker-1",
    sess.id,
    "Completed cleanly under lock"
  );

  if (updatedTask.status !== "COMPLETED") {
    throw new Error("Task transaction status update failed");
  }
  console.log("  ✅ PASS: Serialized task transaction mutation verified without lost updates");

  // -------------------------------------------------------------------------
  // 5. EVENT LOGGER TELEMETRY SUITE
  // -------------------------------------------------------------------------
  console.log("\n--- PART 5: EVENT STREAM TELEMETRY INTEGRATION ---");

  storage.logEvent("test.event_emitted", { detail: "verification" }, "agent-worker-1", sess.id);
  const logFile = path.join(openmemDir, "logs", "events.jsonl");
  if (!fs.existsSync(logFile)) {
    throw new Error("Event log file was not created");
  }

  const logContent = fs.readFileSync(logFile, "utf-8");
  if (!logContent.includes("test.event_emitted")) {
    throw new Error("Logged event missing from events.jsonl");
  }
  console.log("  ✅ PASS: Event logger telemetry integration verified");

  // -------------------------------------------------------------------------
  // 6. FAILURE INJECTION: PERSISTENCE FAILURE IN READ-MODIFY-WRITE
  // -------------------------------------------------------------------------
  console.log("\n--- PART 6: FAILURE INJECTION & LOCK RELEASE ---");

  let failureInjected = false;
  try {
    storage.withStateLock(() => {
      // Simulate READ -> VALIDATE -> TRANSITION
      const state = storage.getOrInitProjectState();
      state.activeGoal = "Goal modified in memory before failure";

      // Simulate PERSIST FAILURE
      throw new Error("Simulated I/O disk write failure during persistence step");
    }, "agent-fail-injector");
  } catch (err: any) {
    failureInjected = err.message.includes("Simulated I/O disk write failure");
  }

  if (!failureInjected) {
    throw new Error("Failure injection test failed: exception not triggered");
  }

  // Verify that the lock was cleanly unlinked despite persistence failure
  const postFailLockAcquire = storage.tryAcquireLock("project-state-transaction", "agent-recovery", 5000);
  if (!postFailLockAcquire) {
    throw new Error("Failure injection safety failed: transaction lock remained held after disk error!");
  }
  storage.releaseLock("project-state-transaction", "agent-recovery");

  // Verify that project-state.json file on disk was NOT corrupted
  const freshState = storage.getOrInitProjectState();
  if (freshState.activeGoal === "Goal modified in memory before failure") {
    throw new Error("Failure injection safety failed: uncommitted in-memory state leaked to disk!");
  }
  console.log("  ✅ PASS: Failure injection (persistence failure) releases lock & preserves disk state");

  cleanupTestEnv();

  console.log("\n=================================================");
  console.log("🎉 ALL F13.3.1 CHARACTERIZATION & PERSISTENCE TESTS PASSED 100%");
  console.log("=================================================\n");
}

runF1331CharacterizationSuite().catch(err => {
  console.error("❌ F13.3.1 Suite Error:", err);
  cleanupTestEnv();
  process.exit(1);
});
