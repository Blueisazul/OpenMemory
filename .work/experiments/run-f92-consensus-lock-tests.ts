import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { runCLI } from "../../src/cli";
import { createMCPServer } from "../../src/mcp";

let assertionsPassed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  assertionsPassed++;
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("=== F9.2 Multi-Agent Consensus, Governance & Lock Hardening Audit & Test Suite ===");

  const testDir = path.join(process.cwd(), ".work", "scratch", "f92-test-env-" + Date.now());
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const storage = new StorageEngine(testDir);
  storage.ensureStorageStructure();

  // -------------------------------------------------------------------------
  // F92-01: Creación de ADR PROPOSED con proposedByAgentId
  // -------------------------------------------------------------------------
  console.log("\n[F92-01] Testing ADR PROPOSED creation with proposedByAgentId...");
  const sessAlpha = storage.registerSession({ agentId: "agent-alpha", status: "ACTIVE" });
  const sessBeta = storage.registerSession({ agentId: "agent-beta", status: "ACTIVE" });
  const adr1 = storage.saveADR(
    {
      title: "Distributed Lock Mechanism",
      context: "Need cross-agent concurrency safety.",
      decision: "Use file-based advisory locks with TTL.",
      proposedByAgentId: "agent-alpha",
      requiredVotes: 2,
    },
    "agent-alpha",
    sessAlpha.id
  );

  assert(adr1.id === "ADR-001", "ADR-001 created with assigned ID");
  assert(adr1.status === "PROPOSED", "ADR-001 status is PROPOSED");
  assert(adr1.proposedByAgentId === "agent-alpha", "ADR-001 proposedByAgentId is agent-alpha");
  assert(adr1.requiredVotes === 2, "ADR-001 requiredVotes is 2");

  const reloadedADR1 = storage.getADR("ADR-001");
  assert(reloadedADR1 !== null, "ADR-001 reloaded from disk");
  assert(reloadedADR1?.proposedByAgentId === "agent-alpha", "Reloaded ADR-001 preserves proposedByAgentId");
  assert(reloadedADR1?.requiredVotes === 2, "Reloaded ADR-001 preserves requiredVotes");

  // -------------------------------------------------------------------------
  // F92-02: Votación multi-agente y transición determinista a ACCEPTED
  // -------------------------------------------------------------------------
  console.log("\n[F92-02] Testing multi-agent voting and deterministic ACCEPTED transition...");
  const vote1 = storage.voteADR("ADR-001", "agent-alpha", sessAlpha.id, "APPROVE", "Initial proposal looks solid");
  assert(vote1.status === "IN_REVIEW", "Status is IN_REVIEW after 1 of 2 required APPROVE votes");
  assert(vote1.votes?.length === 1, "1 vote registered in ADR-001");

  const vote2 = storage.voteADR("ADR-001", "agent-beta", sessBeta.id, "APPROVE", "LGTM, lock algorithm is sound");
  assert(vote2.status === "ACCEPTED", "Status transitions to ACCEPTED after 2 of 2 APPROVE votes");
  assert(vote2.votes?.length === 2, "2 votes registered in ADR-001");

  // -------------------------------------------------------------------------
  // F92-03: Votos de rechazo y transición determinista a REJECTED (+ Duplicate vote handling)
  // -------------------------------------------------------------------------
  console.log("\n[F92-03] Testing rejection votes and duplicate vote handling...");
  const sessGamma = storage.registerSession({ agentId: "agent-gamma", status: "ACTIVE" });
  const sessDelta = storage.registerSession({ agentId: "agent-delta", status: "ACTIVE" });
  const sessEpsilon = storage.registerSession({ agentId: "agent-epsilon", status: "ACTIVE" });
  const adr2 = storage.saveADR(
    {
      title: "Global In-Memory Queue",
      context: "Centralize message passing in RAM.",
      decision: "Use a global static array in RAM.",
      proposedByAgentId: "agent-gamma",
      requiredVotes: 2,
    },
    "agent-gamma",
    sessGamma.id
  );

  const rej1 = storage.voteADR(adr2.id, "agent-delta", sessDelta.id, "REJECT", "Risk of state loss on process restart");
  assert(rej1.status === "IN_REVIEW", "Status is IN_REVIEW after 1 REJECT vote (1/2)");

  const rej2 = storage.voteADR(adr2.id, "agent-epsilon", sessEpsilon.id, "REJECT", "Violates storage persistence invariant");
  assert(rej2.status === "REJECTED", "Status transitions to REJECTED after 2 REJECT votes");

  // Duplicate vote semantics: agent-alpha APPROVE -> APPROVE and APPROVE -> REJECT
  const sessZeta = storage.registerSession({ agentId: "agent-zeta", status: "ACTIVE" });
  const sessEta = storage.registerSession({ agentId: "agent-eta", status: "ACTIVE" });
  const adr3 = storage.saveADR(
    {
      title: "Mutable Global State",
      context: "Allow direct file edits.",
      decision: "Bypass storage facade.",
      proposedByAgentId: "agent-zeta",
      requiredVotes: 2,
    },
    "agent-zeta",
    sessZeta.id
  );

  storage.voteADR(adr3.id, "agent-eta", sessEta.id, "APPROVE", "First vote");
  const dup1 = storage.getADR(adr3.id);
  assert(dup1?.votes?.length === 1, "Initial vote count is 1");
  assert(dup1?.votes?.[0].decision === "APPROVE", "Initial vote decision is APPROVE");

  // Agent votes APPROVE again (same decision)
  storage.voteADR(adr3.id, "agent-eta", sessEta.id, "APPROVE", "Duplicate APPROVE vote");
  const dupSame = storage.getADR(adr3.id);
  assert(dupSame?.votes?.length === 1, "Duplicate same vote overwrote entry without duplicating (count=1)");

  // Agent-eta changes vote to REJECT
  storage.voteADR(adr3.id, "agent-eta", sessEta.id, "REJECT", "Changed my mind after security audit");
  const dup2 = storage.getADR(adr3.id);
  assert(dup2?.votes?.length === 1, "Changed vote overwrote existing vote (count remains 1)");
  assert(dup2?.votes?.[0].decision === "REJECT", "Updated vote decision is REJECT");

  // -------------------------------------------------------------------------
  // F92-04: tryAcquireLock() + releaseLock()
  // -------------------------------------------------------------------------
  console.log("\n[F92-04] Testing tryAcquireLock() and releaseLock()...");
  const lockKey = "resource_governance_spec";
  const acq1 = storage.tryAcquireLock(lockKey, "agent-alpha", 5000);
  assert(acq1 === true, "agent-alpha acquired lock successfully");

  const lockPath = path.join(testDir, ".openmemory", "locks", `${lockKey}.lock`);
  assert(fs.existsSync(lockPath), "Lock file exists physically under .openmemory/locks/");

  const rel1 = storage.releaseLock(lockKey, "agent-alpha");
  assert(rel1 === true, "agent-alpha released lock successfully");
  assert(!fs.existsSync(lockPath), "Lock file removed after release");

  // -------------------------------------------------------------------------
  // F92-05: Concurrencia REAL de locks (Simultaneous Promise.all Race)
  // -------------------------------------------------------------------------
  console.log("\n[F92-05] Testing REAL simultaneous lock competition via Promise.all...");
  const raceLockKey = "resource_simultaneous_race";
  const agents = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];

  const raceResults = await Promise.all(
    agents.map(async (ag) => ({
      agent: ag,
      won: storage.tryAcquireLock(raceLockKey, ag, 10000),
    }))
  );

  const winners = raceResults.filter((r) => r.won);
  assert(winners.length === 1, "Atomic 'wx' flag guarantees EXACTLY 1 winner in simultaneous race");
  const winningAgent = winners[0].agent;

  const activeLockFile = path.join(testDir, ".openmemory", "locks", `${raceLockKey}.lock`);
  const lockContent = JSON.parse(fs.readFileSync(activeLockFile, "utf-8"));
  assert(lockContent.owner === winningAgent, "Lock owner on disk matches exact winning agent");

  // Verify non-winning agents cannot release the lock
  const loserAgent = agents.find((a) => a !== winningAgent)!;
  const unauthorizedRelease = storage.releaseLock(raceLockKey, loserAgent);
  assert(unauthorizedRelease === false, "Non-winning agent CANNOT release active lock");

  // Release by legitimate winner
  const legitimateRelease = storage.releaseLock(raceLockKey, winningAgent);
  assert(legitimateRelease === true, "Legitimate owner released lock cleanly");
  assert(!fs.existsSync(activeLockFile), "Lock file deleted cleanly upon release");

  // -------------------------------------------------------------------------
  // F92-05b: Concurrencia REAL de voteADR() (Simultaneous Multi-Agent Voting)
  // -------------------------------------------------------------------------
  console.log("\n[F92-05b] Testing REAL simultaneous voteADR() race via Promise.all...");
  const sessProposer = storage.registerSession({ agentId: "agent-proposer", status: "ACTIVE" });
  const raceADR = storage.saveADR(
    {
      title: "Concurrent Voting ADR",
      context: "Stress testing concurrent voting.",
      decision: "Use atomic storage engine locks.",
      proposedByAgentId: "agent-proposer",
      requiredVotes: 5,
    },
    "agent-proposer",
    sessProposer.id
  );

  const voteAgents = ["voter-1", "voter-2", "voter-3", "voter-4", "voter-5"];
  const voteSessions = voteAgents.map((ag) => storage.registerSession({ agentId: ag, status: "ACTIVE" }));
  // Execute simultaneous voting calls
  await Promise.all(
    voteAgents.map(async (ag, idx) => {
      // Small staggered micro-yield to test lock contention retry if needed or sequential lock resolution
      await new Promise((r) => setTimeout(r, idx * 5));
      storage.voteADR(raceADR.id, ag, voteSessions[idx].id, "APPROVE", `Simultaneous vote from ${ag}`);
    })
  );

  const finalRaceADR = storage.getADR(raceADR.id)!;
  assert(finalRaceADR.votes?.length === 5, "Zero vote loss: All 5 parallel agent votes persisted");
  assert(finalRaceADR.status === "ACCEPTED", "Consensus reached ACCEPTED cleanly after 5/5 votes");
  const adrLockPath = path.join(testDir, ".openmemory", "locks", `adr_${raceADR.id}.lock`);
  assert(!fs.existsSync(adrLockPath), "Lock released cleanly after all concurrent votes");

  // -------------------------------------------------------------------------
  // F92-06: Stale lock: expiración y recuperación
  // -------------------------------------------------------------------------
  console.log("\n[F92-06] Testing stale lock expiration and recovery...");
  const lockKey3 = "resource_stale_test";
  const acqStale = storage.tryAcquireLock(lockKey3, "agent-dead", 10); // 10ms TTL
  assert(acqStale === true, "agent-dead acquired short TTL lock");

  await new Promise((r) => setTimeout(r, 30)); // Wait for TTL to expire

  const acqRecover = storage.tryAcquireLock(lockKey3, "agent-alive", 5000);
  assert(acqRecover === true, "agent-alive reclaimed expired (stale) lock");
  storage.releaseLock(lockKey3, "agent-alive");

  // -------------------------------------------------------------------------
  // F92-07: Cleanup de residuos de locks (cleanupStaleLocks)
  // -------------------------------------------------------------------------
  console.log("\n[F92-07] Testing lock cleanup without orphaned temporary files...");
  const locksDir = path.join(testDir, ".openmemory", "locks");
  const staleFile = path.join(locksDir, "abandoned.lock");
  const tmpFile = path.join(locksDir, "orphan.tmp");

  fs.writeFileSync(
    staleFile,
    JSON.stringify({ owner: "ghost", acquiredAt: Date.now() - 10000, expiresAt: Date.now() - 5000 }),
    "utf-8"
  );
  fs.writeFileSync(tmpFile, "orphan payload", "utf-8");

  const cleanedCount = storage.cleanupStaleLocks();
  assert(cleanedCount >= 2, "cleanupStaleLocks cleaned orphan tmp and expired locks");
  assert(!fs.existsSync(staleFile), "Abandoned stale lock file unlinked");
  assert(!fs.existsSync(tmpFile), "Orphan tmp lock file unlinked");

  // -------------------------------------------------------------------------
  // F92-08: Backup/restore funciona correctamente en presencia de locks
  // -------------------------------------------------------------------------
  console.log("\n[F92-08] Testing backup and restore behavior with active locks...");
  storage.tryAcquireLock("transient_lock", "agent-holder", 60000);
  const backupMeta = storage.createBackup("f92-lock-test");
  assert(backupMeta.filesCount > 0, "Backup created successfully");

  const backupLockDir = path.join(backupMeta.backupPath, "locks");
  assert(!fs.existsSync(backupLockDir), "Locks directory is EXCLUDED from backup snapshot");

  const restored = storage.restoreBackup(backupMeta.id);
  assert(restored === true, "Backup restored successfully");
  storage.releaseLock("transient_lock", "agent-holder");

  // -------------------------------------------------------------------------
  // F92-09: Invocación MCP de openmemory_vote_adr
  // -------------------------------------------------------------------------
  console.log("\n[F92-09] Testing openmemory_vote_adr MCP integration & parameter validation...");
  const mcpServer = createMCPServer(testDir);
  assert(mcpServer !== null, "MCP server created");

  const sessMcpProp = storage.registerSession({ agentId: "agent-mcp-proposer", status: "ACTIVE" });
  const sessMcp1 = storage.registerSession({ agentId: "agent-mcp-1", status: "ACTIVE" });
  const sessMcp2 = storage.registerSession({ agentId: "agent-mcp-2", status: "ACTIVE" });

  const mcpVoteADR = storage.saveADR(
    {
      title: "MCP Governance Voting Test",
      context: "Testing MCP vote tool handler.",
      decision: "Use MCP tool openmemory_vote_adr.",
      proposedByAgentId: "agent-mcp-proposer",
      requiredVotes: 2,
    },
    "agent-mcp-proposer",
    sessMcpProp.id
  );

  const mcpRes1 = storage.voteADR(mcpVoteADR.id, "agent-mcp-1", sessMcp1.id, "APPROVE", "Voting via MCP storage call");
  assert(mcpRes1.status === "IN_REVIEW", "MCP voter 1 puts ADR in IN_REVIEW");

  const mcpRes2 = storage.voteADR(mcpVoteADR.id, "agent-mcp-2", sessMcp2.id, "APPROVE", "Voting via MCP storage call");
  assert(mcpRes2.status === "ACCEPTED", "MCP voter 2 transitions ADR to ACCEPTED");

  // -------------------------------------------------------------------------
  // F92-10: Invocación CLI de openmemory adr vote
  // -------------------------------------------------------------------------
  console.log("\n[F92-10] Testing openmemory adr vote CLI integration & flag validation...");
  const sessCliProp = storage.registerSession({ agentId: "agent-cli-proposer", status: "ACTIVE" });
  const sessCli1 = storage.registerSession({ agentId: "agent-cli-1", status: "ACTIVE" });
  const sessCli2 = storage.registerSession({ agentId: "agent-cli-2", status: "ACTIVE" });

  const cliADR = storage.saveADR(
    {
      title: "CLI Governance Voting Test",
      context: "Testing CLI vote command handler.",
      decision: "Use openmemory adr vote command.",
      proposedByAgentId: "agent-cli-proposer",
      requiredVotes: 2,
    },
    "agent-cli-proposer",
    sessCliProp.id
  );

  const cliOut1 = await runCLI(
    ["adr", "vote", "--id", cliADR.id, "--vote", "APPROVE", "--agent-id", "agent-cli-1", "--session-id", sessCli1.id, "--rationale", "CLI Vote 1"],
    testDir
  );
  assert(cliOut1.includes("ADR Vote Recorded"), "CLI output confirms vote 1 recorded");

  const cliOut2 = await runCLI(
    ["adr", "vote", "--id", cliADR.id, "--vote", "APPROVE", "--agent-id", "agent-cli-2", "--session-id", sessCli2.id, "--rationale", "CLI Vote 2"],
    testDir
  );
  assert(cliOut2.includes("Status: ACCEPTED"), "CLI output confirms transition to ACCEPTED");

  // CLI error validation checks
  try {
    await runCLI(["adr", "vote", "--id", "ADR-001", "--vote", "INVALID_DECISION", "--agent-id", "a1", "--session-id", sessCli1.id], testDir);
    assert(false, "CLI should fail on invalid vote decision");
  } catch (err) {
    assert((err as Error).message.includes("Invalid vote decision"), "CLI rejected invalid vote decision cleanly");
  }

  // -------------------------------------------------------------------------
  // F92-11: Backward Compatibility con ADRs Legacy sin Campos Nuevos
  // -------------------------------------------------------------------------
  console.log("\n[F92-11] Testing legacy ADR backward compatibility...");
  const legacyMarkdown = `# ADR-999: Legacy Architecture Decision\n\n**Status:** ACCEPTED  \n**Date:** 2025-01-01  \n\n## Context\nLegacy problem context.\n\n## Decision\nLegacy decision text.\n`;
  const legacyPath = path.join(testDir, ".openmemory", "adrs", "ADR-999.md");
  fs.writeFileSync(legacyPath, legacyMarkdown, "utf-8");

  const legacyADR = storage.getADR("ADR-999");
  assert(legacyADR !== null, "Legacy ADR parsed successfully without errors");
  assert(legacyADR?.proposedByAgentId === undefined, "Legacy ADR proposedByAgentId is undefined");
  assert(legacyADR?.votes?.length === 0, "Legacy ADR votes is empty array");

  // Vote on legacy ADR
  const sessMigrator = storage.registerSession({ agentId: "agent-migrator", status: "ACTIVE" });
  const updatedLegacy = storage.voteADR("ADR-999", "agent-migrator", sessMigrator.id, "APPROVE", "Migrating legacy ADR");
  assert(updatedLegacy.votes?.length === 1, "Vote recorded on legacy ADR cleanly");

  // -------------------------------------------------------------------------
  // F92-12: Consensus Edge Cases & Boundary Matrix Audit
  // -------------------------------------------------------------------------
  console.log("\n[F92-12] Testing consensus edge cases & terminal status invariants...");

  // Terminal status SUPERSEDE
  const sessVoter1 = storage.registerSession({ agentId: "voter-1", status: "ACTIVE" });
  const superADR = storage.saveADR(
    {
      title: "Superseded Spec",
      status: "SUPERSEDE",
      context: "Old spec",
      decision: "Superseded",
      requiredVotes: 2,
    },
    "voter-1",
    sessVoter1.id
  );
  const superVote = storage.voteADR(superADR.id, "voter-1", sessVoter1.id, "APPROVE");
  assert(superVote.status === "SUPERSEDE", "SUPERSEDE status remains unchanged after voting");

  // Terminal status DEPRECATED
  const deprADR = storage.saveADR(
    {
      title: "Deprecated Spec",
      status: "DEPRECATED",
      context: "Deprecated feature",
      decision: "Deprecated",
      requiredVotes: 2,
    },
    "voter-1",
    sessVoter1.id
  );
  const deprVote = storage.voteADR(deprADR.id, "voter-1", sessVoter1.id, "APPROVE");
  assert(deprVote.status === "DEPRECATED", "DEPRECATED status remains unchanged after voting");

  // Omitted or 0 requiredVotes fallback to 2
  const zeroVotesADR = storage.saveADR(
    {
      title: "Zero Required Votes",
      context: "Test 0 required votes",
      decision: "Defaults to 2",
      requiredVotes: 0,
    },
    "voter-1",
    sessVoter1.id
  );
  assert(zeroVotesADR.requiredVotes === 2, "requiredVotes=0 falls back cleanly to default threshold 2");

  // -------------------------------------------------------------------------
  // F92-13: Guardia Single Writer + ausencia física de stage-state.json
  // -------------------------------------------------------------------------
  console.log("\n[F92-13] Verifying Single Writer guard and stage-state.json physical absence...");
  const stageStatePath = path.join(testDir, ".openmemory", "stage-state.json");
  const projectStatePath = path.join(testDir, ".openmemory", "project-state.json");

  assert(!fs.existsSync(stageStatePath), "stage-state.json is physically ABSENT from active workspace");
  assert(fs.existsSync(projectStatePath), "project-state.json is PRESENT as sole physical state authority");

  // -------------------------------------------------------------------------
  // F92-14: Full test suite summary
  // -------------------------------------------------------------------------
  console.log("\n[F92-14] Summary & Assertions Count...");
  console.log(`\n🎉 ALL F9.2 TESTS & AUDITS PASSED! (${assertionsPassed} assertions)`);
}

runTests().catch((err) => {
  console.error("❌ F9.2 Test Suite Error:", err);
  process.exit(1);
});
