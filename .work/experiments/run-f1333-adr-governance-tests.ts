import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { ADRGovernance } from "../../src/storage/domains/adr-governance";
import { ADRRecord, ADRVote } from "../../src/storage/types";

async function runF1333Tests() {
  console.log("=================================================");
  console.log("🧪 RUNNING F13.3.3 ADR GOVERNANCE TEST SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f1333");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const gov = new ADRGovernance();

    // -------------------------------------------------------------------------
    // PART 1: ADRGOVERNANCE DOMAIN UNIT TESTS (100% PURE DOMAIN)
    // -------------------------------------------------------------------------
    console.log("--- PART 1: ADRGOVERNANCE DOMAIN UNIT TESTS ---");

    // Test 1: ID Generation
    const id1 = gov.generateNextId([]);
    if (id1 !== "ADR-001") throw new Error(`Expected ADR-001, got ${id1}`);
    const id2 = gov.generateNextId(["ADR-001", "ADR-002"]);
    if (id2 !== "ADR-003") throw new Error(`Expected ADR-003, got ${id2}`);
    console.log("  [PASS] 1. generateNextId preserves existing.length + 1 rule");

    // Test 2: Consensus Evaluation
    const draftAdr: ADRRecord = {
      id: "ADR-001",
      title: "Test Architecture Decision",
      status: "PROPOSED",
      date: "2026-10-03",
      context: "Context description",
      decision: "Decision description",
      requiredVotes: 2,
      votes: [],
    };

    if (gov.evaluateConsensus(draftAdr) !== "PROPOSED") {
      throw new Error(`Expected PROPOSED for empty votes, got ${gov.evaluateConsensus(draftAdr)}`);
    }

    const vote1: ADRVote = { agentId: "agent-1", decision: "APPROVE", timestamp: new Date().toISOString() };
    const { updatedADR: adr1, newStatus: status1 } = gov.applyVote(draftAdr, vote1);
    if (status1 !== "IN_REVIEW") throw new Error(`Expected IN_REVIEW with 1 vote, got ${status1}`);
    console.log("  [PASS] 2a. Consensus evaluation: 1/2 APPROVE yields IN_REVIEW");

    const vote2: ADRVote = { agentId: "agent-2", decision: "APPROVE", timestamp: new Date().toISOString() };
    const { updatedADR: adr2, newStatus: status2 } = gov.applyVote(adr1, vote2);
    if (status2 !== "ACCEPTED") throw new Error(`Expected ACCEPTED with 2/2 APPROVE, got ${status2}`);
    console.log("  [PASS] 2b. Consensus evaluation: 2/2 APPROVE yields ACCEPTED");

    const voteReject: ADRVote = { agentId: "agent-3", decision: "REJECT", timestamp: new Date().toISOString() };
    const { updatedADR: adr3, newStatus: status3 } = gov.applyVote(adr2, voteReject);
    if (status3 !== "REJECTED") throw new Error(`Expected REJECTED with 1 REJECT vote, got ${status3}`);
    console.log("  [PASS] 2c. Consensus evaluation: REJECT vote yields REJECTED");

    // Test 3: Direct Status Mutation Safeguard
    try {
      gov.validateDirectStatusMutation("ACCEPTED");
      throw new Error("Should have thrown for direct ACCEPTED mutation");
    } catch (err: any) {
      if (!err.message.includes("Direct mutation of ADR status")) throw err;
    }
    try {
      gov.validateDirectStatusMutation("REJECTED");
      throw new Error("Should have thrown for direct REJECTED mutation");
    } catch (err: any) {
      if (!err.message.includes("Direct mutation of ADR status")) throw err;
    }
    gov.validateDirectStatusMutation("PROPOSED");
    gov.validateDirectStatusMutation("IN_REVIEW");
    console.log("  [PASS] 3. Direct status mutation safeguard verified");

    // Test 4: Format and Parse Markdown Round-Trip
    const formattedMd = gov.formatADRMarkdown(adr2);
    if (!formattedMd.includes("# ADR-001: Test Architecture Decision")) throw new Error("Header missing in formatted Markdown");
    if (!formattedMd.includes("<!-- ADRData:")) throw new Error("Metadata JSON comment missing in formatted Markdown");

    const parsedAdr = gov.parseADRMarkdown(formattedMd, "ADR-001.md");
    if (parsedAdr.id !== "ADR-001") throw new Error(`Parsed ID mismatch: ${parsedAdr.id}`);
    if (parsedAdr.title !== "Test Architecture Decision") throw new Error(`Parsed Title mismatch: ${parsedAdr.title}`);
    if (parsedAdr.status !== "ACCEPTED") throw new Error(`Parsed Status mismatch: ${parsedAdr.status}`);
    if (parsedAdr.votes.length !== 2) throw new Error(`Parsed Votes count mismatch: ${parsedAdr.votes.length}`);
    console.log("  [PASS] 4. Markdown format and parse round-trip verified");


    // -------------------------------------------------------------------------
    // PART 2: STORAGEENGINE INTEGRATION & ORCHESTRATION TESTS
    // -------------------------------------------------------------------------
    console.log("\n--- PART 2: STORAGEENGINE INTEGRATION & ORCHESTRATION TESTS ---");

    const storage = new StorageEngine(testDir);
    const session = storage.registerSession({ agentId: "lead-agent" });

    // Test 5: Save ADR via StorageEngine Facade
    const savedRecord = storage.saveADR(
      {
        title: "Adopt Next.js Web Framework",
        context: "Evaluating web framework for dashboard.",
        decision: "Adopt Next.js v15 with App Router.",
        consequences: "Fast server rendering and SSR capabilities.",
        requiredVotes: 2,
      },
      "lead-agent",
      session.id
    );

    if (savedRecord.id !== "ADR-001") throw new Error(`Expected ADR-001, got ${savedRecord.id}`);
    if (savedRecord.status !== "PROPOSED") throw new Error(`Expected PROPOSED, got ${savedRecord.status}`);
    console.log("  [PASS] 5. saveADR via StorageEngine facade created ADR-001");

    // Test 6: Vote on ADR with Session Authorization & Advisory Lock
    const votedRecord1 = storage.voteADR("ADR-001", "lead-agent", session.id, "APPROVE", "Strongly agree");
    if (votedRecord1.status !== "IN_REVIEW") throw new Error(`Expected IN_REVIEW, got ${votedRecord1.status}`);

    const workerSession = storage.registerSession({ agentId: "worker-agent-1" });
    const votedRecord2 = storage.voteADR("ADR-001", "worker-agent-1", workerSession.id, "APPROVE", "LGTM");
    if (votedRecord2.status !== "ACCEPTED") throw new Error(`Expected ACCEPTED after 2 votes, got ${votedRecord2.status}`);
    console.log("  [PASS] 6. voteADR voting consensus reached ACCEPTED status");

    // Test 7: List & Get ADRs via StorageEngine Facade
    const allAdrs = storage.listADRs();
    if (allAdrs.length !== 1) throw new Error(`Expected 1 ADR in list, got ${allAdrs.length}`);

    const fetchedAdr = storage.getADR("ADR-001");
    if (!fetchedAdr) throw new Error("getADR returned null");
    if (fetchedAdr.status !== "ACCEPTED") throw new Error(`Fetched status mismatch: ${fetchedAdr.status}`);
    console.log("  [PASS] 7. listADRs & getADR returned accurate persisted records");

    // Test 8: Event Log Telemetry Integration
    const eventsPath = path.join(testDir, ".openmemory", "logs", "events.jsonl");
    if (!fs.existsSync(eventsPath)) throw new Error(`Events log not found at ${eventsPath}`);

    const eventLines = fs.readFileSync(eventsPath, "utf-8").trim().split("\n");
    const eventTypes = eventLines.map(l => JSON.parse(l).eventType);
    if (!eventTypes.includes("adr.saved")) throw new Error("Missing adr.saved event in telemetry log");
    if (!eventTypes.includes("adr.voted")) throw new Error("Missing adr.voted event in telemetry log");
    console.log("  [PASS] 8. Audit events adr.saved and adr.voted logged in canonical telemetry path");

    console.log("\n=================================================");
    console.log("✅ ALL F13.3.3 ADR GOVERNANCE TESTS PASSED!");
    console.log("=================================================\n");

  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runF1333Tests().catch((err) => {
  console.error("❌ F13.3.3 Test Suite Failed:", err);
  process.exit(1);
});
