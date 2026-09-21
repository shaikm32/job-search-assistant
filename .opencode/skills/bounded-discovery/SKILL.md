---
name: bounded-discovery
description: Use when performing codebase or documentation discovery for a bounded task, locating files, symbols, or docs without repository-wide scans. Covers source/document discovery order, exploration discipline, tool efficiency, tool failure handling, and bounded context discovery per AGENTS.md sections 15-16.
---

# Bounded Discovery

Expanded, authoritative procedural detail relocated from `AGENTS.md` §15 ("Source-Code
and Documentation Discovery", "Exploration Discipline", "Tool Efficiency", "Tool
Failure Handling") and §16 ("Bounded Context Discovery"). The always-injected
prohibitions and summaries remain in `AGENTS.md`; this skill is the operative detail
for how to perform discovery within the bounded scope.

## Source-Code and Documentation Discovery

Use the smallest sufficient context. Prefer, in order:

1. AGENTS.md
2. targeted source search
3. relevant source files
4. relevant tests
5. documentation or ADRs when a specific decision requires them

Do not read the entire repository or all project documentation simply to
understand the project.

## Exploration Discipline

Expand repository scope only when:

- a dependency is required to understand the requested change;
- an implementation contract cannot be established from the current context;
- a test failure requires additional investigation;
- or the task explicitly requires broader analysis.

Do not repeatedly inspect unchanged files or rediscover already established
architecture.

## Tool Efficiency

Batch independent reads/searches when practical.

Avoid:

- repeated identical searches;
- repeated reads of unchanged files;
- repository-wide scans for scoped tasks;
- large unfiltered command output;
- unnecessary verification cycles;
- repetitive environment checks;
- rerunning `git status`, directory listings, or equivalent state checks unless
  repository state has changed or the result is required for the next action;
- repeated variations of the same search without new evidence;
- widening discovery indefinitely when targeted searches cannot establish the
  required context.

If a targeted text or symbol search returns no useful result, reassess the
search target before retrying.

If targeted searches cannot establish the required context, use the relevant
directory structure or explicitly identified documentation, then stop and
report the missing context rather than widening discovery indefinitely.

Keep progress updates, tool explanations, and error reports concise. Report
only information needed to explain the current state, decision, or blocker. Do
not repeatedly restate completed work or previously established context.
Optimize for useful progress and correctness, not merely the smallest number of
tool calls.

## Tool Failure Handling

If a tool call fails, returns an error, or produces no useful result:

- inspect the error or result before retrying;
- do not repeat the same call without changing the reason for failure;
- do not issue multiple speculative variations of the same call;
- if the required information cannot be obtained with a targeted alternative,
  stop and report the limitation.

## Bounded Context Discovery

All repository discovery must remain bounded.

- Do not perform repository-wide discovery.
- Do not recursively enumerate the repository to discover task context.
- Do not use repository-wide file, symbol, or text searches against the
  repository root without a narrowly defined target.
- Do not read `PROJECT_CONTEXT.md` in full.
- Start discovery from files, directories, symbols, or requirements explicitly
  identified by the task.
- When additional context is required, search the smallest relevant directory
  or specific document.
- Do not read large source, generated, or log files in their entirety when
  targeted line ranges, text search, or symbol-level inspection can establish
  the required context.
- For files over 500 lines, prefer targeted inspection unless the task
  explicitly requires full-file analysis.
- Do not investigate unrelated subsystems.
- After sufficient evidence is obtained, stop discovery and perform the task.
- If the required context cannot be established within a bounded scope, stop
  and request clarification rather than widening discovery indefinitely.