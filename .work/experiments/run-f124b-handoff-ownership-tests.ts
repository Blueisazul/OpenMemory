import fs from "fs";
import path from "path";
import assert from "assert";
import { StorageEngine } from "../../src/storage";

async function runF124BHandoffOwnershipTests() {
  console.log("==================================================================");
  console.log("RUNNING F12.4-B HANDOFF OWNERSHIP & MUTATION PROTECTION TESTS");
  console.log("==================================================================\n");

  const testDir = path.join(process.cwd(), ".work", "scratch-f124b-tests");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const storage = new StorageEngine(testDir);
  storage.ensureStorageStructure();

  // Helper to register session
  const createSession = (id: string, agentId: string, status: "ACTIVE" | "IDLE" | "COMPLETED" | "FAILED" | "ABORTED") => {
    storage.registerSession({ id, agentId, status });
  };

  // Register baseline sessions
  createSession("sess-active-01", "agent-alpha", "ACTIVE");
  createSession("sess-idle-01", "agent-idle", "IDLE");
  createSession("sess-completed-01", "agent-comp", "COMPLETED");
  createSession("sess-failed-01", "agent-fail", "FAILED");
  createSession("sess-aborted-01", "agent-abort", "ABORTED");

  // -------------------------------------------------------------------------
  // T-HANDOFF-OWNER-01: Authorized owner agent + active session -> SUCCESS
  // -------------------------------------------------------------------------
  console.log("Testing T-HANDOFF-OWNER-01: Authorized owner agent + active session -> SUCCESS...");
  const res01 = storage.updateHandoff(
    {
      activeGoal: "T01 Goal",
      progressSummary: ["T01 progress item 1", "T01 progress item 2"],
    },
    "agent-alpha",
    "sess-active-01"
  );
  assert(res01.includes("T01 Goal"), "T01: Updated active goal present");
  assert(res01.includes("T01 progress item 1"), "T01: Progress item present");
  console.log("  [PASS] T-HANDOFF-OWNER-01: Authorized active update verified.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-WRONG-AGENT-01: Wrong agent ID -> REJECT
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-WRONG-AGENT-01: Wrong agent ID -> REJECT...");
  assert.throws(
    () => {
      storage.updateHandoff(
        { activeGoal: "Hack Goal" },
        "agent-impostor",
        "sess-active-01"
      );
    },
    (err: any) => err.message.includes("does not match session assigned agent"),
    "T02: Mismatched agent rejected"
  );
  console.log("  [PASS] T-HANDOFF-WRONG-AGENT-01: Wrong agent ID rejected.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-WRONG-SESSION-01: Wrong session ID -> REJECT
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-WRONG-SESSION-01: Wrong session ID -> REJECT...");
  assert.throws(
    () => {
      storage.updateHandoff(
        { activeGoal: "Hack Goal" },
        "agent-alpha",
        "sess-non-existent"
      );
    },
    (err: any) => err.message.includes("does not exist in session registry"),
    "T03: Non-existent session rejected"
  );
  console.log("  [PASS] T-HANDOFF-WRONG-SESSION-01: Non-existent session rejected.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-UNKNOWN-SESSION-01: Unregistered session -> REJECT
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-UNKNOWN-SESSION-01: Unregistered session -> REJECT...");
  assert.throws(
    () => {
      storage.updateHandoff(
        { activeGoal: "Hack Goal" },
        "unregistered-agent",
        "unregistered-sess"
      );
    },
    (err: any) => err.message.includes("does not exist in session registry"),
    "T04: Unregistered session rejected"
  );
  console.log("  [PASS] T-HANDOFF-UNKNOWN-SESSION-01: Unregistered session rejected.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-IDLE-01: Session in state IDLE -> SUCCESS
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-IDLE-01: Session in state IDLE -> SUCCESS...");
  const res05 = storage.updateHandoff(
    {
      activeGoal: "IDLE Session Goal",
      progressSummary: ["Idle session progress update"],
    },
    "agent-idle",
    "sess-idle-01"
  );
  assert(res05.includes("IDLE Session Goal"), "T05: Idle session update succeeded");
  console.log("  [PASS] T-HANDOFF-IDLE-01: Idle session update verified.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-ABORTED-01: Session in state ABORTED -> REJECT
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-ABORTED-01: Session in state ABORTED -> REJECT...");
  assert.throws(
    () => {
      storage.updateHandoff(
        { activeGoal: "Aborted Hack Goal" },
        "agent-abort",
        "sess-aborted-01"
      );
    },
    (err: any) => err.message.includes("must be ACTIVE or IDLE"),
    "T06: Aborted session rejected"
  );
  console.log("  [PASS] T-HANDOFF-ABORTED-01: Aborted session rejected.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-COMPLETED-01: Session in state COMPLETED -> REJECT
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-COMPLETED-01: Session in state COMPLETED -> REJECT...");
  assert.throws(
    () => {
      storage.updateHandoff(
        { activeGoal: "Completed Hack Goal" },
        "agent-comp",
        "sess-completed-01"
      );
    },
    (err: any) => err.message.includes("must be ACTIVE or IDLE"),
    "T07: Completed session rejected"
  );
  console.log("  [PASS] T-HANDOFF-COMPLETED-01: Completed session rejected.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-FAILED-01: Session in state FAILED -> REJECT
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-FAILED-01: Session in state FAILED -> REJECT...");
  assert.throws(
    () => {
      storage.updateHandoff(
        { activeGoal: "Failed Hack Goal" },
        "agent-fail",
        "sess-failed-01"
      );
    },
    (err: any) => err.message.includes("must be ACTIVE or IDLE"),
    "T08: Failed session rejected"
  );
  console.log("  [PASS] T-HANDOFF-FAILED-01: Failed session rejected.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-HUMAN-SECTIONS-01: Human sections preserved verbatim
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-HUMAN-SECTIONS-01: Human sections preserved verbatim...");
  const initialHandoff = storage.getOrInitHandoff();
  const customHumanNotes = initialHandoff + "\n\n## Developer Notes\n* Verbatim human note 12345.\n\n## Key Architectural Decisions\n- ADR-999: SQLite free architecture.\n";
  storage.saveHandoff(customHumanNotes);

  const sectionsBefore = storage.parseHandoffSections(customHumanNotes);
  const devNotesBefore = sectionsBefore.find((s: any) => s.title === "Developer Notes")?.content;
  const keyDecisionsBefore = sectionsBefore.find((s: any) => s.title === "Key Architectural Decisions")?.content;

  const res09 = storage.updateHandoff(
    {
      progressSummary: ["New automated summary line."],
    },
    "agent-alpha",
    "sess-active-01"
  );

  const sectionsAfter = storage.parseHandoffSections(res09);
  const devNotesAfter = sectionsAfter.find((s: any) => s.title === "Developer Notes")?.content;
  const keyDecisionsAfter = sectionsAfter.find((s: any) => s.title === "Key Architectural Decisions")?.content;

  assert.strictEqual(devNotesAfter, devNotesBefore, "T09: Developer Notes section must be byte-for-byte identical");
  assert.strictEqual(keyDecisionsAfter, keyDecisionsBefore, "T09: Key Architectural Decisions section must be byte-for-byte identical");
  console.log("  [PASS] T-HANDOFF-HUMAN-SECTIONS-01: Human sections verbatim preservation verified.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-STALE-WRITE-01: Stale Session A overwrite attempt rejected
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-STALE-WRITE-01: Stale Session A overwrite attempt rejected...");
  createSession("sess-A-stale", "agent-A", "ACTIVE");
  storage.updateHandoff({ activeGoal: "Session A Goal" }, "agent-A", "sess-A-stale");

  // Aging session A to 2 hours ago
  const stateA = storage.getOrInitProjectState();
  const sessAObj = stateA.sessions.find(s => s.id === "sess-A-stale");
  if (sessAObj) {
    sessAObj.lastActiveAt = new Date(Date.now() - 7200000).toISOString();
    storage.saveProjectState(stateA);
  }

  // Reconcile Session A -> ABORTED
  storage.reconcileSessions({ dryRun: false, confirm: true, thresholdMs: 3600000 });
  const sessA = storage.getSession("sess-A-stale");
  assert(sessA?.status === "ABORTED", "Session A successfully aborted by reconciliation");

  // Create Session B -> ACTIVE
  createSession("sess-B-active", "agent-B", "ACTIVE");
  const bRes = storage.updateHandoff({ activeGoal: "Session B Goal Authorized" }, "agent-B", "sess-B-active");
  assert(bRes.includes("Session B Goal Authorized"), "Session B successfully wrote active goal");

  // Session A attempts stale overwrite -> MUST FAIL
  assert.throws(
    () => {
      storage.updateHandoff({ activeGoal: "Session A Stale Overwrite Goal" }, "agent-A", "sess-A-stale");
    },
    (err: any) => err.message.includes("must be ACTIVE or IDLE"),
    "T10: Session A stale write strictly rejected"
  );

  // Confirm Session B's content remains 100% intact
  const currentHandoff = storage.getOrInitHandoff();
  assert(currentHandoff.includes("Session B Goal Authorized"), "Session B active goal remains intact");
  assert(!currentHandoff.includes("Session A Stale Overwrite Goal"), "Session A stale goal absent");
  console.log("  [PASS] T-HANDOFF-STALE-WRITE-01: Stale write rejection & content integrity verified.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-CONCURRENT-01: Serialized cooperating writers under lock
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-CONCURRENT-01: Serialized cooperating writers under lock...");
  createSession("sess-C-1", "agent-C1", "ACTIVE");
  createSession("sess-C-2", "agent-C2", "ACTIVE");

  const update1 = storage.updateHandoff({ activeGoal: "Goal from C1" }, "agent-C1", "sess-C-1");
  const update2 = storage.updateHandoff({ activeGoal: "Goal from C2" }, "agent-C2", "sess-C-2");
  assert(update2.includes("Goal from C2"), "Sequential update C2 succeeded cleanly");
  console.log("  [PASS] T-HANDOFF-CONCURRENT-01: Serialized cooperating writers verified.");

  // -------------------------------------------------------------------------
  // T-HANDOFF-RECONCILIATION-01: Narrative reconciliation evidence in handoff
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-RECONCILIATION-01: Narrative reconciliation evidence in handoff...");
  createSession("sess-reconcile-target", "agent-target", "ACTIVE");
  // Set lastActiveAt to 2 hours ago
  const state = storage.getOrInitProjectState();
  const targetSess = state.sessions.find(s => s.id === "sess-reconcile-target");
  if (targetSess) {
    targetSess.lastActiveAt = new Date(Date.now() - 7200000).toISOString();
    storage.saveProjectState(state);
  }

  const recResult = storage.reconcileSessions({ dryRun: false, confirm: true, thresholdMs: 3600000 });
  assert(recResult.reconciledCount >= 1, "At least 1 session reconciled");

  const reconHandoff = storage.getOrInitHandoff();
  assert(
    reconHandoff.includes("[SYSTEM RECONCILIATION]") || reconHandoff.includes("aborted due to inactivity"),
    "T12: Narrative reconciliation evidence logged in handoff.md"
  );
  // -------------------------------------------------------------------------
  // T-HANDOFF-MISSING-IDENTITY-01: Call missing required identity -> REJECT
  // -------------------------------------------------------------------------
  console.log("\nTesting T-HANDOFF-MISSING-IDENTITY-01: Call missing required identity -> REJECT...");
  assert.throws(
    () => {
      (storage as any).updateHandoff({ activeGoal: "Unauthenticated Goal" });
    },
    (err: any) => err.message.includes("Missing required ownership parameters for updateHandoff"),
    "T-HANDOFF-MISSING-IDENTITY-01: Missing agentId/sessionId rejected unconditionally"
  );
  assert.throws(
    () => {
      (storage as any).updateHandoff({ activeGoal: "Unauthenticated Goal" }, undefined, undefined);
    },
    (err: any) => err.message.includes("Missing required ownership parameters for updateHandoff"),
    "T-HANDOFF-MISSING-IDENTITY-01: Explicit undefined parameters rejected unconditionally"
  );
  console.log("  [PASS] T-HANDOFF-MISSING-IDENTITY-01: Missing identity parameters unconditionally rejected.");

  console.log("\n==================================================================");
  console.log("ALL F12.4-B TESTS (T-HANDOFF-OWNER-01 - T-HANDOFF-MISSING-IDENTITY-01) PASSED!");
  console.log("==================================================================");
}

runF124BHandoffOwnershipTests().catch((err) => {
  console.error("F12.4-B TEST SUITE FAILED:", err);
  process.exit(1);
});
