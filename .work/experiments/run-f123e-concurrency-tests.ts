import * as fs from "fs";
import * as path from "path";
import { spawn, fork } from "child_process";
import { StorageEngine } from "../../src/storage";

let assertionsPassed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  assertionsPassed++;
  console.log(`  ✓ ${message}`);
}

function runWorkerProcess(action: string, testDir: string, ...args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(cmd, ["tsx", __filename, "--worker", action, testDir, ...args], {
      shell: true,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

// -------------------------------------------------------------------------
// WORKER PROCESS ENTRYPOINT (Spawned as independent OS processes)
// -------------------------------------------------------------------------
if (process.argv.includes("--worker")) {
  const workerIndex = process.argv.indexOf("--worker");
  const action = process.argv[workerIndex + 1];
  const testDir = process.argv[workerIndex + 2];
  const extraArg = process.argv[workerIndex + 3];

  const storage = new StorageEngine(testDir);

  (async () => {
    try {
      if (action === "register-batch") {
        const count = parseInt(extraArg || "10", 10);
        const prefix = process.argv[workerIndex + 4] || "agent-child";
        for (let i = 0; i < count; i++) {
          storage.registerSession({
            agentId: prefix,
            metadata: { workerId: prefix, index: i },
          });
        }
        process.exit(0);
      } else if (action === "update-batch") {
        const sessionId = extraArg;
        const count = 10;
        for (let i = 0; i < count; i++) {
          storage.updateSessionStatus(sessionId, "ACTIVE", { step: i, ts: Date.now() });
        }
        process.exit(0);
      } else if (action === "reconcile-batch") {
        storage.reconcileSessions({ thresholdMs: 3600000, dryRun: false, confirm: true, agentId: "reconciler-worker" });
        process.exit(0);
      } else if (action === "hold-lock-and-die") {
        const res = storage.tryAcquireLockDetailed("project-state-transaction", "dying-agent", 800);
        if (res.acquired) {
          process.exit(0); // Exit immediately leaving lock on disk
        } else {
          process.exit(2);
        }
      } else {
        console.error(`Unknown worker action: ${action}`);
        process.exit(1);
      }
    } catch (err) {
      console.error("Worker exception:", err);
      process.exit(1);
    }
  })();
} else {
  // -------------------------------------------------------------------------
  // MAIN TEST SUITE
  // -------------------------------------------------------------------------
  runTestSuite().catch((err) => {
    console.error("Test runner exception:", err);
    process.exit(1);
  });
}

async function runTestSuite() {
  console.log("=== F12.3-E Multi-Process Concurrency & Single-Writer Forensic Audit Test Suite ===");

  const baseTestDir = path.join(process.cwd(), ".work", "scratch", "f123e-test-env-" + Date.now());
  if (!fs.existsSync(baseTestDir)) {
    fs.mkdirSync(baseTestDir, { recursive: true });
  }

  // -------------------------------------------------------------------------
  // TEST A: Concurrent Session Registration (2 Independent OS Child Processes)
  // -------------------------------------------------------------------------
  console.log("\n[TEST A] Concurrent Session Registration (2 Child Processes)...");
  const testDirA = path.join(baseTestDir, "test-a");
  const storageA = new StorageEngine(testDirA);
  storageA.ensureStorageStructure();

  const p1 = runWorkerProcess("register-batch", testDirA, "15", "proc-alpha");
  const p2 = runWorkerProcess("register-batch", testDirA, "15", "proc-beta");
  const [code1, code2] = await Promise.all([p1, p2]);

  assert(code1 === 0, "Child Process 1 exited with code 0");
  assert(code2 === 0, "Child Process 2 exited with code 0");

  const stateA = storageA.getOrInitProjectState();
  assert(stateA.sessions.length === 30, `Exactly 30 sessions registered (observed: ${stateA.sessions.length})`);
  const alphaCount = stateA.sessions.filter((s) => s.agentId === "proc-alpha").length;
  const betaCount = stateA.sessions.filter((s) => s.agentId === "proc-beta").length;
  assert(alphaCount === 15, "15 sessions from proc-alpha persisted");
  assert(betaCount === 15, "15 sessions from proc-beta persisted");

  // -------------------------------------------------------------------------
  // TEST B: Concurrent Registration + Status Update (2 Child Processes)
  // -------------------------------------------------------------------------
  console.log("\n[TEST B] Concurrent Registration + Status Update (2 Child Processes)...");
  const testDirB = path.join(baseTestDir, "test-b");
  const storageB = new StorageEngine(testDirB);
  storageB.ensureStorageStructure();

  const targetSess = storageB.registerSession({ agentId: "target-agent", status: "ACTIVE" });
  assert(targetSess.id !== undefined, "Initial target session created");

  const pb1 = runWorkerProcess("register-batch", testDirB, "10", "proc-gamma");
  const pb2 = runWorkerProcess("update-batch", testDirB, targetSess.id);
  const [codeB1, codeB2] = await Promise.all([pb1, pb2]);

  assert(codeB1 === 0, "Registration worker exited cleanly");
  assert(codeB2 === 0, "Update worker exited cleanly");

  const stateB = storageB.getOrInitProjectState();
  assert(stateB.sessions.length === 11, `11 total sessions present on disk (observed: ${stateB.sessions.length})`);
  const reloadedTarget = stateB.sessions.find((s) => s.id === targetSess.id);
  assert(reloadedTarget !== undefined, "Target session exists on disk");
  assert((reloadedTarget?.metadata as any)?.step === 9, "Target session metadata updated to step 9 without lost update");

  // -------------------------------------------------------------------------
  // TEST C: Concurrent Reconciliation + Session Registration
  // -------------------------------------------------------------------------
  console.log("\n[TEST C] Concurrent Reconciliation + Session Registration (2 Child Processes)...");
  const testDirC = path.join(baseTestDir, "test-c");
  const storageC = new StorageEngine(testDirC);
  storageC.ensureStorageStructure();

  // Create a stale session (lastActiveAt = 2 hours ago)
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
  const staleSess = storageC.registerSession({ agentId: "stale-agent", status: "ACTIVE", startedAt: twoHoursAgo });
  // Force update lastActiveAt to 2 hours ago
  const stateCPre = storageC.getOrInitProjectState();
  const foundStale = stateCPre.sessions.find((s) => s.id === staleSess.id);
  if (foundStale) foundStale.lastActiveAt = twoHoursAgo;
  storageC.saveProjectState(stateCPre);

  const pc1 = runWorkerProcess("reconcile-batch", testDirC);
  const pc2 = runWorkerProcess("register-batch", testDirC, "5", "proc-delta");
  const [codeC1, codeC2] = await Promise.all([pc1, pc2]);

  assert(codeC1 === 0, "Reconciliation worker exited cleanly");
  assert(codeC2 === 0, "Registration worker exited cleanly");

  const stateCPost = storageC.getOrInitProjectState();
  assert(stateCPost.sessions.length === 6, `6 total sessions present on disk (observed: ${stateCPost.sessions.length})`);
  const reloadedStale = stateCPost.sessions.find((s) => s.id === staleSess.id);
  assert(reloadedStale?.status === "ABORTED", "Stale session was successfully reconciled to ABORTED");
  const deltaSessions = stateCPost.sessions.filter((s) => s.agentId === "proc-delta");
  assert(deltaSessions.length === 5, "5 new sessions registered during reconciliation persisted cleanly");

  // -------------------------------------------------------------------------
  // TEST D: Lock Contention Behavior
  // -------------------------------------------------------------------------
  console.log("\n[TEST D] Lock Contention Behavior...");
  const testDirD = path.join(baseTestDir, "test-d");
  const storageD = new StorageEngine(testDirD);
  storageD.ensureStorageStructure();

  const lockRes1 = storageD.tryAcquireLockDetailed("resource-d", "agent-holder", 5000);
  assert(lockRes1.acquired === true, "First lock acquisition succeeded");
  assert(typeof lockRes1.token === "string", "Acquisition token generated");

  const lockRes2 = storageD.tryAcquireLockDetailed("resource-d", "agent-contender", 5000);
  assert(lockRes2.acquired === false, "Second lock acquisition failed due to contention");

  const releaseOk = storageD.releaseLockDetailed("resource-d", "agent-holder", lockRes1.token);
  assert(releaseOk === true, "First owner released lock with matching token");

  const lockRes3 = storageD.tryAcquireLockDetailed("resource-d", "agent-contender", 5000);
  assert(lockRes3.acquired === true, "Contender acquired lock after release");
  storageD.releaseLockDetailed("resource-d", "agent-contender", lockRes3.token);

  // -------------------------------------------------------------------------
  // TEST E: Expired Lock Recovery Under Contention (Atomic Rename Recovery)
  // -------------------------------------------------------------------------
  console.log("\n[TEST E] Expired Lock Recovery Under Contention...");
  const testDirE = path.join(baseTestDir, "test-e");
  const storageE = new StorageEngine(testDirE);
  storageE.ensureStorageStructure();

  const locksDirE = path.join(testDirE, ".openmemory", "locks");
  if (!fs.existsSync(locksDirE)) fs.mkdirSync(locksDirE, { recursive: true });

  const expiredLockFile = path.join(locksDirE, "test_resource_e.lock");
  const expiredPayload = JSON.stringify({
    owner: "dead-agent",
    token: "tok_dead_1000",
    pid: 99999,
    acquiredAt: Date.now() - 10000,
    expiresAt: Date.now() - 5000, // Expired 5 seconds ago
  });
  fs.writeFileSync(expiredLockFile, expiredPayload, "utf-8");

  const recoverRes = storageE.tryAcquireLockDetailed("test_resource_e", "recovery-agent", 5000);
  assert(recoverRes.acquired === true, "Expired lock recovered automatically via atomic rename");
  assert(recoverRes.token !== undefined && recoverRes.token.includes("recovery-agent"), "New acquisition token assigned to recovery agent");
  storageE.releaseLockDetailed("test_resource_e", "recovery-agent", recoverRes.token);

  // -------------------------------------------------------------------------
  // TEST F: Old Owner Attempts to Release Newer Owner's Lock (Token Protection)
  // -------------------------------------------------------------------------
  console.log("\n[TEST F] Token Protection Against Foreign Lock Release...");
  const testDirF = path.join(baseTestDir, "test-f");
  const storageF = new StorageEngine(testDirF);
  storageF.ensureStorageStructure();

  const tokenOwnerA = "tok_agentA_1001";
  const tokenOwnerB = "tok_agentB_2002";

  const locksDirF = path.join(testDirF, ".openmemory", "locks");
  if (!fs.existsSync(locksDirF)) fs.mkdirSync(locksDirF, { recursive: true });
  const lockFileF = path.join(locksDirF, "protected_resource.lock");

  // Lock currently held by Agent B with token B
  const payloadB = JSON.stringify({
    owner: "agent-B",
    token: tokenOwnerB,
    pid: 8888,
    acquiredAt: Date.now(),
    expiresAt: Date.now() + 5000,
  });
  fs.writeFileSync(lockFileF, payloadB, "utf-8");

  // Agent A tries to release with old token A
  const releaseAttempt = storageF.releaseLockDetailed("protected_resource", "agent-A", tokenOwnerA);
  assert(releaseAttempt === false, "releaseLockDetailed refused to delete lock with mismatched token A");

  assert(fs.existsSync(lockFileF), "Lock file remains intact on disk");
  const remainingContent = JSON.parse(fs.readFileSync(lockFileF, "utf-8"));
  assert(remainingContent.token === tokenOwnerB, "Lock file on disk retains Agent B's token");

  // Cleanup
  storageF.releaseLockDetailed("protected_resource", "agent-B", tokenOwnerB);

  // -------------------------------------------------------------------------
  // TEST G: Process Termination While Holding Lock (Deadlock Recovery)
  // -------------------------------------------------------------------------
  console.log("\n[TEST G] Process Termination Lock Recovery...");
  const testDirG = path.join(baseTestDir, "test-g");
  const storageG = new StorageEngine(testDirG);
  storageG.ensureStorageStructure();

  const pgCode = await runWorkerProcess("hold-lock-and-die", testDirG);
  assert(pgCode === 0, "Dying worker acquired lock and exited abruptly");

  // Verify lock file is on disk
  const globalLockFile = path.join(testDirG, ".openmemory", "locks", "project-state-transaction.lock");
  assert(fs.existsSync(globalLockFile), "Abandoned lock file exists on disk");

  // Immediate acquisition attempt should fail while TTL is active
  const immediateAttempt = storageG.tryAcquireLockDetailed("project-state-transaction", "surviving-agent", 5000);
  assert(immediateAttempt.acquired === false, "Immediate acquisition fails while lock TTL is active");

  // Wait for lock to expire (TTL was 800ms)
  console.log("  Waiting 1000ms for lock TTL to expire...");
  await new Promise((r) => setTimeout(r, 1000));

  // Surviving process executes mutation via withStateLock
  let stateLockSucceeded = false;
  storageG.withStateLock(() => {
    stateLockSucceeded = true;
    storageG.registerSession({ agentId: "surviving-agent" });
  }, "surviving-agent");

  assert(stateLockSucceeded === true, "withStateLock successfully recovered abandoned lock after TTL expired");
  const stateG = storageG.getOrInitProjectState();
  assert(stateG.sessions.length === 1, "Session registered by surviving process persisted cleanly");

  console.log(`\n✅ ALL 7 MULTI-PROCESS CONCURRENCY TESTS PASSED (${assertionsPassed} assertions)`);
}
