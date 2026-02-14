---
name: pr-review
description: Dynamic "Dream Team" PR review - triages changes, assembles 3-8 tailored review agents with full codebase access, runs them in parallel
---

# PR Review - Dream Team

## When to Use This Skill

- User asks to review a PR, code review, or "check my PR"
- Before merging significant changes
- When a team member asks for feedback on their PR

## Process

### Phase 1: Load, Triage, and Map Files

Get the PR details:
```bash
gh pr view <PR_NUMBER> --json title,body,additions,deletions,changedFiles,files
gh pr diff <PR_NUMBER>
```

#### 1a. Domain Classification

Analyze the diff and classify it against these **change domains**. Check each that applies:

- [ ] **Database / Migrations** - Schema changes, migration files, raw SQL, ORM model changes
- [ ] **API Endpoints** - New or modified routes, request/response shapes, status codes
- [ ] **Auth / Permissions** - Login flows, token handling, RBAC, middleware guards
- [ ] **CI/CD / Pipeline** - GitHub Actions, Dockerfiles, build configs, deploy scripts
- [ ] **Credentials / Secrets** - .env files, API keys, token patterns, config files
- [ ] **Frontend / UI** - Components, styles, layouts, client-side state, accessibility
- [ ] **Performance** - Query optimization, caching, batch operations, lazy loading, N+1 patterns
- [ ] **Tests** - New or modified test files, test utilities, fixtures
- [ ] **Dependencies** - Package updates, new libraries, lockfile changes
- [ ] **Concurrency** - Async patterns, locks, race conditions, queue processing
- [ ] **External Integrations** - Third-party APIs, webhooks, SDK usage
- [ ] **Documentation** - README, CHANGELOG, API docs, code comments, migration guides

#### 1b. File-to-Domain Mapping

For every changed file, assign it to one or more domains. This mapping determines which agents review which files.

Example:
```
db/migrations/0042_add_index.py    → [Database/Migrations]
api/views/users.py                 → [API Endpoints, Auth/Permissions]
api/serializers/users.py           → [API Endpoints]
lib/env-guard.cjs                  → [Credentials/Secrets]
tests/test_users.py                → [Tests]
package.json                       → [Dependencies]
```

Files that don't map to any specialist domain still go to the two core agents (Security + Logic & Correctness), which review all files.

#### 1c. Determine PR Size Category

Count changed files and total changed lines (additions + deletions) from the PR metadata:

- **Small**: ≤10 files AND ≤500 changed lines
- **Medium**: ≤30 files AND ≤2,000 changed lines
- **Large**: 30+ files OR 2,000+ changed lines

This determines the context strategy in Phase 3.

#### 1d. Dependency Map

For each changed file, scan its import/require statements for **local imports** (same repo, not node_modules/pip packages). Read each imported module and extract a brief summary of its relevant exports (function signatures, class interfaces, key constants).

This serves two purposes:
- Agents get the contract of code the changed file depends on, without needing to discover it themselves
- Cross-file bugs (mismatched function signatures, duplicated logic, unhandled error types) become visible

Example:
```
lib/env-guard.cjs imports:
  → ./env-parser.cjs: exports { parseEnvString(content) → Map<string,string>, parseEnvFile(path) → {vars, comments} }
  → path (node built-in, skip)
  → fs (node built-in, skip)

scripts/env-restore.cjs imports:
  → ../lib/env-guard.cjs: exports { safeWriteEnvFile(path, content), createBackup(path) → string, parseEnvFile(path) → {vars, comments} }
```

For small PRs, do this for all changed files. For medium/large PRs, prioritize files in high-risk domains (security, credentials, data integrity). Skip for pure documentation or test-only PRs where the dependencies are obvious.

#### 1e. Triage Summary

Write a 2-3 sentence **triage summary** explaining what the PR does and which domains it touches. This summary will be shared with every reviewer.

### Phase 2: Assemble the Dream Team

Select **3-8 review agents** total. Start with the two always-on core agents, then add specialists based on the triage.

#### Always-On Core (every PR)

**Security Reviewer**
Non-negotiable. Every PR gets a security pass.
- Scan every changed file for strings matching credential patterns: `sk-`, `xoxb-`, `ghp_`, `phc_`, API keys, bearer tokens, passwords in plaintext
- For every user-supplied input (query params, form fields, request bodies, URL paths), trace it to where it's used - check for injection (SQL, command, XSS, path traversal) at each usage point
- Check that .env, .pem, .key, credential JSON files are in .gitignore
- For every permission check or auth guard added/modified, verify it can't be bypassed (missing middleware, wrong decorator order, client-side-only checks)
- For every new dependency added, check if it's a known-vulnerable version

**Logic & Correctness Reviewer**
Catches bugs that ship.
- For every loop or iteration, check boundary conditions: off-by-one, empty collection, single element, maximum size
- For every variable that could be null/undefined/empty, trace its usage - check for unguarded access (.property on null, index on empty array, .length on undefined)
- For every function that can throw or reject, verify the caller handles the failure (try-catch, .catch(), error callback, or explicit propagation)
- For every conditional branch, check: can the else case actually happen? Is the condition correct for all input types? Are boolean coercion rules causing bugs?
- For every async operation, check: what happens if it runs out of order? What if it runs twice? What if it never completes?
- For every assumption about data shape (parsing JSON, reading config, processing API responses), verify the assumption holds when data is missing, malformed, or has unexpected types

#### Specialist Catalog (pick 1-6 based on triage)

Select specialists whose trigger conditions match the triage. Only pick what the PR actually needs.

**1. Migration Safety Reviewer**
*Trigger: Database/Migrations domain checked*
- For every ALTER TABLE, check: does this lock the table? On a table with N million rows, how long will the lock hold? Is there a safer alternative (concurrent index creation, batched backfill)?
- For every new NOT NULL column, verify a default is set or a backfill migration runs first
- For every dropped column/table, verify no running application code still references it (check the ORM models, raw SQL, and any cached queries)
- For every new index, check: does a similar index already exist? Will it slow down writes on a high-traffic table?
- Run the migration forward AND backward mentally - does the rollback restore the previous state without data loss?

**2. API Contract Reviewer**
*Trigger: API Endpoints domain checked*
- For every changed response field (renamed, removed, type changed), check: do existing clients break? Is there a versioning strategy?
- For every new endpoint, verify: correct HTTP method, appropriate status codes (201 for create, 404 vs 403 for missing vs forbidden), consistent error envelope
- For every request body/query param, verify: input validation exists at the boundary (not just deeper in the stack), types are checked, required vs optional is correct
- For every list endpoint, check: is there pagination? What happens with 0 results? 10,000 results?
- For every endpoint that modifies data, check: is it idempotent where it should be? Does it return the modified resource?

**3. Pipeline & CI/CD Reviewer**
*Trigger: CI/CD domain checked*
- For every `echo`, `printenv`, or log statement in CI scripts, check: could it leak secrets? Are sensitive vars masked?
- For every new CI step, verify: does it run in the right environment? Is there a staging gate before production?
- For every cached dependency or artifact, check: will the cache key invalidate correctly when dependencies change?
- For every deploy step, check: is there a rollback mechanism? What happens if it fails halfway?

**4. Credential Safety Reviewer**
*Trigger: Credentials domain checked, OR any .env/.config file in diff*
- For every string literal that looks like a token/key/password (even in test code), flag it - test credentials have a way of leaking to production
- For every file that contains credentials, verify it's in .gitignore AND not already tracked (check `git ls-files`)
- For every `process.env.X` or `os.environ["X"]`, verify: is there a fallback? Does the fallback expose a security risk (e.g., defaulting to no auth)?
- For every credential that's read, trace where it's used - is it logged, included in error messages, or sent to third parties?

**5. UI/UX Reviewer**
*Trigger: Frontend domain checked*
- For every interactive element, check: is there a keyboard equivalent? Does it have an ARIA label or role? Does the tab order make sense?
- For every loading operation, check: is there a loading state? An error state? An empty state? What does the user see during the 2 seconds of network latency?
- For every form, check: does client-side validation match server-side rules? What happens on submit failure - is input preserved?
- For every new component, check: does it follow existing component patterns in the codebase? Prop API consistency with sibling components?

**6. Performance Reviewer**
*Trigger: Performance domain checked, OR large data operations in diff*
- For every database query in a loop, flag it as a potential N+1 - check if it can be batched or preloaded
- For every list/array operation without a LIMIT, check: what happens with 100k items? Is there pagination or streaming?
- For every new event listener, subscription, or setInterval, check: is there a corresponding cleanup/unsubscribe/clearInterval? Trace the lifecycle.
- For every new dependency import, check: is it tree-shakeable? Is the full library imported when only one function is needed?
- For every function called on every render/request, check: is it doing expensive work that could be memoized or cached?

**7. Test Coverage Reviewer**
*Trigger: Logic changes present WITHOUT corresponding test file changes*
- For every new function or method, check: is there at least one test for the happy path AND one for an error/edge case?
- For every conditional branch added, check: do tests exercise both the true and false paths?
- For every test assertion, check: is it testing behavior (output, side effects) or implementation (internal state, method calls)? Prefer behavior.
- For every test that uses mocks, check: does the mock match the real interface? Could the real implementation diverge without the test catching it?

**8. Dependency Reviewer**
*Trigger: Dependencies domain checked*
- For every new package, check: what's its license? (GPL in a proprietary codebase is a legal issue.) Is it actively maintained (last commit, open issues)?
- For every version bump, check: is it a major version? Are there breaking changes in the changelog?
- For every new dependency, check: does an existing dependency already provide this functionality? (duplicate packages bloat the bundle)
- For every lockfile change, sanity check: do the resolved versions match the declared ranges? Are there unexpected transitive dependency changes?

**9. Concurrency Reviewer**
*Trigger: Concurrency domain checked*
- For every shared mutable state (global variable, database row, cache key, file), trace all concurrent access points - check for read-modify-write races
- For every lock/mutex/semaphore, check: can it deadlock? (Are multiple locks acquired in different orders across code paths?)
- For every queue consumer, check: what happens if the same message is processed twice? Is the handler idempotent?
- For every transaction, check: is the isolation level appropriate? Can phantom reads or dirty reads cause bugs?

**10. Integration Reviewer**
*Trigger: External Integrations domain checked*
- For every HTTP call to an external service, check: what happens on timeout? On 5xx? On rate limit (429)? Is there retry logic with backoff?
- For every external response, check: is the response shape validated before use? (Don't trust the wire - fields could be missing, null, or wrong type.)
- For every webhook handler, check: is the signature/HMAC verified? Is the handler idempotent (same webhook delivered twice)?
- For every new integration, check: is there a circuit breaker or fallback when the service is down? Does the main application degrade gracefully?

#### Custom Specialists

If the PR touches a domain not covered above, create a custom specialist. Give it:
- A clear name (e.g., "Billing Logic Reviewer", "Encryption Reviewer")
- 3-5 specific check items following the same "For every X, check Y" pattern
- Context on why this domain matters for this particular PR

#### Budget and Prioritization

**Total agents: 3-8.** The 2 core agents are fixed. Add 1-6 specialists.

If more than 6 domains are detected, prioritize by risk:
1. Security (always first)
2. Data integrity (migrations, correctness)
3. Performance (under load)
4. API contracts (breaking changes)
5. Everything else

### Phase 3: Review

#### Scout Pass (medium and large PRs only)

For **medium and large PRs**, run a single scout agent before the full team. Skip this for small PRs where full context goes to every agent anyway.

The scout agent gets the complete diff and the dependency map from Phase 1d. Its job is fast pattern recognition, not deep analysis. It returns a **hot spots list**:

Scout prompt: "Scan this diff quickly and identify the riskiest areas. For each hot spot, note the file:line range, what makes it risky (complex logic, file I/O, parsing, error boundaries, state mutations, auth checks), and which review charter it's most relevant to. Also flag any code that looks like it duplicates existing functionality you can see in the dependency map. Spend no more than one pass through the diff. Return a bulleted list, max 15 items."

The hot spots list gets appended to every specialist agent's prompt in the deep review pass, so they know where to focus their attention first.

**Why this helps:** Human reviewers skim first, then drill into suspicious areas. Without the scout pass, specialist agents treat every line of the diff as equally important. The scout pass creates a priority gradient so agents spend their attention budget on the code that matters most.

#### Deep Review Pass

Launch all selected agents simultaneously using the Task tool (subagent_type: "general-purpose").

#### Context Strategy (based on PR size from Phase 1c)

**Small PRs (≤10 files, ≤500 lines):**
Read the full contents of every changed file using the Read tool. Pass the complete file contents plus the diff to every agent. Context is cheap here - include everything.

**Medium PRs (≤30 files, ≤2,000 lines):**
Each agent gets full file contents only for files mapped to their domain (from Phase 1b). Core agents (Security, Logic & Correctness) get the full diff of all files, plus full contents of files flagged as high-risk during triage.

**Large PRs (30+ files or 2,000+ lines):**
Each agent gets:
- The diff hunks for their domain's files, with **±30 lines of surrounding context** per hunk (not the default ±3)
- A file manifest listing all changed files with their domain mapping, so agents know what else exists
- Explicit instruction to use Read/Grep tools to pull in additional context for anything suspicious

**Very large PRs (50+ files):**
Split into independent review units by module/domain. Run separate mini-reviews for each unit (each with their own triage and team), then a final synthesis agent merges findings and looks for cross-cutting issues between units.

#### Agent Prompt Template

Each agent's prompt must include:

1. **Triage summary** from Phase 1 (so they understand the full PR context)
2. **Their review charter** (the specific checklist items from Phase 2)
3. **File contents and/or diff** (per the context strategy above)
4. **Dependency map** from Phase 1d (imported module signatures for each changed file)
5. **Hot spots list** from the scout pass (medium/large PRs only - tells the agent where to focus first)
6. **File access instructions**: "You have access to Read, Grep, and Glob tools. If a changed function calls something you can't see in the provided context, imports from another file, or references a shared utility - pull it in. Follow the dependency chain. Don't guess about what code outside the diff does; read it."
7. **Cross-file awareness prompt**: "Check the imports at the top of each changed file. For any import from the same repository, read the imported module's relevant exports to understand the contract. Look for: duplicated logic that already exists elsewhere in the file or in the dependency map, function signatures that don't match their callers, error types that aren't handled by callers."
8. **Output format**: Return findings as rows for the synthesis table: `Priority | Category | File:Line | Finding | Suggestion`

Priority levels for agents to use:
- **CRITICAL**: Security vulnerabilities, data loss risk, broken functionality
- **HIGH**: Bugs, missing edge cases, incorrect behavior
- **MEDIUM**: Maintainability, performance, code quality
- **LOW**: Style, documentation, minor improvements

**Cursor/sequential mode:** When parallel execution isn't available, run each reviewer sequentially in the order listed above (core agents first, then specialists). In sequential mode, read all changed files upfront so each reviewer has full context available.

### Phase 4: Synthesize Findings

Merge all reviewer outputs into the final report. Deduplicate findings that multiple agents flagged (keep the most specific version). Sort by priority.

## Output Format

```
## PR Review: #<number> - <title>

**Summary**: <1-2 sentence overview from triage>
**Risk Level**: LOW / MEDIUM / HIGH / CRITICAL
**PR Size**: Small / Medium / Large (<N> files, <M> changed lines)

### Team Composition

| Agent | Why Selected | Files Reviewed |
|-------|-------------|----------------|
| Security Reviewer | Always-on (core) | All <N> files |
| Logic & Correctness Reviewer | Always-on (core) | All <N> files |
| <specialist> | <1-line reason from triage> | <file count and key files> |
| ... | ... | ... |

### Findings (<count>)

| Priority | Category | Location | Finding | Fix |
|----------|----------|----------|---------|-----|
| CRITICAL | Security | file.py:42 | ... | ... |
| HIGH | Correctness | api.js:118 | ... | ... |
| MEDIUM | Performance | query.sql:7 | ... | ... |
| LOW | Style | utils.ts:23 | ... | ... |

### What's Done Well

<2-3 specific callouts of good patterns, clean code, or smart decisions>

### Verdict

<APPROVE / REQUEST CHANGES / COMMENT>

<Brief rationale>
```

### Optional: Auto-Fix

If user requests fixes:
1. For each finding (highest priority first), create a fix
2. Run tests after each fix
3. If tests fail, revert and report
4. Commit fixes in a single commit referencing the review

## Rules

1. Never approve a PR with CRITICAL findings
2. Always check for secrets before anything else
3. Be specific - reference exact file:line, not vague concerns
4. Suggest fixes, don't just point out problems
5. Acknowledge what's done well - reviews should be balanced
6. The triage drives the team - don't add specialists "just in case"
7. Custom specialists are encouraged when the catalog doesn't fit
8. Agents must use Read/Grep to follow dependencies - never review a diff in isolation
9. "For every X, check Y" - checklists must be specific and traceable, not vague categories
