import { KnowledgeTMS } from "../../src/storage/domains/knowledge-tms";
import { StorageEngine } from "../../src/storage";
import { ResearchRecord } from "../../src/storage/types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`[PASS] ${message}`);
  }
}

async function runDomainUnitTests() {
  console.log("\n--- RUNNING KNOWLEDGETMS DOMAIN UNIT TESTS ---");
  const tms = new KnowledgeTMS();

  // 1. Lifecycle Transition Validation
  const termRes = tms.validateLifecycleTransition({
    currentState: "SUPERSEDED",
    targetState: "VALIDATED",
    actorRole: "LEAD_AGENT",
  });
  assert(!termRes.valid && termRes.reason?.includes("Terminal state protection"), "Terminal state SUPERSEDED cannot be modified");

  const valNoEv = tms.validateLifecycleTransition({
    currentState: "CREATED",
    targetState: "VALIDATED",
    actorRole: "WORKER_AGENT",
  });
  assert(!valNoEv.valid && valNoEv.reason?.includes("evidenceReference"), "VALIDATED requires evidenceReference");

  const accWorker = tms.validateLifecycleTransition({
    currentState: "VALIDATED",
    targetState: "ACCEPTED",
    actorRole: "WORKER_AGENT",
    evaluationRationale: "Looks good",
  });
  assert(!accWorker.valid && accWorker.reason?.includes("Unauthorized acceptance"), "WORKER_AGENT cannot transition to ACCEPTED");

  const accLead = tms.validateLifecycleTransition({
    currentState: "VALIDATED",
    targetState: "ACCEPTED",
    actorRole: "LEAD_AGENT",
    evaluationRationale: "Evidence verified by lead",
  });
  assert(accLead.valid, "LEAD_AGENT transition to ACCEPTED succeeds");

  // 2. Relation Validation & Cycle Detection
  const invalidType = tms.validateRelationCreation([], {
    relationType: "INVALID_TYPE" as any,
    sourceItemId: "K1",
    targetItemId: "K2",
    sourceItemExistsInRecord: true,
  });
  assert(!invalidType.valid && invalidType.reason?.includes("Invalid relationType"), "Invalid relation type rejected");

  const selfRel = tms.validateRelationCreation([], {
    relationType: "SUPPORTS",
    sourceItemId: "K1",
    targetItemId: "K1",
    sourceItemExistsInRecord: true,
  });
  assert(!selfRel.valid && selfRel.reason?.includes("Self-relation rejected"), "Self-relation rejected");

  const ownerMismatch = tms.validateRelationCreation([], {
    relationType: "SUPPORTS",
    sourceItemId: "K1",
    targetItemId: "K2",
    sourceItemExistsInRecord: false,
  });
  assert(!ownerMismatch.valid && ownerMismatch.reason?.includes("Source ownership mismatch"), "Source ownership mismatch rejected");

  const existingSup: any[] = [
    { id: "R1", relationType: "SUPERSEDES", sourceItemId: "K1", targetItemId: "K2", owningResearchRecordId: "RES-1" },
    { id: "R2", relationType: "SUPERSEDES", sourceItemId: "K2", targetItemId: "K3", owningResearchRecordId: "RES-1" },
  ];
  const supCycle = tms.validateRelationCreation(existingSup, {
    relationType: "SUPERSEDES",
    sourceItemId: "K3",
    targetItemId: "K1",
    sourceItemExistsInRecord: true,
  });
  assert(!supCycle.valid && supCycle.reason?.includes("Supersession cycle rejected"), "SUPERSEDES cycle rejected by domain guard");

  // 3. Pure TMS Analysis
  const sampleResearches: ResearchRecord[] = [
    {
      id: "RES-1",
      topic: "Topic 1",
      category: "GENERAL",
      summary: "Summary 1",
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentId: "agent-1",
      sessionId: "sess-1",
      items: [
        {
          id: "K1",
          type: "FACT",
          classification: "GROUND_TRUTH",
          title: "K1 Title",
          content: "K1 Content",
          provenance: { agentId: "agent-1", sessionId: "sess-1" },
          lifecycleState: "ACCEPTED",
        },
        {
          id: "K2",
          type: "FACT",
          classification: "GROUND_TRUTH",
          title: "K2 Title",
          content: "K2 Content",
          provenance: { agentId: "agent-1", sessionId: "sess-1" },
          lifecycleState: "VALIDATED",
        },
      ],
      relations: [
        {
          id: "REL-1",
          relationType: "SUPERSEDES",
          sourceItemId: "K1",
          targetItemId: "K2",
          createdAt: new Date().toISOString(),
          provenance: { agentId: "agent-1", sessionId: "sess-1" },
        },
      ],
    },
  ];

  const analysis = tms.analyzeTMS(sampleResearches);
  assert(analysis.overallStatus === "CONSISTENT", "Analysis of non-conflicting graph returns CONSISTENT");
  assert(analysis.items["K1"].derivedLineageStatus === "SUPERSEDING", "K1 is SUPERSEDING");
  assert(analysis.items["K2"].derivedLineageStatus === "SUPERSEDED_BY_ACCEPTED_SOURCE", "K2 is SUPERSEDED_BY_ACCEPTED_SOURCE");

  // Contradiction Test
  const contradictionResearches: ResearchRecord[] = [
    {
      id: "RES-2",
      topic: "Topic 2",
      category: "GENERAL",
      summary: "Summary 2",
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentId: "agent-1",
      sessionId: "sess-1",
      items: [
        { id: "A1", type: "FACT", classification: "GROUND_TRUTH", title: "A1", content: "A1", provenance: { agentId: "a1" } },
        { id: "A2", type: "FACT", classification: "GROUND_TRUTH", title: "A2", content: "A2", provenance: { agentId: "a1" } },
      ],
      relations: [
        {
          id: "REL-C",
          relationType: "CONTRADICTS",
          sourceItemId: "A1",
          targetItemId: "A2",
          createdAt: new Date().toISOString(),
          provenance: { agentId: "a1" },
        },
      ],
    },
  ];

  const contradictionAnalysis = tms.analyzeTMS(contradictionResearches);
  assert(contradictionAnalysis.overallStatus === "CONFLICTED", "Contradiction graph returns CONFLICTED");
  assert(contradictionAnalysis.items["A1"].derivedConflictState === "CONFLICTED", "A1 is CONFLICTED");
  assert(contradictionAnalysis.items["A2"].derivedConflictState === "CONFLICTED", "A2 is CONFLICTED via symmetric propagation");
}

async function runIntegrationTests() {
  console.log("\n--- RUNNING KNOWLEDGETMS STORAGEENGINE INTEGRATION TESTS ---");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f1336-tms-"));
  try {
    const storage = new StorageEngine(tmpDir);

    // Register active session
    const state = storage.getOrInitProjectState();
    state.sessions = [
      {
        id: "sess-1",
        agentId: "agent-1",
        status: "ACTIVE",
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
    ];
    storage.saveProjectState(state);

    // Save research
    const research = storage.saveResearch(
      {
        topic: "Architecture Research",
        category: "GENERAL",
        summary: "Testing TMS integration",
        status: "COMPLETED",
        items: [
          {
            id: "ITEM-1",
            type: "FACT",
            classification: "GROUND_TRUTH",
            title: "Item 1",
            content: "Content 1",
            provenance: { agentId: "agent-1", sessionId: "sess-1" },
            lifecycleState: "CREATED",
          },
          {
            id: "ITEM-2",
            type: "FACT",
            classification: "GROUND_TRUTH",
            title: "Item 2",
            content: "Content 2",
            provenance: { agentId: "agent-1", sessionId: "sess-1" },
            lifecycleState: "CREATED",
          },
        ],
      },
      "agent-1",
      "sess-1"
    );

    // Update lifecycle
    const valRes = storage.updateKnowledgeLifecycle({
      researchId: research.id,
      itemId: "ITEM-1",
      targetState: "VALIDATED",
      actorId: "agent-1",
      sessionId: "sess-1",
      evidenceReference: "https://example.com/spec",
    });
    assert(valRes.success && valRes.item?.lifecycleState === "VALIDATED", "StorageEngine facade delegated updateKnowledgeLifecycle to VALIDATED");

    const accRes = storage.updateKnowledgeLifecycle({
      researchId: research.id,
      itemId: "ITEM-1",
      targetState: "ACCEPTED",
      actorId: "agent-1",
      sessionId: "sess-1",
      actorRole: "LEAD_AGENT",
      evaluationRationale: "Approved after formal review",
    });
    assert(accRes.success && accRes.item?.lifecycleState === "ACCEPTED", "StorageEngine facade delegated updateKnowledgeLifecycle to ACCEPTED");

    // Add relation
    const relRes = storage.addKnowledgeRelation({
      researchId: research.id,
      relationType: "SUPERSEDES",
      sourceItemId: "ITEM-1",
      targetItemId: "ITEM-2",
      agentId: "agent-1",
      sessionId: "sess-1",
    });
    assert(relRes.success && Boolean(relRes.relation?.id), "StorageEngine facade delegated addKnowledgeRelation");

    // Analyze TMS
    const tmsResult = storage.analyzeKnowledgeTMS({ researchId: research.id });
    assert(tmsResult.overallStatus === "CONSISTENT", "analyzeKnowledgeTMS returns CONSISTENT status via facade");
    assert(tmsResult.items["ITEM-1"].derivedLineageStatus === "SUPERSEDING", "ITEM-1 is SUPERSEDING");
    assert(tmsResult.items["ITEM-2"].derivedLineageStatus === "SUPERSEDED_BY_ACCEPTED_SOURCE", "ITEM-2 is SUPERSEDED_BY_ACCEPTED_SOURCE");

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    await runDomainUnitTests();
    await runIntegrationTests();
    console.log("\n✅ ALL F13.3.6 KNOWLEDGETMS TESTS PASSED");
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  }
}

main();
