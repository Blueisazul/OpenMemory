import { HandoffContinuity } from "../../src/storage/domains/handoff-continuity";
import { StorageEngine } from "../../src/storage";
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

async function runDomainTests() {
  console.log("\n--- RUNNING HANDOFF CONTINUITY DOMAIN TESTS ---");
  const domain = new HandoffContinuity();

  // 1. parseSections & auto-owned detection vs human-owned detection
  const sampleMd = `# Session Handoff — Test

**Active Goal:** Goal A
**Current Phase:** Phase 1

## Progress Summary
* Task 1 done
* Task 2 done

## Key Architectural Decisions
* Decision 1

## Uncommitted Work & Next Steps
1. Step 1

## Uncommitted Work and Next Steps
1. Step 2

## Custom Notes Section
Some human notes here.
`;

  const sections = domain.parseSections(sampleMd);
  assert(sections.length === 6, `Parsed 6 sections (got ${sections.length})`);
  assert(sections[0].title === "", "Preamble section has empty title");
  assert(sections[0].isAutoOwned === true, "Preamble section isAutoOwned is true");

  assert(sections[1].title === "Progress Summary", "Section 1 title is Progress Summary");
  assert(sections[1].isAutoOwned === true, "Progress Summary isAutoOwned is true");

  assert(sections[2].title === "Key Architectural Decisions", "Section 2 title is Key Architectural Decisions");
  assert(sections[2].isAutoOwned === false, "Key Architectural Decisions isAutoOwned is false (human-owned)");

  assert(sections[3].title === "Uncommitted Work & Next Steps", "Section 3 title is Uncommitted Work & Next Steps");
  assert(sections[3].isAutoOwned === true, "Uncommitted Work & Next Steps isAutoOwned is true");

  assert(sections[4].title === "Uncommitted Work and Next Steps", "Section 4 title is Uncommitted Work and Next Steps");
  assert(sections[4].isAutoOwned === true, "Uncommitted Work and Next Steps isAutoOwned is true");

  assert(sections[5].title === "Custom Notes Section", "Section 5 title is Custom Notes Section");
  assert(sections[5].isAutoOwned === false, "Custom Notes Section isAutoOwned is false");

  // 4. Empty sections & unknown sections
  const emptyMd = "";
  const emptySections = domain.parseSections(emptyMd);
  assert(emptySections.length === 1 && emptySections[0].title === "" && emptySections[0].content === "", "Empty Markdown produces 1 empty preamble section");

  // 7-11. truncateWords behavior
  const shortText = "Word1 Word2 Word3 Word4 Word5";
  const notTruncated = domain.truncateWords(shortText, 10);
  assert(notTruncated === shortText, "Below-limit text is not truncated");

  const exactText = "Word1 Word2 Word3 Word4 Word5";
  const atLimit = domain.truncateWords(exactText, 5);
  assert(atLimit === exactText, "At-limit text is not truncated");

  const longText = "Word1 Word2 Word3 Word4 Word5 Word6 Word7 Word8";
  const truncated = domain.truncateWords(longText, 5);
  assert(truncated.startsWith("Word1 Word2 Word3 Word4 Word5"), "Text truncated at exactly 5 words");
  assert(truncated.endsWith("\n\n*(Truncated to maxHandoffWords limit)*\n"), "Exact truncation marker present");

  // 12. Default OpenMemory handoff
  const omDefault = domain.formatDefaultHandoff({
    projectName: "OpenMemory Core",
    activeGoal: "Goal",
    activePhase: "Phase",
    isInternalOpenMemory: true,
  });
  assert(omDefault.includes("# OpenMemory Session Handoff"), "Default OpenMemory handoff title present");
  assert(omDefault.includes("Implement OpenMemory v0.1 Core Engine"), "Default OpenMemory goal present");

  // 13. Default Client handoff
  const clientDefault = domain.formatDefaultHandoff({
    projectName: "MyClientApp",
    activeGoal: "Build Feature X",
    activePhase: "DISCOVER",
    currentStatus: "IN_PROGRESS",
    isInternalOpenMemory: false,
  });
  assert(clientDefault.includes("# Session Handoff — MyClientApp"), "Default Client handoff title present");
  assert(clientDefault.includes("Build Feature X"), "Client activeGoal present");

  // 14-16. Compose Update & Preservation
  const updatedHandoff = domain.composeUpdate(
    sampleMd,
    {
      progressSummary: ["New Progress 1", "New Progress 2"],
      nextSteps: ["Next Step 1"],
    },
    {
      projectName: "TestProj",
      activeGoal: "Updated Goal",
      activePhase: "Phase 2",
      maxWords: 500,
      isInternalOpenMemory: false,
    }
  );

  assert(updatedHandoff.includes("**Active Goal:** Updated Goal"), "Updated goal in header");
  assert(updatedHandoff.includes("**Current Phase:** Phase 2"), "Updated phase in header");
  assert(updatedHandoff.includes("* New Progress 1"), "Updated progress summary present");
  assert(updatedHandoff.includes("1. Next Step 1"), "Updated next steps present");
  assert(updatedHandoff.includes("## Key Architectural Decisions\n* Decision 1"), "Human section verbatim preserved");
  assert(updatedHandoff.includes("## Custom Notes Section\nSome human notes here."), "Custom human section preserved");
}

async function runIntegrationTests() {
  console.log("\n--- RUNNING HANDOFF FACADE INTEGRATION TESTS ---");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f1334-handoff-"));
  try {
    const storage = new StorageEngine(tmpDir);
    const handoff = storage.getOrInitHandoff();
    assert(typeof handoff === "string" && handoff.length > 0, "getOrInitHandoff returns valid handoff");

    const sections = storage.parseHandoffSections(handoff);
    assert(Array.isArray(sections) && sections.length > 0, "parseHandoffSections returns sections array via facade");

    // Init session for update authorization
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

    const updated = storage.updateHandoff(
      {
        activeGoal: "Facade Goal",
        progressSummary: ["Facade Item 1"],
      },
      "agent-1",
      "sess-1"
    );

    assert(updated.includes("Facade Goal"), "updateHandoff delegates and preserves lock/auth");
    assert(storage.getOrInitHandoff().includes("Facade Goal"), "saveHandoff persisted through facade");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    await runDomainTests();
    await runIntegrationTests();
    console.log("\n✅ ALL F13.3.4 HANDOFF CONTINUITY TESTS PASSED");
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  }
}

main();
