import * as fs from "fs";
import * as path from "path";
import { StorageEngine, ResearchRecord, KnowledgeItem } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { runCLI } from "../../src/cli";
import { createMCPServer } from "../../src/mcp";
import { OpenMemoryPlugin } from "../../.opencode/plugins/openmemory";

async function runF91MultiAgentKnowledgeTests() {
  console.log("=================================================");
  console.log("F9.1 — MULTI-AGENT KNOWLEDGE SYNCHRONIZATION SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f91");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    }
  }

  try {
    const legacyStagePath = path.join(testDir, ".openmemory", "stage-state.json");
    const storageMain = new StorageEngine(testDir);
    storageMain.ensureStorageStructure();

    // -------------------------------------------------------------
    // F91-01 & F91-02: 5-Agent Simultaneous Knowledge Mutation Concurrency Test
    // -------------------------------------------------------------
    console.log("Scenario F91-01 & F91-02: 5-Agent Simultaneous Concurrency Test & Zero Data Loss");
    const agentIds = ["agent-alpha", "agent-beta", "agent-gamma", "agent-delta", "agent-epsilon"];
    const promises: Promise<ResearchRecord>[] = [];

    // Launch 5 simultaneous parallel writes from 5 different agents
    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];
      const sessionId = `sess-${agentId}-100`;

      const recordTask = Promise.resolve().then(() => {
        const engine = new StorageEngine(testDir);
        return engine.saveResearch({
          id: `RES-${agentId.toUpperCase()}-001`,
          topic: `Architecture Study by ${agentId}`,
          category: "CONCURRENCY_RESEARCH",
          summary: `Findings produced concurrently by ${agentId}`,
          status: "COMPLETED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sessionId,
          agentId,
          items: [
            {
              id: `ITEM-${agentId}-1`,
              type: "FINDING",
              classification: "CONCLUSION",
              title: `Finding 1 from ${agentId}`,
              content: `Detailed empirical content recorded by ${agentId}`,
              provenance: {
                agentId,
                sessionId,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });
      });
      promises.push(recordTask);
    }

    const results = await Promise.all(promises);
    assert(results.length === 5, "F91-01a: All 5 parallel agent record tasks resolved successfully");

    const allResearches = storageMain.listResearches();
    assert(allResearches.length === 5, "F91-02a: All 5 research records persisted on disk without data loss");

    // Verify valid JSON parse for each persisted file
    let corruptFiles = 0;
    const researchesDir = path.join(testDir, ".openmemory", "knowledge", "researches");
    const files = fs.readdirSync(researchesDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(researchesDir, f), "utf-8");
        JSON.parse(content);
      } catch {
        corruptFiles++;
      }
    }
    assert(corruptFiles === 0, "F91-02b: Zero JSON syntax corruption detected across all parallel files");

    // -------------------------------------------------------------
    // F91-03: Provenance Traceability (agentId & sessionId)
    // -------------------------------------------------------------
    console.log("\nScenario F91-03: Provenance Traceability by agentId and sessionId");
    for (const agentId of agentIds) {
      const rec = allResearches.find((r) => r.agentId === agentId);
      assert(rec !== undefined, `F91-03a: Provenance agentId '${agentId}' present in research record`);
      assert(rec?.sessionId === `sess-${agentId}-100`, `F91-03b: Session ID matched for '${agentId}'`);
      assert(rec?.items[0]?.provenance?.agentId === agentId, `F91-03c: KnowledgeItem provenance agentId matched for '${agentId}'`);
    }

    // -------------------------------------------------------------
    // F91-04: Knowledge Query Filtering by agentId
    // -------------------------------------------------------------
    console.log("\nScenario F91-04: Knowledge Query Filtering by agentId");
    const gammaResearches = storageMain.listResearches({ agentId: "agent-gamma" });
    assert(gammaResearches.length === 1, "F91-04a: StorageEngine.listResearches filtered exactly 1 record for agent-gamma");
    assert(gammaResearches[0].topic.includes("agent-gamma"), "F91-04b: Returned record topic matches agent-gamma");

    const deltaItems = storageMain.queryKnowledgeItems({ agentId: "agent-delta" });
    assert(deltaItems.length === 1, "F91-04c: queryKnowledgeItems returned exactly 1 item for agent-delta");
    assert(deltaItems[0].item.title.includes("agent-delta"), "F91-04d: Returned item title matches agent-delta");

    // CLI query test with --agent-id
    const cliOutput = await runCLI(["query", "--agent-id", "agent-beta"], testDir);
    assert(cliOutput.includes("agent-beta"), "F91-04e: CLI query --agent-id agent-beta returned filtered results");

    // -------------------------------------------------------------
    // F91-05: Structured Event Log Accumulation Across 5 Agents
    // -------------------------------------------------------------
    console.log("\nScenario F91-05: Structured Event Log Accumulation across Multi-Agent Events");
    for (const agentId of agentIds) {
      const plugin = await OpenMemoryPlugin({
        directory: testDir,
        worktree: testDir,
        client: {} as any,
        project: "MultiAgentProject",
        $: {} as any,
      });
      await plugin.event({ event: { type: "session.created", properties: { info: { id: `sess-${agentId}-100` } } } });
      await plugin.event({ event: { type: "session.idle", properties: { sessionID: `sess-${agentId}-100` } } });
    }

    const logPath = path.join(testDir, ".openmemory", "logs", "events.jsonl");
    assert(fs.existsSync(logPath), "F91-05a: Events log file exists at .openmemory/logs/events.jsonl");

    const logLines = fs.readFileSync(logPath, "utf-8").trim().split("\n").filter((l) => l.trim().length > 0);
    assert(logLines.length >= 10, "F91-05b: At least 10 event entries recorded chronologically");

    let validLogSyntax = true;
    for (const line of logLines) {
      try {
        JSON.parse(line);
      } catch {
        validLogSyntax = false;
      }
    }
    assert(validLogSyntax, "F91-05c: All JSONL log entries maintain 100% valid JSON syntax without line corruption");

    // -------------------------------------------------------------
    // F91-06: Consolidated handoff.md Preserving Human Developer Notes Verbatim
    // -------------------------------------------------------------
    console.log("\nScenario F91-06: Consolidated handoff.md Preserving Human Notes Verbatim");
    const handoffPath = path.join(testDir, ".openmemory", "handoff.md");
    const handoffWithNotes = `# OPENMEMORY HANDOFF & CONTINUITY SNAPSHOT

## Executive Summary
Multi-agent operations active.

## Key Architectural Decisions
- Decision ADR-020: Multi-agent atomic concurrency guaranteed by StorageEngine.

## Developer Notes
- Custom multi-agent developer notes preserved 100% verbatim.
`;
    fs.writeFileSync(handoffPath, handoffWithNotes, "utf-8");

    // Trigger multi-agent state update via StorageEngine
    storageMain.updateHandoff({
      progressSummary: ["Agent Alpha completed task A.", "Agent Beta completed task B."],
      nextSteps: ["Proceed to multi-agent validation phase."],
    });

    const updatedHandoff = fs.readFileSync(handoffPath, "utf-8");
    assert(updatedHandoff.includes("## Key Architectural Decisions"), "F91-06a: Key Architectural Decisions preserved verbatim");
    assert(updatedHandoff.includes("## Developer Notes"), "F91-06b: Developer Notes header preserved verbatim");
    assert(updatedHandoff.includes("Custom multi-agent developer notes preserved 100% verbatim"), "F91-06c: Developer notes content 100% verbatim");
    assert(updatedHandoff.includes("Agent Alpha completed task A."), "F91-06d: Progress summary cleanly updated in handoff");

    // -------------------------------------------------------------
    // F91-07: Physical Absence Verification Strategy for stage-state.json
    // -------------------------------------------------------------
    console.log("\nScenario F91-07: Physical Absence Verification for stage-state.json");
    assert(!fs.existsSync(legacyStagePath), "F91-07a: stage-state.json is physically ABSENT from active workspace");

    // Perform state mutations and re-verify absence
    const stateMutated = storageMain.getOrInitProjectState();
    stateMutated.sessionRunCount += 5;
    storageMain.saveProjectState(stateMutated);
    assert(!fs.existsSync(legacyStagePath), "F91-07b: stage-state.json remains ABSENT after state mutations");

    // -------------------------------------------------------------
    // F91-08: Zero-Write Regression Guard (Single Writer Invariant)
    // -------------------------------------------------------------
    console.log("\nScenario F91-08: Zero-Write Regression Guard (Single Writer Invariant)");
    const storageCode = fs.readFileSync(path.join(process.cwd(), "src", "storage.ts"), "utf-8");
    const stageEngineCode = fs.readFileSync(path.join(process.cwd(), "src", "stage-engine.ts"), "utf-8");

    const directStageWrites = (stageEngineCode.match(/writeFileSync\([^)]*stage-state\.json/g) || []).length;
    assert(directStageWrites === 0, "F91-08a: StageEngine has ZERO direct writes to stage-state.json");

    assert(!fs.existsSync(legacyStagePath), "F91-08b: Active workspace has ZERO stage-state.json file");

    console.log("\n=================================================");
    console.log(`F9.1 TEST SUMMARY: ${passed}/${total} ASSERTIONS PASSED`);
    console.log("=================================================\n");

    if (passed !== total) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("F9.1 Test Suite Execution Error:", err);
    process.exit(1);
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runF91MultiAgentKnowledgeTests();
