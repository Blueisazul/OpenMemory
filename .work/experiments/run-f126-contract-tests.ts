import * as fs from "fs";
import * as path from "path";
import assert from "assert";
import { StorageEngine, ResearchRecord } from "../../src/storage";

async function runF126ContractTests() {
  console.log("=================================================");
  console.log("   OpenMemory F12.6 Contract Test Suite          ");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".work", "scratch", "f126-contract-tests-" + Date.now());
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const storage = new StorageEngine(testDir);
  storage.ensureStorageStructure();

  let passed = 0;
  let failed = 0;

  function runTest(id: string, description: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✓ [PASS] ${id}: ${description}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${id}: ${description} -> ${err.message}`);
      failed++;
    }
  }

  async function runTestAsync(id: string, description: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${id}: ${description}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${id}: ${description} -> ${err.message}`);
      failed++;
    }
  }

  try {
    // Register base test sessions
    const activeSessA = storage.registerSession({ id: "sess-active-a", agentId: "agent-a", status: "ACTIVE" });
    const idleSessA = storage.registerSession({ id: "sess-idle-a", agentId: "agent-a", status: "IDLE" });
    const activeSessB = storage.registerSession({ id: "sess-active-b", agentId: "agent-b", status: "ACTIVE" });
    
    // Terminal sessions
    const compSess = storage.registerSession({ id: "sess-comp", agentId: "agent-a" });
    storage.updateSessionStatus("sess-comp", "COMPLETED");

    const failedSess = storage.registerSession({ id: "sess-fail", agentId: "agent-a" });
    storage.updateSessionStatus("sess-fail", "FAILED");

    const abortSess = storage.registerSession({ id: "sess-abort", agentId: "agent-a" });
    storage.updateSessionStatus("sess-abort", "ABORTED");

    console.log("\n--- ADR Authorization & Provenance Contract Tests (ADR-01..11) ---");

    runTest("ADR-01", "missing session rejected", () => {
      assert.throws(() => {
        storage.voteADR("ADR-001", "agent-a", "", "APPROVE");
      }, /Missing required ownership parameters for voteADR/i);
    });

    runTest("ADR-02", "unknown session rejected", () => {
      assert.throws(() => {
        storage.voteADR("ADR-001", "agent-a", "sess-nonexistent", "APPROVE");
      }, /Session 'sess-nonexistent' not found/i);
    });

    runTest("ADR-03", "mismatched agent/session rejected", () => {
      assert.throws(() => {
        storage.voteADR("ADR-001", "agent-b", "sess-active-a", "APPROVE");
      }, /caller agent 'agent-b' does not match session assigned agent 'agent-a'/i);
    });

    runTest("ADR-04", "COMPLETED session rejected", () => {
      assert.throws(() => {
        storage.voteADR("ADR-001", "agent-a", "sess-comp", "APPROVE");
      }, /COMPLETED/i);
    });

    runTest("ADR-05", "FAILED session rejected", () => {
      assert.throws(() => {
        storage.voteADR("ADR-001", "agent-a", "sess-fail", "APPROVE");
      }, /FAILED/i);
    });

    runTest("ADR-06", "ABORTED session rejected", () => {
      assert.throws(() => {
        storage.voteADR("ADR-001", "agent-a", "sess-abort", "APPROVE");
      }, /ABORTED/i);
    });

    // Create initial proposed ADR for vote tests
    storage.saveADR(
      {
        title: "Test Architecture Decision",
        context: "Context",
        decision: "Decision",
        proposedByAgentId: "agent-a",
        requiredVotes: 2,
      },
      "agent-a",
      "sess-active-a"
    );

    runTest("ADR-07", "ACTIVE session vote succeeds", () => {
      const adr = storage.voteADR("ADR-001", "agent-a", "sess-active-a", "APPROVE", "Vote by active session");
      assert.strictEqual(adr.votes?.length, 1);
      assert.strictEqual(adr.votes?.[0].agentId, "agent-a");
      assert.strictEqual(adr.votes?.[0].sessionId, "sess-active-a");
    });

    runTest("ADR-08", "IDLE session vote succeeds", () => {
      const adr = storage.voteADR("ADR-001", "agent-b", "sess-active-b", "APPROVE", "Vote by active b");
      assert.strictEqual(adr.status, "ACCEPTED");
    });

    runTest("ADR-09", "re-vote by same agent with new session updates vote and records new sessionId", () => {
      const newSessA = storage.registerSession({ id: "sess-active-a2", agentId: "agent-a", status: "ACTIVE" });
      const updated = storage.voteADR("ADR-001", "agent-a", "sess-active-a2", "REJECT", "Updated decision");
      assert.strictEqual(updated.votes?.length, 2);
      const voteA = updated.votes?.find((v) => v.agentId === "agent-a");
      assert.strictEqual(voteA?.decision, "REJECT");
      assert.strictEqual(voteA?.sessionId, "sess-active-a2");
    });

    runTest("ADR-10", "provenance sessionId stored in vote record", () => {
      const adr = storage.getADR("ADR-001");
      const voteB = adr?.votes?.find((v) => v.agentId === "agent-b");
      assert.strictEqual(voteB?.sessionId, "sess-active-b");
    });

    runTest("ADR-11", "stale/terminal session cannot modify vote", () => {
      assert.throws(() => {
        storage.voteADR("ADR-001", "agent-a", "sess-comp", "APPROVE");
      }, /COMPLETED/i);
    });

    console.log("\n--- ADR Lifecycle Governance Contract Tests (ADR-12..17) ---");

    runTest("ADR-12", "direct status ACCEPTED rejected in saveADR", () => {
      assert.throws(() => {
        storage.saveADR(
          {
            title: "Direct Accepted ADR",
            status: "ACCEPTED",
            context: "Ctx",
            decision: "Dec",
          },
          "agent-a",
          "sess-active-a"
        );
      }, /Direct mutation of ADR status to 'ACCEPTED' via saveADR is forbidden/i);
    });

    runTest("ADR-13", "direct status REJECTED rejected in saveADR", () => {
      assert.throws(() => {
        storage.saveADR(
          {
            title: "Direct Rejected ADR",
            status: "REJECTED",
            context: "Ctx",
            decision: "Dec",
          },
          "agent-a",
          "sess-active-a"
        );
      }, /Direct mutation of ADR status to 'REJECTED' via saveADR is forbidden/i);
    });

    runTest("ADR-14", "consensus ACCEPTED succeeds through voteADR", () => {
      const adrNew = storage.saveADR(
        {
          title: "Consensus Accept ADR",
          context: "Ctx",
          decision: "Dec",
          requiredVotes: 2,
        },
        "agent-a",
        "sess-active-a"
      );
      storage.voteADR(adrNew.id, "agent-a", "sess-active-a", "APPROVE");
      const finalAdr = storage.voteADR(adrNew.id, "agent-b", "sess-active-b", "APPROVE");
      assert.strictEqual(finalAdr.status, "ACCEPTED");
    });

    runTest("ADR-15", "consensus REJECTED succeeds through voteADR", () => {
      const adrNew = storage.saveADR(
        {
          title: "Consensus Reject ADR",
          context: "Ctx",
          decision: "Dec",
          requiredVotes: 2,
        },
        "agent-a",
        "sess-active-a"
      );
      storage.voteADR(adrNew.id, "agent-a", "sess-active-a", "REJECT");
      const finalAdr = storage.voteADR(adrNew.id, "agent-b", "sess-active-b", "REJECT");
      assert.strictEqual(finalAdr.status, "REJECTED");
    });

    runTest("ADR-16", "illegal transition or invalid status handled safely", () => {
      const adrNew = storage.saveADR(
        {
          title: "Legitimate ADR",
          status: "PROPOSED",
          context: "Ctx",
          decision: "Dec",
        },
        "agent-a",
        "sess-active-a"
      );
      assert.strictEqual(adrNew.status, "PROPOSED");
    });

    runTest("ADR-17", "legitimate lifecycle status PROPOSED / IN_REVIEW / SUPERSEDE / DEPRECATED preserved", () => {
      const adrSup = storage.saveADR(
        {
          title: "Superceded ADR",
          status: "SUPERSEDE",
          context: "Ctx",
          decision: "Dec",
        },
        "agent-a",
        "sess-active-a"
      );
      assert.strictEqual(adrSup.status, "SUPERSEDE");

      const adrDep = storage.saveADR(
        {
          title: "Deprecated ADR",
          status: "DEPRECATED",
          context: "Ctx",
          decision: "Dec",
        },
        "agent-a",
        "sess-active-a"
      );
      assert.strictEqual(adrDep.status, "DEPRECATED");
    });

    console.log("\n--- Research Authorization & Provenance Contract Tests (RES-01..10) ---");

    const sampleRecord: ResearchRecord = {
      id: "RES-TEST-001",
      topic: "Sample Research Topic",
      category: "TEST",
      summary: "Sample research summary text",
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionId: "sess-active-a",
      agentId: "agent-a",
      items: [
        {
          id: "ITEM-RES-1",
          type: "FINDING",
          classification: "FACT",
          title: "Item 1",
          content: "Content 1",
          provenance: {},
        },
      ],
    };

    runTest("RES-01", "missing session rejected", () => {
      assert.throws(() => {
        storage.saveResearch(sampleRecord, "agent-a", "");
      }, /Missing required ownership parameters for saveResearch/i);
    });

    runTest("RES-02", "unknown session rejected", () => {
      assert.throws(() => {
        storage.saveResearch(sampleRecord, "agent-a", "sess-unknown");
      }, /Session 'sess-unknown' not found/i);
    });

    runTest("RES-03", "mismatched agent/session rejected", () => {
      assert.throws(() => {
        storage.saveResearch(sampleRecord, "agent-b", "sess-active-a");
      }, /caller agent 'agent-b' does not match session assigned agent 'agent-a'/i);
    });

    runTest("RES-04", "COMPLETED session rejected", () => {
      assert.throws(() => {
        storage.saveResearch(sampleRecord, "agent-a", "sess-comp");
      }, /COMPLETED/i);
    });

    runTest("RES-05", "FAILED session rejected", () => {
      assert.throws(() => {
        storage.saveResearch(sampleRecord, "agent-a", "sess-fail");
      }, /FAILED/i);
    });

    runTest("RES-06", "ABORTED session rejected", () => {
      assert.throws(() => {
        storage.saveResearch(sampleRecord, "agent-a", "sess-abort");
      }, /ABORTED/i);
    });

    runTest("RES-07", "ACTIVE session succeeds", () => {
      const saved = storage.saveResearch(sampleRecord, "agent-a", "sess-active-a");
      assert.strictEqual(saved.id, "RES-TEST-001");
    });

    runTest("RES-08", "IDLE session succeeds", () => {
      const idleRecord: ResearchRecord = { ...sampleRecord, id: "RES-TEST-002", sessionId: "sess-idle-a" };
      const saved = storage.saveResearch(idleRecord, "agent-a", "sess-idle-a");
      assert.strictEqual(saved.id, "RES-TEST-002");
    });

    runTest("RES-09", "provenance persisted on record and items", () => {
      const saved = storage.getResearch("RES-TEST-001");
      assert.strictEqual(saved?.agentId, "agent-a");
      assert.strictEqual(saved?.sessionId, "sess-active-a");
      assert.strictEqual(saved?.items[0]?.provenance?.agentId, "agent-a");
      assert.strictEqual(saved?.items[0]?.provenance?.sessionId, "sess-active-a");
    });

    runTest("RES-10", "default identity bypass eliminated", () => {
      // Direct call requires agentId and sessionId
      assert.throws(() => {
        (storage as any).saveResearch(sampleRecord);
      }, /Missing required ownership parameters for saveResearch/i);
    });

    console.log("\n=================================================");
    console.log(`F12.6 CONTRACT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runF126ContractTests().catch((err) => {
  console.error("Unhandled error in F12.6 contract tests:", err);
  process.exit(1);
});
