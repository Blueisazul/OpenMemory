import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";
import { runCLI } from "../../src/cli";
import { createMCPServer } from "../../src/mcp";
import { OpenMemoryPlugin } from "../../.opencode/plugins/openmemory";

async function runF81ContinuityCompactionTests() {
  console.log("=================================================");
  console.log("F8.1 — ADVANCED MULTI-SESSION CONTINUITY & COMPACTION SUITE");
  console.log("=================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f81");
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
      console.log(`  [PASS] Test ${total}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${total}: ${testName} - ${detail || "Assertion failed"}`);
      throw new Error(`Test failed: ${testName} - ${detail || ""}`);
    }
  }

  function assertStageStateAbsent(basePath: string, scenarioName: string) {
    const stagePath = path.join(basePath, ".openmemory", "stage-state.json");
    assert(!fs.existsSync(stagePath), `${scenarioName}: stage-state.json physically ABSENT from disk`);
  }

  // -------------------------------------------------------------------------
  // F81-01: Multi-Session Session Run Count Increment
  // -------------------------------------------------------------------------
  console.log("--- 1. Scenario F81-01: Multi-Session Run Count Increment ---");
  const dir01 = path.join(testDir, "F81_01");
  fs.mkdirSync(dir01, { recursive: true });

  const plugin01 = await OpenMemoryPlugin({
    client: {} as any,
    project: "F81SessionProject",
    directory: dir01,
    worktree: dir01,
    $: {} as any,
  });

  await plugin01.event({ event: { type: "session.created", properties: { info: { id: "sess-01-a" } } } });
  await plugin01.event({ event: { type: "session.created", properties: { info: { id: "sess-01-b" } } } });
  await plugin01.event({ event: { type: "session.created", properties: { info: { id: "sess-01-c" } } } });

  const storage01 = new StorageEngine(dir01);
  const state01 = storage01.getOrInitProjectState();
  assert(state01.sessionRunCount === 3, "F81-01: Session run count incremented to 3 across 3 sessions");
  assert(state01.lastSessionId === "sess-01-c", "F81-01: Last session ID updated to sess-01-c");
  assertStageStateAbsent(dir01, "F81-01");

  // -------------------------------------------------------------------------
  // F81-02: Handoff Word Ceiling Safeguard (< 600 Words Truncation)
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Scenario F81-02: Handoff Word Ceiling Safeguard ---");
  const dir02 = path.join(testDir, "F81_02");
  fs.mkdirSync(dir02, { recursive: true });

  const storage02 = new StorageEngine(dir02);
  storage02.registerSession({ id: "sess-f81-02", agentId: "agent-f81", status: "ACTIVE" });
  const longText = Array(800).fill("word").join(" ");
  storage02.updateHandoff({
    activeGoal: "Word Ceiling Goal",
    progressSummary: [longText],
  }, "agent-f81", "sess-f81-02");

  const handoffContent02 = storage02.getOrInitHandoff();
  const wordCount02 = handoffContent02.split(/\s+/).length;
  assert(wordCount02 <= 550, `F81-02: Handoff word count (${wordCount02}) bounded below max limit`);
  assert(handoffContent02.includes("*(Truncated to maxHandoffWords limit)*"), "F81-02: Truncation notice cleanly injected");
  assertStageStateAbsent(dir02, "F81-02");

  // -------------------------------------------------------------------------
  // F81-03: Preservation of Developer-Annotated Custom Markdown Sections
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Scenario F81-03: Human Section Preservation ---");
  const dir03 = path.join(testDir, "F81_03");
  fs.mkdirSync(dir03, { recursive: true });

  const storage03 = new StorageEngine(dir03);
  storage03.registerSession({ id: "sess-f81-03", agentId: "agent-f81", status: "ACTIVE" });
  let handoff03 = storage03.getOrInitHandoff();
  handoff03 += "\n\n## Developer Notes\nCustom human instructions that must survive compaction.\n";
  handoff03 += "\n## Key Architectural Decisions\n- ADR-001: Mandatory SQLite-free storage\n";
  storage03.saveHandoff(handoff03);

  storage03.updateHandoff({
    activeGoal: "Updated Goal in Session 2",
    progressSummary: ["New session activity completed."],
  }, "agent-f81", "sess-f81-03");

  const updatedHandoff03 = storage03.getOrInitHandoff();
  assert(updatedHandoff03.includes("## Developer Notes"), "F81-03: Preserved custom ## Developer Notes header");
  assert(updatedHandoff03.includes("Custom human instructions that must survive compaction."), "F81-03: Preserved human developer notes content 100% verbatim");
  assert(updatedHandoff03.includes("## Key Architectural Decisions"), "F81-03: Preserved ## Key Architectural Decisions header");
  assertStageStateAbsent(dir03, "F81-03");

  // -------------------------------------------------------------------------
  // F81-04: experimental.session.compacting Prompt Context Injection
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Scenario F81-04: Compacting Context Injection ---");
  const dir04 = path.join(testDir, "F81_04");
  fs.mkdirSync(dir04, { recursive: true });

  const plugin04 = await OpenMemoryPlugin({
    client: {} as any,
    project: "F81CompactingProject",
    directory: dir04,
    worktree: dir04,
    $: {} as any,
  });

  const compactingHook = (plugin04 as any)["experimental.session.compacting"];
  assert(typeof compactingHook === "function", "F81-04: experimental.session.compacting hook exported");

  const result04 = await compactingHook({ prompt: "User original prompt" }, { context: [], prompt: "User original prompt" });
  assert(Array.isArray(result04.context), "F81-04: Returns context array");
  assert(result04.context[0].includes("[OpenMemory Context Handoff]"), "F81-04: Injects OpenMemory Context Handoff header into context");
  assertStageStateAbsent(dir04, "F81-04");

  // -------------------------------------------------------------------------
  // F81-05: 10 Sequential Session Cycles Continuity Stress Test
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Scenario F81-05: 10 Sequential Session Cycles Stress Test ---");
  const dir05 = path.join(testDir, "F81_05");
  fs.mkdirSync(dir05, { recursive: true });

  for (let i = 1; i <= 10; i++) {
    const pluginCycle = await OpenMemoryPlugin({
      client: {} as any,
      project: "StressProject",
      directory: dir05,
      worktree: dir05,
      $: {} as any,
    });
    await pluginCycle.event({ event: { type: "session.created", properties: { info: { id: `sess-stress-${i}` } } } });
    await pluginCycle.event({ event: { type: "session.idle", properties: { sessionID: `sess-stress-${i}` } } });
    await pluginCycle.event({ event: { type: "session.compacted", properties: { sessionID: `sess-stress-${i}` }, summary: `Compaction cycle ${i}` } });
  }

  const storage05 = new StorageEngine(dir05);
  const state05 = storage05.getOrInitProjectState();
  assert(state05.sessionRunCount === 10, "F81-05: sessionRunCount accumulated 10 sessions cleanly");
  assert(state05.currentStatus === "COMPACTION_CHECKPOINT_SAVED", "F81-05: Final status is COMPACTION_CHECKPOINT_SAVED");
  assertStageStateAbsent(dir05, "F81-05");

  // -------------------------------------------------------------------------
  // F81-06: Compaction Metrics & Event Logging Verification
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Scenario F81-06: Event Logging Verification ---");
  const dir06 = path.join(testDir, "F81_06");
  fs.mkdirSync(dir06, { recursive: true });

  const plugin06 = await OpenMemoryPlugin({
    client: {} as any,
    project: "EventLoggingProject",
    directory: dir06,
    worktree: dir06,
    $: {} as any,
  });

  await plugin06.event({ event: { type: "session.created", properties: { info: { id: "log-sess-001" } } } });
  await plugin06.event({ event: { type: "session.compacted", properties: { sessionID: "log-sess-001" }, summary: "Log verification compaction" } });

  const eventLogFile = path.join(dir06, ".openmemory", "logs", "events.jsonl");
  assert(fs.existsSync(eventLogFile), "F81-06: events.jsonl log file created in .openmemory/logs/");

  const logContent = fs.readFileSync(eventLogFile, "utf-8");
  assert(logContent.includes("session.created"), "F81-06: Log recorded session.created event");
  assert(logContent.includes("session.compacted"), "F81-06: Log recorded session.compacted event");
  assertStageStateAbsent(dir06, "F81-06");

  // -------------------------------------------------------------------------
  // F81-07: Stage Engine Context Integration in Handoff
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Scenario F81-07: Stage Engine Handoff Integration ---");
  const dir07 = path.join(testDir, "F81_07");
  fs.mkdirSync(dir07, { recursive: true });

  const stage07 = new StageEngine(dir07);
  const promptContext = stage07.formatSystemPromptContext();
  assert(promptContext.includes("OPENMEMORY + OPENCODE ROADMAP, PHASE & STAGE GOVERNANCE"), "F81-07: System prompt context contains governance header");
  assert(promptContext.includes("Stage del Workflow Interno:"), "F81-07: Contains current stage information");
  assertStageStateAbsent(dir07, "F81-07");

  // -------------------------------------------------------------------------
  // F81-08: Zero Direct Write Regression Guard (Single Writer Preservation)
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Scenario F81-08: Zero Direct Write Regression Guard ---");
  const stageEngineCode = fs.readFileSync(path.join(process.cwd(), "src", "stage-engine.ts"), "utf-8");
  const pluginCode = fs.readFileSync(path.join(process.cwd(), ".opencode", "plugins", "openmemory.ts"), "utf-8");
  const mcpCode = fs.readFileSync(path.join(process.cwd(), "src", "mcp.ts"), "utf-8");
  const cliCode = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf-8");

  const directWriteRegex = /atomicWriteFileSync\s*\(\s*[^,]+(stage-state|project-state)/g;

  const stageEngineWrites = (stageEngineCode.match(directWriteRegex) || []).length;
  const pluginWrites = (pluginCode.match(directWriteRegex) || []).length;
  const mcpWrites = (mcpCode.match(directWriteRegex) || []).length;
  const cliWrites = (cliCode.match(directWriteRegex) || []).length;

  assert(stageEngineWrites === 0, "F81-08: StageEngine contains zero direct calls to write project/stage-state");
  assert(pluginWrites === 0, "F81-08: OpenCode Plugin contains zero direct calls to write project/stage-state");
  assert(mcpWrites === 0, "F81-08: MCP Server contains zero direct calls to write project/stage-state");
  assert(cliWrites === 0, "F81-08: CLI Engine contains zero direct calls to write project/stage-state");

  // Clean up scratch test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log("\n=================================================");
  console.log(`F8.1 TEST SUMMARY: ${passed}/${total} PASS`);
  console.log("=================================================");
}

runF81ContinuityCompactionTests();
