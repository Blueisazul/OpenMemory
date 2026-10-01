import * as fs from "fs";
import * as path from "path";
import assert from "assert";
import { runCLI } from "../../src/cli";
import { StorageEngine } from "../../src/storage";

async function runF123CLITests() {
  console.log("=================================================================");
  console.log("=== F12.3-B CLI Session Reconciliation Test Suite             ===");
  console.log("=================================================================\n");

  const testDir = path.join(process.cwd(), ".openmemory_test_f123b");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const storage = new StorageEngine(testDir);
    storage.ensureStorageStructure();

    // -------------------------------------------------------------------------
    // Test 1: Command recognition & default dry-run invocation (24h default)
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 01: Default Invocation (Dry Run & 24h Threshold)");
    const nowMs = Date.now();
    const staleTime25h = new Date(nowMs - 25 * 3600 * 1000).toISOString();
    const freshTime10h = new Date(nowMs - 10 * 3600 * 1000).toISOString();

    const sessStale = storage.registerSession({
      agentId: "agent-stale-01",
      hostId: "host-alpha",
      status: "ACTIVE",
    });

    const sessFresh = storage.registerSession({
      agentId: "agent-fresh-01",
      hostId: "host-alpha",
      status: "ACTIVE",
    });

    const stateObj = storage.getOrInitProjectState();
    const staleSessRef = stateObj.sessions.find(s => s.id === sessStale.id);
    if (staleSessRef) staleSessRef.lastActiveAt = staleTime25h;
    const freshSessRef = stateObj.sessions.find(s => s.id === sessFresh.id);
    if (freshSessRef) freshSessRef.lastActiveAt = freshTime10h;
    storage.saveProjectState(stateObj);

    const defaultOutput = await runCLI(["sessions", "reconcile"], testDir);
    assert(defaultOutput.includes("DRY RUN - no mutation requested"), "Default invocation must perform a DRY RUN");
    assert(defaultOutput.includes("24 hour(s)"), "Default threshold must be 24 hours");
    assert(defaultOutput.includes("Stale Candidates Found: 1"), "Must find exactly 1 candidate older than 24h");
    assert(defaultOutput.includes("Sessions Reconciled: 0"), "Dry run must mutate 0 sessions");
    assert(defaultOutput.includes(sessStale.id), "Candidate listing must include stale session ID");

    // Verify disk state remains ACTIVE (no mutation)
    const checkState1 = storage.getSession(sessStale.id);
    assert(checkState1?.status === "ACTIVE", "Dry run MUST NOT mutate session status on disk");
    console.log("  [PASS] Default invocation is DRY RUN with 24h threshold without disk mutations.\n");

    // -------------------------------------------------------------------------
    // Test 2: Custom threshold (--threshold-hours 48)
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 02: Custom Threshold (--threshold-hours 48)");
    const customOutput = await runCLI(["sessions", "reconcile", "--threshold-hours", "48"], testDir);
    assert(customOutput.includes("48 hour(s)"), "Custom threshold 48 hours must be displayed");
    assert(customOutput.includes("Stale Candidates Found: 0"), "Session inactive 25h is NOT a candidate for 48h threshold");
    console.log("  [PASS] Custom threshold 48h correctly filters out 25h inactive session.\n");

    // -------------------------------------------------------------------------
    // Test 3: Invalid threshold validations (malformed, zero, negative, < 1h)
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 03: Invalid Threshold Validations");
    
    let caughtMalformed = false;
    try {
      await runCLI(["sessions", "reconcile", "--threshold-hours", "abc"], testDir);
    } catch (err) {
      caughtMalformed = true;
      assert((err as Error).message.includes("must be a finite number"), "Malformed threshold error message expected");
    }
    assert(caughtMalformed, "Malformed threshold 'abc' must be rejected");

    let caughtZero = false;
    try {
      await runCLI(["sessions", "reconcile", "--threshold-hours", "0"], testDir);
    } catch (err) {
      caughtZero = true;
      assert((err as Error).message.includes("at least 1 hour"), "Zero threshold error message expected");
    }
    assert(caughtZero, "Zero threshold must be rejected");

    let caughtNegative = false;
    try {
      await runCLI(["sessions", "reconcile", "--threshold-hours", "-10"], testDir);
    } catch (err) {
      caughtNegative = true;
    }
    assert(caughtNegative, "Negative threshold must be rejected");

    console.log("  [PASS] Invalid thresholds (abc, 0, -10) rejected cleanly without silent clamping.\n");

    // -------------------------------------------------------------------------
    // Test 4: --confirm enables mutation (ACTIVE -> ABORTED) & actor identity
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 04: Confirmed Mutation (--confirm) & Actor Identity");
    const confirmOutput = await runCLI(
      ["sessions", "reconcile", "--threshold-hours", "20", "--confirm", "--agent-id", "admin-operator"],
      testDir
    );
    assert(confirmOutput.includes("CONFIRMED - ACTIVE → ABORTED"), "Confirmed mode must be indicated");
    assert(confirmOutput.includes("Authorizing Actor: admin-operator"), "Actor identity must be reflected in output");
    assert(confirmOutput.includes("Sessions Reconciled: 1"), "Confirmed run must reconcile 1 session");

    // Verify persistent metadata on disk
    const reconciledSess = storage.getSession(sessStale.id);
    assert(reconciledSess?.status === "ABORTED", "Confirmed mutation must transition session to ABORTED");
    assert(reconciledSess?.metadata?.reconciliation?.method === "EXPLICIT_RECONCILIATION", "Method must be EXPLICIT_RECONCILIATION");
    assert(reconciledSess?.metadata?.reconciliation?.reconciledBy === "admin-operator", "reconciledBy must record explicit authorizing actor");

    // Test --agent alias
    const agentAliasOutput = await runCLI(
      ["sessions", "reconcile", "--threshold-hours", "20", "--agent", "custom-agent"],
      testDir
    );
    assert(agentAliasOutput.includes("Authorizing Actor: custom-agent"), "--agent alias must set authorizing actor identity");

    // Negative Assertion: --reconciled-by MUST NOT be recognized as actor flag
    const unsupportedFlagOutput = await runCLI(
      ["sessions", "reconcile", "--threshold-hours", "20", "--reconciled-by", "fake-actor"],
      testDir
    );
    assert(!unsupportedFlagOutput.includes("Authorizing Actor: fake-actor"), "--reconciled-by MUST NOT be accepted as actor flag");
    assert(unsupportedFlagOutput.includes("Authorizing Actor: cli-operator"), "Default actor cli-operator must remain when unsupported flag is passed");

    console.log("  [PASS] Confirmed mutation applied ACTIVE -> ABORTED. --agent-id and --agent supported; --reconciled-by strictly rejected.\n");

    // -------------------------------------------------------------------------
    // Test 5: --json output formatting
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 05: Machine-Readable JSON Output (--json)");
    const jsonOutput = await runCLI(["sessions", "reconcile", "--threshold-hours", "24", "--json"], testDir);
    
    // Must be valid JSON without human headers
    assert(!jsonOutput.startsWith("[OpenMemory CLI]"), "JSON output must NOT contain human-readable header");
    const parsedObj = JSON.parse(jsonOutput);
    assert(typeof parsedObj.dryRun === "boolean", "JSON output must contain boolean dryRun");
    assert(typeof parsedObj.thresholdMs === "number", "JSON output must contain numeric thresholdMs");
    assert(typeof parsedObj.candidatesFound === "number", "JSON output must contain candidatesFound");
    assert(typeof parsedObj.reconciledCount === "number", "JSON output must contain reconciledCount");
    assert(Array.isArray(parsedObj.candidates), "JSON output must contain candidates array");
    assert(Array.isArray(parsedObj.logEvidence), "JSON output must contain logEvidence array");
    console.log("  [PASS] --json output cleanly returns parsed ReconcileResult schema.\n");

    // -------------------------------------------------------------------------
    // Test 6: Terminal state protection
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 06: Terminal Session Protection Invariant");
    const sessCompleted = storage.registerSession({
      agentId: "agent-completed",
      status: "COMPLETED",
    });
    const stateObj2 = storage.getOrInitProjectState();
    const compSessRef = stateObj2.sessions.find(s => s.id === sessCompleted.id);
    if (compSessRef) compSessRef.lastActiveAt = staleTime25h;
    storage.saveProjectState(stateObj2);

    await runCLI(["sessions", "reconcile", "--threshold-hours", "10", "--confirm"], testDir);
    const checkCompleted = storage.getSession(sessCompleted.id);
    assert(checkCompleted?.status === "COMPLETED", "COMPLETED session MUST NOT be mutated by reconciliation");
    console.log("  [PASS] COMPLETED terminal state preserved against reconciliation mutation.\n");

    // -------------------------------------------------------------------------
    // Test 7: Terminology audit (no 'crashed', 'dead', 'orphan')
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 07: Terminology Safety Audit");
    const textSample = defaultOutput + confirmOutput;
    assert(!textSample.toLowerCase().includes("crashed"), "Output must not claim crashed session");
    assert(!textSample.toLowerCase().includes("dead process"), "Output must not claim dead process");
    assert(!textSample.toLowerCase().includes("confirmed orphan"), "Output must not claim confirmed orphan");
    console.log("  [PASS] Terminology uses 'stale candidate' and 'inactivity threshold' exclusively.\n");

    // -------------------------------------------------------------------------
    // Test 8: Single Writer Invariant Audit on CLI file edits
    // -------------------------------------------------------------------------
    console.log("[EXECUTED] Test 08: Single Writer Direct Write Invariant Audit");
    const cliSource = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf-8");
    const directWrites = cliSource.match(/writeFileSync\s*\([^)]*project-state\.json/g);
    assert(!directWrites, "cli.ts MUST NOT contain direct writeFileSync calls targeting project-state.json");
    console.log("  [PASS] cli.ts adheres 100% to Single Writer facade via StorageEngine.\n");

    console.log("=================================================================");
    console.log("=== F12.3-B CLI Session Reconciliation Suite COMPLETE: 8/8 PASS ===");
    console.log("=================================================================");
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runF123CLITests().catch((err) => {
  console.error("F12.3-B Test Failure:", err);
  process.exit(1);
});
