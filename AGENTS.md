# Project Agent Guidelines

Welcome to the OpenMemory project repository.

<!-- OPENMEMORY:START -->
## OpenMemory Context Pointer & Knowledge SOP
* Active Session Handoff: `.openmemory/handoff.md`
* Active Project State Index: `.openmemory/project-state.json`
* Core Storage Engine: `src/storage.ts`
* Research & Knowledge Capture: When research (via Scout, Explore, WebSearch, WebFetch, etc.) yields findings, repository architecture, dependencies, or decisions of future value, synthesize findings and record them via MCP tool `openmemory_record_knowledge`. Query past knowledge via `openmemory_query_knowledge`.
<!-- OPENMEMORY:END -->

## Developer Rules
* Always run empirical test verification before declaring tasks complete.
* Maintain clean git commits for discrete units of work.
* Maintain zero core modification of OpenCode.
