import { StorageEngine } from "../../src/storage";
import fs from "fs";
import path from "path";
import assert from "assert";

const rootDir = path.join(process.cwd(), ".openmemory_test_f172");

function cleanup() {
  if (fs.existsSync(rootDir)) {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

async function runTests() {
  cleanup();
  console.log("=================================================");
  console.log("🧪 RUNNING F17.2 AUTHORIZATION HARDENING TEST SUITE");
  console.log("=================================================");

  const storage = new StorageEngine(rootDir);

  // 1. Setup Session A (Agent A) and Research Record
  const sessA = storage.registerSession({ agentId: "Agent-A", status: "ACTIVE" });
  assert(sessA && sessA.id, "Session A must be created");

  const research = storage.saveResearch({
    topic: "Authorization Hardening Topic",
    category: "TEST",
    summary: "Testing session authorization hardening",
    items: [
      {
        id: "ITEM-A1",
        type: "FINDING",
        classification: "FACT",
        title: "Initial Item State",
        content: "Content for item A1",
        lifecycleState: "CREATED"
      }
    ]
  }, "Agent-A", sessA.id);

  assert.strictEqual(research.items[0].lifecycleState, "CREATED");

  // --- TEST CASE A: SAME OWNER TRANSITION ---
  console.log("\n--- TEST CASE A: SAME OWNER (Agent-A + Session-A) ---");
  const resSameOwner = storage.updateKnowledgeLifecycle({
    researchId: research.id,
    itemId: "ITEM-A1",
    targetState: "VALIDATED",
    actorId: "Agent-A",
    sessionId: sessA.id,
    actorRole: "WORKER_AGENT",
    evidenceReference: "EV-SAME-OWNER-001"
  });

  assert.strictEqual(resSameOwner.success, true, "Same owner lifecycle update must succeed");
  assert.strictEqual(resSameOwner.item?.lifecycleState, "VALIDATED", "Lifecycle state must update to VALIDATED");

  const recordAfterA = storage.getResearch(research.id);
  assert.strictEqual(recordAfterA?.items[0].lifecycleState, "VALIDATED", "Persisted lifecycle state must be VALIDATED");
  console.log("  [PASS] Same owner lifecycle mutation succeeded and persisted cleanly.");

  // --- TEST CASE B: FOREIGN SESSION REJECTION (Agent-B using Session-A) ---
  console.log("\n--- TEST CASE B: FOREIGN SESSION REJECTION (Agent-B using Session-A) ---");
  const sessB = storage.registerSession({ agentId: "Agent-B", status: "ACTIVE" });
  assert(sessB && sessB.id, "Session B must be created");

  const stateBeforeForeign = recordAfterA?.items[0].lifecycleState;
  const evalBeforeForeign = JSON.stringify(recordAfterA?.items[0].evaluation);

  let foreignErrorCaught = false;
  let foreignErrorMessage = "";

  try {
    storage.updateKnowledgeLifecycle({
      researchId: research.id,
      itemId: "ITEM-A1",
      targetState: "ACCEPTED",
      actorId: "Agent-B",
      sessionId: sessA.id, // FOREIGN SESSION ID BELONGING TO AGENT-A!
      actorRole: "LEAD_AGENT",
      acceptanceBasis: "EVIDENCE_VALIDATED",
      evaluationRationale: "Unauthorized attempt by Agent B using Session A"
    });
  } catch (err) {
    foreignErrorCaught = true;
    foreignErrorMessage = (err as Error).message;
  }

  assert(foreignErrorCaught, "Foreign session mutation MUST throw an authorization error");
  assert(
    foreignErrorMessage.includes("Authorization failed for updateKnowledgeLifecycle"),
    `Error message must indicate authorization failure (got: '${foreignErrorMessage}')`
  );
  console.log(`  [PASS] Foreign session rejected with expected error: '${foreignErrorMessage}'`);

  // --- VERIFY STATE INTEGRITY ---
  const recordAfterForeign = storage.getResearch(research.id);
  assert.strictEqual(
    recordAfterForeign?.items[0].lifecycleState,
    stateBeforeForeign,
    "Lifecycle state MUST remain unchanged after rejected foreign session attempt"
  );
  assert.strictEqual(
    JSON.stringify(recordAfterForeign?.items[0].evaluation),
    evalBeforeForeign,
    "Evaluation metadata MUST remain unchanged after rejected foreign session attempt"
  );
  console.log("  [PASS] Canonical state and evaluation metadata remained 100% unchanged post rejection.");

  cleanup();
  console.log("\n=================================================");
  console.log("✅ ALL F17.2 AUTHORIZATION HARDENING TESTS PASSED!");
  console.log("=================================================");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
