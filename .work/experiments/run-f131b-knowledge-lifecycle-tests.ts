import * as fs from "fs";
import * as path from "path";
import { StorageEngine, ResearchRecord } from "../../src/storage";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function runF131bKnowledgeLifecycleTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING F13.1-B KNOWLEDGE LIFECYCLE TEST SUITE");
  console.log("=================================================");

  const testDir = path.join(process.cwd(), ".work", "scratch", `test-f131b-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();

    const sessLead = storage.registerSession({
      agentId: "agent-lead",
      hostId: "host-local",
    });
    const sessWorker = storage.registerSession({
      agentId: "agent-worker",
      hostId: "host-local",
    });
    const sessHuman = storage.registerSession({
      agentId: "human-admin",
      hostId: "host-local",
    });
    const sessSubWorker = storage.registerSession({
      agentId: "agent-sub-worker",
      hostId: "host-local",
    });
    const sessionId = sessLead.id;

    // -------------------------------------------------------------
    // Test 1: Legacy Item Normalization (missing state -> LEGACY_UNEVALUATED without disk write)
    // -------------------------------------------------------------
    console.log("\n[Test 1] Legacy Item Normalization");
    const legacyPath = path.join(testDir, ".openmemory", "knowledge", "researches", "RES-LEGACY-001.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });

    const rawLegacyRecord = {
      id: "RES-LEGACY-001",
      topic: "Legacy F12 Architectural Memory",
      category: "ARCHITECTURE",
      summary: "Baseline memory before F13",
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionId: "sess-legacy-f12",
      agentId: "agent-legacy",
      items: [
        {
          id: "RES-LEGACY-001-ITEM-1",
          type: "FINDING",
          classification: "HYPOTHESIS",
          title: "Legacy Hypothesis Title",
          content: "Legacy hypothesis content",
          provenance: {
            url: "https://legacy.example.com",
            agentId: "agent-original-f12",
            sessionId: "sess-original-f12",
            timestamp: "2026-09-01T10:00:00.000Z",
          },
        },
      ],
    };
    fs.writeFileSync(legacyPath, JSON.stringify(rawLegacyRecord, null, 2), "utf-8");

    // Read record via getResearch
    const readLegacy = storage.getResearch("RES-LEGACY-001")!;
    assert(readLegacy !== null, "Legacy research record must be found");
    assert(readLegacy.items[0].lifecycleState === "LEGACY_UNEVALUATED", "Missing lifecycleState must default to LEGACY_UNEVALUATED");

    // Verify disk was NOT mutated
    const diskContentRaw = fs.readFileSync(legacyPath, "utf-8");
    assert(!diskContentRaw.includes("LEGACY_UNEVALUATED"), "Read normalization MUST NOT mutate file on disk");
    console.log("  ✅ PASS: Missing lifecycleState normalized to LEGACY_UNEVALUATED on read without disk mutation");

    // -------------------------------------------------------------
    // Test 2: Legacy Item -> VALIDATED with valid evidence
    // -------------------------------------------------------------
    console.log("\n[Test 2] Legacy Item -> VALIDATED");
    const valRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-001",
      itemId: "RES-LEGACY-001-ITEM-1",
      targetState: "VALIDATED",
      actorId: "agent-worker",
      sessionId: sessWorker.id,
      actorRole: "WORKER_AGENT",
      evidenceReference: "EVIDENCE-SUITE-RUN-992",
      evaluationRationale: "Re-verified via automated test suite execution",
    });

    assert(valRes.success === true, "Legacy -> VALIDATED must succeed with valid evidenceReference");
    assert(valRes.item?.lifecycleState === "VALIDATED", "Lifecycle state must be VALIDATED");
    assert(valRes.item?.validatedAt !== undefined, "validatedAt timestamp must be recorded");
    console.log("  ✅ PASS: Legacy item successfully transitioned to VALIDATED with evidence");

    // -------------------------------------------------------------
    // Test 3: Legacy Item -> ACCEPTED (OPERATIONAL_ADOPTION, HUMAN_OPERATOR)
    // -------------------------------------------------------------
    console.log("\n[Test 3] Legacy Item -> ACCEPTED (HUMAN_OPERATOR)");
    // Create new legacy item
    const legacyPath2 = path.join(testDir, ".openmemory", "knowledge", "researches", "RES-LEGACY-002.json");
    const rawLegacyRecord2 = {
      ...rawLegacyRecord,
      id: "RES-LEGACY-002",
      items: [{ ...rawLegacyRecord.items[0], id: "RES-LEGACY-002-ITEM-1" }],
    };
    fs.writeFileSync(legacyPath2, JSON.stringify(rawLegacyRecord2, null, 2), "utf-8");

    const humanAcceptRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-002",
      itemId: "RES-LEGACY-002-ITEM-1",
      targetState: "ACCEPTED",
      actorId: "human-admin",
      sessionId: sessHuman.id,
      actorRole: "HUMAN_OPERATOR",
      acceptanceBasis: "OPERATIONAL_ADOPTION",
      evaluationRationale: "Human operator adopting baseline architecture into active project operational policy",
    });

    assert(humanAcceptRes.success === true, "Direct legacy acceptance by HUMAN_OPERATOR must succeed");
    assert(humanAcceptRes.item?.lifecycleState === "ACCEPTED", "Item state must be ACCEPTED");
    assert(humanAcceptRes.item?.evaluation?.acceptanceBasis === "OPERATIONAL_ADOPTION", "Acceptance basis must be OPERATIONAL_ADOPTION");
    console.log("  ✅ PASS: Direct legacy acceptance by HUMAN_OPERATOR succeeded");

    // -------------------------------------------------------------
    // Test 4: Legacy Item -> ACCEPTED (OPERATIONAL_ADOPTION, LEAD_AGENT)
    // -------------------------------------------------------------
    console.log("\n[Test 4] Legacy Item -> ACCEPTED (LEAD_AGENT)");
    const legacyPath3 = path.join(testDir, ".openmemory", "knowledge", "researches", "RES-LEGACY-003.json");
    const rawLegacyRecord3 = {
      ...rawLegacyRecord,
      id: "RES-LEGACY-003",
      items: [{ ...rawLegacyRecord.items[0], id: "RES-LEGACY-003-ITEM-1" }],
    };
    fs.writeFileSync(legacyPath3, JSON.stringify(rawLegacyRecord3, null, 2), "utf-8");

    const leadAcceptRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-003",
      itemId: "RES-LEGACY-003-ITEM-1",
      targetState: "ACCEPTED",
      actorId: "agent-lead",
      sessionId: sessionId,
      actorRole: "LEAD_AGENT",
      acceptanceBasis: "OPERATIONAL_ADOPTION",
      evaluationRationale: "Lead agent adopting core architectural baseline for multi-agent coordination policy",
    });

    assert(leadAcceptRes.success === true, "Direct legacy acceptance by LEAD_AGENT must succeed");
    assert(leadAcceptRes.item?.lifecycleState === "ACCEPTED", "Item state must be ACCEPTED");
    console.log("  ✅ PASS: Direct legacy acceptance by LEAD_AGENT succeeded");

    // -------------------------------------------------------------
    // Test 5: WORKER_AGENT Attempting Legacy -> ACCEPTED Must Fail
    // -------------------------------------------------------------
    console.log("\n[Test 5] WORKER_AGENT Acceptance Rejection");
    const legacyPath4 = path.join(testDir, ".openmemory", "knowledge", "researches", "RES-LEGACY-004.json");
    const rawLegacyRecord4 = {
      ...rawLegacyRecord,
      id: "RES-LEGACY-004",
      items: [{ ...rawLegacyRecord.items[0], id: "RES-LEGACY-004-ITEM-1" }],
    };
    fs.writeFileSync(legacyPath4, JSON.stringify(rawLegacyRecord4, null, 2), "utf-8");

    const workerFailRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-004",
      itemId: "RES-LEGACY-004-ITEM-1",
      targetState: "ACCEPTED",
      actorId: "agent-sub-worker",
      sessionId: sessSubWorker.id,
      actorRole: "WORKER_AGENT",
      acceptanceBasis: "OPERATIONAL_ADOPTION",
      evaluationRationale: "Worker agent attempting acceptance without lead authority",
    });

    assert(workerFailRes.success === false, "WORKER_AGENT must NOT be authorized to accept knowledge");
    assert(workerFailRes.reason?.includes("Unauthorized acceptance") || false, "Must cite unauthorized acceptance");
    console.log(`  Worker rejection reason: ${workerFailRes.reason}`);
    console.log("  ✅ PASS: WORKER_AGENT direct acceptance strictly rejected");

    // -------------------------------------------------------------
    // Test 6: Acceptance Without Rationale Must Fail
    // -------------------------------------------------------------
    console.log("\n[Test 6] Acceptance Without Rationale Rejection");
    const noRationaleRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-004",
      itemId: "RES-LEGACY-004-ITEM-1",
      targetState: "ACCEPTED",
      actorId: "agent-lead",
      sessionId: sessionId,
      actorRole: "LEAD_AGENT",
      acceptanceBasis: "OPERATIONAL_ADOPTION",
      evaluationRationale: "", // Invalid empty rationale
    });

    assert(noRationaleRes.success === false, "Acceptance without rationale must fail");
    assert(noRationaleRes.reason?.includes("requires an evaluationRationale") || false, "Must cite missing rationale");
    console.log("  ✅ PASS: Acceptance without rationale rejected");

    // -------------------------------------------------------------
    // Test 7: Authority Decoupled from Code Edit Gates
    // -------------------------------------------------------------
    console.log("\n[Test 7] Authority Decoupled from Code Edit Gates");
    // Verify lead agent can accept knowledge regardless of stage engine code edit flags
    const decoupledRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-004",
      itemId: "RES-LEGACY-004-ITEM-1",
      targetState: "ACCEPTED",
      actorId: "agent-lead",
      sessionId: sessionId,
      actorRole: "LEAD_AGENT",
      acceptanceBasis: "OPERATIONAL_ADOPTION",
      evaluationRationale: "Lead agent validating knowledge governance independently of stage code gates",
    });

    assert(decoupledRes.success === true, "Knowledge acceptance authority operates strictly on actorRole (LEAD_AGENT)");
    console.log("  ✅ PASS: Knowledge acceptance authority decoupled from code edit gates");

    // -------------------------------------------------------------
    // Test 8: VALIDATED -> ACCEPTED with EVIDENCE_VALIDATED
    // -------------------------------------------------------------
    console.log("\n[Test 8] VALIDATED -> ACCEPTED with EVIDENCE_VALIDATED");
    const valAcceptedRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-001", // ITEM-1 is currently VALIDATED from Test 2
      itemId: "RES-LEGACY-001-ITEM-1",
      targetState: "ACCEPTED",
      actorId: "agent-lead",
      sessionId: sessionId,
      actorRole: "LEAD_AGENT",
      acceptanceBasis: "EVIDENCE_VALIDATED",
      evaluationRationale: "Lead agent adopting empirically validated item",
    });

    assert(valAcceptedRes.success === true, "VALIDATED -> ACCEPTED transition must succeed");
    assert(valAcceptedRes.item?.lifecycleState === "ACCEPTED", "Lifecycle state must be ACCEPTED");
    assert(valAcceptedRes.item?.evaluation?.acceptanceBasis === "EVIDENCE_VALIDATED", "Basis must be EVIDENCE_VALIDATED");
    console.log("  ✅ PASS: VALIDATED -> ACCEPTED with EVIDENCE_VALIDATED succeeded");

    // -------------------------------------------------------------
    // Test 9 & 10: Original Provenance Preservation & Evaluation Provenance Separation
    // -------------------------------------------------------------
    console.log("\n[Test 9 & 10] Provenance Preservation & Evaluation Separation");
    const evaluatedItem = valAcceptedRes.item!;
    assert(evaluatedItem.provenance.agentId === "agent-original-f12", "Original provenance agentId MUST remain unchanged");
    assert(evaluatedItem.provenance.sessionId === "sess-original-f12", "Original provenance sessionId MUST remain unchanged");
    assert(evaluatedItem.provenance.url === "https://legacy.example.com", "Original provenance url MUST remain unchanged");

    assert(evaluatedItem.evaluation !== undefined, "Evaluation provenance object MUST be populated");
    assert(evaluatedItem.evaluation?.evaluatedByAgentId === "agent-lead", "Evaluation agentId stored in evaluation object");
    assert(evaluatedItem.evaluation?.evaluatedInSessionId === sessionId, "Evaluation sessionId stored in evaluation object");
    console.log("  ✅ PASS: Original provenance untouched, evaluation provenance recorded separately");

    // -------------------------------------------------------------
    // Test 11: SUPERSEDED Cannot Be Resurrected
    // -------------------------------------------------------------
    console.log("\n[Test 11] SUPERSEDED Terminal Protection");
    // Move item to SUPERSEDED
    const supersRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-001",
      itemId: "RES-LEGACY-001-ITEM-1",
      targetState: "SUPERSEDED",
      actorId: "agent-lead",
      sessionId: sessionId,
      actorRole: "LEAD_AGENT",
      evaluationRationale: "Superseded by newer research findings",
    });
    assert(supersRes.success === true, "Transition to SUPERSEDED must succeed");

    // Attempt resurrection from SUPERSEDED to ACCEPTED
    const resurrectSupersRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-001",
      itemId: "RES-LEGACY-001-ITEM-1",
      targetState: "ACCEPTED",
      actorId: "human-admin",
      sessionId: sessHuman.id,
      actorRole: "HUMAN_OPERATOR",
      evaluationRationale: "Attempting resurrection from terminal state",
    });

    assert(resurrectSupersRes.success === false, "Resurrection from SUPERSEDED must fail");
    assert(resurrectSupersRes.reason?.includes("Terminal state protection") || false, "Must cite terminal state protection");
    console.log(`  Superseded resurrection rejection reason: ${resurrectSupersRes.reason}`);
    console.log("  ✅ PASS: SUPERSEDED state cannot be resurrected");

    // -------------------------------------------------------------
    // Test 12: DEPRECATED Cannot Be Resurrected
    // -------------------------------------------------------------
    console.log("\n[Test 12] DEPRECATED Terminal Protection");
    const depRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-002",
      itemId: "RES-LEGACY-002-ITEM-1",
      targetState: "DEPRECATED",
      actorId: "agent-lead",
      sessionId: sessionId,
      actorRole: "LEAD_AGENT",
      evaluationRationale: "Deprecated due to obsolete requirements",
    });
    assert(depRes.success === true, "Transition to DEPRECATED must succeed");

    const resurrectDepRes = storage.updateKnowledgeLifecycle({
      researchId: "RES-LEGACY-002",
      itemId: "RES-LEGACY-002-ITEM-1",
      targetState: "VALIDATED",
      actorId: "human-admin",
      sessionId: sessHuman.id,
      actorRole: "HUMAN_OPERATOR",
      evidenceReference: "EVIDENCE-TEST-RESURRECT",
    });

    assert(resurrectDepRes.success === false, "Resurrection from DEPRECATED must fail");
    assert(resurrectDepRes.reason?.includes("Terminal state protection") || false, "Must cite terminal state protection");
    console.log("  ✅ PASS: DEPRECATED state cannot be resurrected");

    // -------------------------------------------------------------
    // Test 13: Classification Orthogonality
    // -------------------------------------------------------------
    console.log("\n[Test 13] Classification Orthogonality");
    // ITEM-1 in RES-LEGACY-003 was set to ACCEPTED in Test 4
    const item3 = storage.getResearch("RES-LEGACY-003")!.items[0];
    assert(item3.classification === "HYPOTHESIS", "Classification must remain HYPOTHESIS");
    assert(item3.lifecycleState === "ACCEPTED", "Lifecycle state must be ACCEPTED");
    console.log("  ✅ PASS: Epistemological classification (HYPOTHESIS) preserved when lifecycle state becomes ACCEPTED");

    console.log("\n=================================================");
    console.log("🎉 ALL F13.1-B KNOWLEDGE LIFECYCLE TESTS PASSED 100%");
    console.log("=================================================\n");

  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runF131bKnowledgeLifecycleTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
