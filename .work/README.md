# Operational Work Tracker (.work/)

> [!IMPORTANT]  
> The `.work/` directory is an **OPERATIONAL / TEMPORARY** tracking system used by developer agents to maintain real-time task execution state across prompt turns and session restarts.

## Directory Responsibilities

* **`.work/CURRENT.md`**: Single source of active operational state (active phase, current task, modified files, blockers, next steps). Read first at session start.
* **`.work/reports/`**: Dated execution logs (`YYYY-MM-DD-HHMM-phase-task.md`) recording completed milestones and technical findings.
* **`.work/sessions/`**: Session trajectory summaries (`session-YYYY-MM-DD-HHMM.md`).
* **`.work/evidence/`**: Empirical research data, API payloads, benchmark outputs, and audit proofs.
* **`.work/experiments/`**: Temporary spikes and prototypes. (Experiments must be explicitly promoted before entering core architecture).

## Memory Space Distinction

| Directory | Purpose | Lifetime | Audience |
| :--- | :--- | :--- | :--- |
| **`.work/`** | Operational tracking, execution reports, temporary evidence | Ephemeral / Active task | AI Agent / Active Session |
| **`.openmemory/`** | Permanent project memory, ADRs, handoff, consolidated state | Permanent across git lifecycle | AI Agent & Developer |
| **`docs/`** | Specifications, architecture guides, human research | Permanent | Human Developers |
| **`.opencode/`** | OpenCode integration (plugins, commands, skills, subagents) | Permanent | OpenCode Runtime Engine |
