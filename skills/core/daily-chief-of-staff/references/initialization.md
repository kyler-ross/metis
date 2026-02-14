---
name: initialization
description: Resource file for daily-chief-of-staff agent
type: resource
---

# Daily Chief of Staff - Initialization Workflow

This resource contains the first-time setup process for the Daily Chief of Staff agent. It runs when the user profile doesn't exist or rolling context files are missing.

---

## Phase 0: Initialize User Profile (First Run Only)

Before doing anything else, the agent should:

1. Check if `.ai/local/user-profile.json` exists and `initialized` is true.
2. **If not:**
   - Ask: "What's your name?" → `name`
   - Inspect `.ai/config/team-members.json` for keys like `managed_by_lucas`, `managed_by_rohini`, etc.
   - Ask: "Which PM are you?" (list options from those keys) → `pm_key`
   - From the chosen `pm_key`, set `teams_managed` to the child team keys under that PM.
   - Ask: "What short ID should I use in log filenames? (e.g. `lucas`, `sarah`)?" → `pm_owner`
   - Default `preferences.prioritize_me_statements` to `true`.
   - Write `.ai/local/user-profile.json` with these fields and `initialized: true`.
   - Confirm: "Great, [name]. I'll track your teams [teams_managed] and create daily logs as `YYYY-MM-DD-[pm_owner].md`."
3. **If it exists:**
   - Load `name`, `pm_key`, `pm_owner`, `teams_managed`, and `preferences` and use them for this run.

Throughout the rest of this spec, "you" or "the PM" refers to the user described by this profile.

---

## Phase 0.5: Initialize Rolling Context (First Run or Missing Files)

After loading the user profile, check if rolling context files exist for all teams in `teams_managed`.

### Check for Context Files

For each team in `teams_managed`, check if the file exists:
- `.ai/context/rolling/[team_key]-context.md` (e.g., `app-experience-context.md`, `cloaked-labs-context.md`)

### If Any Files Are Missing

**Inform the user:**
```
I notice you don't have rolling context for: [team names]

Rolling context files help me track ongoing work, decisions, questions, and learnings for each team. Let me initialize these for you.

This will take a few minutes. I'll:
1. Pull Jira tickets from the past 2 weeks
2. Pull Confluence docs you've created or modified recently
3. Pull PRDs mentioned in tickets
4. Pull recent GitHub commits (optional)
5. Ask you for an initial context dump

Ready to proceed?
```

### Initialization Workflow (Per Team)

1. **Pull Jira Tickets (Past 2 Weeks)**
   - Use `searchJiraIssuesUsingJql` with query:
   ```jql
   project = ALL AND updated >= -14d AND (
     assignee in ([team members]) OR
     reporter in ([team members]) OR
     creator in ([team members])
   )
   ORDER BY updated DESC
   ```
   - Extract: Active tickets, recent status changes, key decisions in comments
   - Map team members using `.ai/config/team-members.json`

2. **Pull Confluence Docs**
   - Use `searchConfluenceUsingCql` with query:
   ```cql
   type = page AND (creator = currentUser() OR contributor = currentUser()) AND lastModified >= now("-14d")
   ```
   - Also search for PRDs mentioned in Jira tickets
   - Extract: Recently updated docs, especially PRDs and specs

3. **Pull GitHub Commits (Past 2 Weeks)**
   - Use git command line in relevant repos:
   ```bash
   git log --since="2 weeks ago" --author="[user]" --oneline --all
   ```
   - Extract: Major features shipped, areas of focus
   - Note: This is optional - if repos aren't configured or accessible, skip

4. **Ask User for Context Dump**
   ```
   Great! I've pulled recent Jira tickets, Confluence docs, and commits.

   To complete the [team name] context, please provide an initial dump:
   - What's the current sprint focus?
   - What are the major initiatives or experiments running?
   - What are the top open questions?
   - Any key metrics you're tracking?
   - Recent learnings or decisions I should know?

   You can be brief - I'll fill in more detail over time from daily syncs.
   ```

5. **Create Rolling Context File**
   - File: `.ai/context/rolling/[team_key]-context.md`
   - Structure:
   ```markdown
   # [Team Name] Rolling Context

   **PM**: [name]
   **Last Updated**: [timestamp]
   **Initialized**: [date]

   ---

   ## Current Sprint Focus

   [User-provided context]

   ## Active Work

   ### In Progress
   [From Jira tickets - list major initiatives with ticket links]

   ### Recently Completed
   [From Jira tickets - recently closed work]

   ## Recent Decisions (Last 2 Weeks)

   [From Jira comments and Confluence docs]

   ## Open Questions

   [From user context dump and/or ticket comments]

   ## Key Metrics

   [From user context dump]

   ## Recent Learnings

   [From user context dump and recent retrospectives]

   ## Blockers & Risks

   [From Jira tickets marked as blocked]

   ---

   _Initialized: [date] | Auto-updated by /pm-document_
   ```

6. **Confirm Initialization**
   ```
   ✅ Rolling context initialized for [team name]!

   File created: .ai/context/rolling/[team_key]-context.md

   I'll keep this updated as we work together. You can manually edit it anytime if needed.
   ```

7. **Repeat for All Missing Teams**

### After All Context Files Exist

**Proceed to normal operation** (load daily-sync.md workflow)

**Note:** This initialization only runs once per team. If context files are deleted or a new team is added to the user's profile, re-run initialization for those specific teams.
