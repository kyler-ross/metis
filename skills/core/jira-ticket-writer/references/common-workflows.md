---
name: common-workflows
description: Resource file for jira-ticket-writer agent
type: resource
---

# Jira Ticket Writer - Common Workflows

This resource contains advanced workflows for epic management, bulk operations, Confluence linking, and other complex Jira operations.

---

## Epic Management Workflows

### Workflow 1: Create Epic with Sub-tasks

**Use case**: Breaking down a large initiative into smaller tasks

**Process**:

```javascript
const { jira } = require('./scripts/atlassian-api.js');

// Step 1: Create epic
const epic = await jira.createEpic(
  'ALL',
  'Feature X Initiative',
  'Complete rollout of Feature X across all platforms'
);

console.log(`Created epic: ${epic.key}`);

// Step 2: Create tasks and link to epic
const tasks = [
  'Design Feature X mockups',
  'Implement Feature X backend API',
  'Implement Feature X iOS client',
  'Implement Feature X Android client',
  'Test Feature X end-to-end',
  'Document Feature X in PRD'
];

for (const taskTitle of tasks) {
  const task = await jira.createIssue(
    'ALL',
    taskTitle,
    `${taskTitle} for Feature X initiative`,
    'Task'
  );

  // Link task to epic
  await jira.linkToEpic(task.key, epic.key);

  console.log(`Created and linked: ${task.key}`);
}

console.log(`Epic ${epic.key} now has ${tasks.length} sub-tasks`);
```

**Output**:
```
Created epic: PROJ-XXX
Created and linked: PROJ-XXX
Created and linked: PROJ-XXX
Created and linked: PROJ-XXX
Created and linked: PROJ-XXX
Created and linked: PROJ-XXX
Created and linked: PROJ-XXX
Epic PROJ-XXX now has 6 sub-tasks
```

---

### Workflow 2: Track Epic Progress

**Use case**: Get status of all tasks in an epic

**Process**:

```javascript
// Search for all tasks under epic
const epicKey = 'PROJ-XXX';
const tasks = await jira.searchJQL(`parent = ${epicKey}`);

// Count by status
const statusCounts = {};
for (const issue of tasks.issues) {
  const status = issue.fields.status.name;
  statusCounts[status] = (statusCounts[status] || 0) + 1;
}

console.log(`Epic ${epicKey} progress:`);
console.log(`- Total tasks: ${tasks.issues.length}`);
console.log(`- To Do: ${statusCounts['To Do'] || 0}`);
console.log(`- In Progress: ${statusCounts['In Progress'] || 0}`);
console.log(`- Done: ${statusCounts['Done'] || 0}`);
console.log(`- Blocked: ${statusCounts['Blocked'] || 0}`);
```

**Output**:
```
Epic PROJ-XXX progress:
- Total tasks: 6
- To Do: 2
- In Progress: 3
- Done: 1
- Blocked: 0
```

---

## Bulk Operations

### Workflow 3: Create Multiple Tickets from List

**Use case**: Creating many tickets at once (e.g., from PRD acceptance criteria)

**Process**:

```javascript
const tickets = [
  {
    summary: 'Add urgent tasks section to Feed',
    description: 'Display urgent tasks at top of Feed',
    type: 'Task',
    labels: ['iOS', 'Feed']
  },
  {
    summary: 'Implement task prioritization logic',
    description: 'Backend logic to determine task urgency',
    type: 'Task',
    labels: ['Platform', 'Feed']
  },
  {
    summary: 'Design urgent tasks UI',
    description: 'Mockups for urgent tasks card',
    type: 'Task',
    labels: ['Design', 'Feed']
  }
];

const createdKeys = [];

for (const ticket of tickets) {
  const issue = await jira.createIssue(
    'ALL',
    ticket.summary,
    ticket.description,
    ticket.type
  );

  // Update with labels
  await jira.updateIssue(issue.key, { labels: ticket.labels });

  createdKeys.push(issue.key);
  console.log(`Created: ${issue.key} - ${ticket.summary}`);
}

console.log(`\nCreated ${createdKeys.length} tickets: ${createdKeys.join(', ')}`);
```

---

### Workflow 4: Bulk Update Tickets

**Use case**: Updating multiple tickets with same change (e.g., adding sprint label)

**Process**:

```javascript
// Find tickets to update
const tickets = await jira.searchJQL(
  'project = PROJ AND status = "To Do" AND labels = Feed AND sprint is EMPTY'
);

console.log(`Found ${tickets.issues.length} tickets to update`);

// Add to sprint and update labels
for (const issue of tickets.issues) {
  await jira.updateIssue(issue.key, {
    labels: [...(issue.fields.labels || []), 'Sprint-47', 'Q1-2025']
  });

  console.log(`Updated: ${issue.key}`);
}

console.log('Bulk update complete');
```

---

### Workflow 5: Find and Archive Stale Tickets

**Use case**: Finding old tickets that haven't been updated in 30+ days

**Process**:

```javascript
// Find stale tickets
const staleTickets = await jira.searchJQL(
  'project = PROJ AND status = "In Progress" AND updated <= -30d'
);

console.log(`Found ${staleTickets.issues.length} stale tickets`);

// Add comment to each
for (const issue of staleTickets.issues) {
  await jira.addComment(
    issue.key,
    'This ticket has been in progress for 30+ days with no updates. Is this still active? If not, please close or update status.'
  );

  console.log(`Commented on: ${issue.key} - ${issue.fields.summary}`);
}

console.log('Added comments to all stale tickets');
```

---

## Confluence Integration

### Workflow 6: Create Epic with Linked Confluence Page

**Use case**: Creating a feature epic and its corresponding PRD in Confluence

**Process**:

```javascript
const { jira, confluence } = require('./scripts/atlassian-api.js');

// Step 1: Create epic in Jira
const epic = await jira.createEpic(
  'ALL',
  'Feature X',
  'Feature X initiative - see linked PRD for details'
);

console.log(`Created epic: ${epic.key}`);

// Step 2: Create Confluence page
const confluencePage = await confluence.createPage(
  'PROD',  // space key
  'Feature X Product Spec',
  `
    <h2>Overview</h2>
    <p>Product specification for Feature X</p>

    <h2>Jira Epic</h2>
    <p>Epic: <a href="https://[your-domain].atlassian.net/browse/${epic.key}">${epic.key}</a></p>

    <h2>User Stories</h2>
    <ul>
      <li>As a user, I want...</li>
    </ul>

    <h2>Acceptance Criteria</h2>
    <ul>
      <li>Criterion 1</li>
      <li>Criterion 2</li>
    </ul>
  `
);

const pageUrl = `${confluence._links.base}${confluencePage._links.webui}`;
console.log(`Created Confluence page: ${pageUrl}`);

// Step 3: Link Confluence page back to epic
await jira.addComment(
  epic.key,
  `Product spec: ${pageUrl}`
);

console.log(`Linked Confluence page to epic ${epic.key}`);
```

**Output**:
```
Created epic: PROJ-XXX
Created Confluence page: https://[your-domain].atlassian.net/wiki/spaces/PROD/pages/123456
Linked Confluence page to epic PROJ-XXX
```

---

### Workflow 7: Update Jira Tickets When PRD Changes

**Use case**: Adding comments to related tickets when a PRD is updated

**Process**:

```javascript
const prdUrl = 'https://[your-domain].atlassian.net/wiki/spaces/PROD/pages/123456';
const prdTitle = 'Feature X Product Spec';
const changeDescription = 'Updated acceptance criteria to include offline mode support';

// Find tickets that reference this PRD
const relatedTickets = await jira.searchJQL(
  `project = PROJ AND text ~ "${prdTitle}"`
);

console.log(`Found ${relatedTickets.issues.length} tickets referencing this PRD`);

// Add comment to each
for (const issue of relatedTickets.issues) {
  await jira.addComment(
    issue.key,
    `PRD updated: ${changeDescription}\n\nSee: ${prdUrl}`
  );

  console.log(`Updated: ${issue.key}`);
}
```

---

## Cross-Team Coordination

### Workflow 8: Create Cross-Team Epic with Dependencies

**Use case**: Feature requiring work from multiple teams (iOS, Android, Platform)

**Process**:

```javascript
// Create parent epic
const epic = await jira.createEpic(
  'ALL',
  'Feature X - Cross-Platform',
  'Feature X rollout across iOS, Android, and Platform'
);

// Create team-specific sub-epics
const iosEpic = await jira.createEpic(
  'ALL',
  'Feature X - iOS',
  'iOS implementation of Feature X'
);
await jira.linkToEpic(iosEpic.key, epic.key);

const androidEpic = await jira.createEpic(
  'ALL',
  'Feature X - Android',
  'Android implementation of Feature X'
);
await jira.linkToEpic(androidEpic.key, epic.key);

const platformEpic = await jira.createEpic(
  'ALL',
  'Feature X - Platform',
  'Backend API and infrastructure for Feature X'
);
await jira.linkToEpic(platformEpic.key, epic.key);

// Create platform task (dependency)
const apiTask = await jira.createIssue(
  'ALL',
  'Build Feature X API endpoint',
  'REST API for Feature X functionality',
  'Task'
);
await jira.linkToEpic(apiTask.key, platformEpic.key);

// Create iOS task that depends on platform
const iosTask = await jira.createIssue(
  'ALL',
  'Integrate Feature X API in iOS',
  'iOS client integration with Feature X API',
  'Task'
);
await jira.linkToEpic(iosTask.key, iosEpic.key);

// Add dependency comment
await jira.addComment(
  iosTask.key,
  `Blocked by: ${apiTask.key} (API must be complete first)`
);

console.log(`Created cross-team epic structure:`);
console.log(`- Parent: ${epic.key}`);
console.log(`  - iOS Epic: ${iosEpic.key}`);
console.log(`    - ${iosTask.key} (blocked by ${apiTask.key})`);
console.log(`  - Android Epic: ${androidEpic.key}`);
console.log(`  - Platform Epic: ${platformEpic.key}`);
console.log(`    - ${apiTask.key} (dependency for iOS/Android)`);
```

---

## Advanced Search and Reporting

### Workflow 9: Generate Sprint Report

**Use case**: Get overview of current sprint status

**Process**:

```javascript
const sprintName = 'Sprint 47';

// Get all tickets in sprint
const sprintTickets = await jira.searchJQL(
  `project = PROJ AND sprint = "${sprintName}"`
);

// Analyze by status and type
const report = {
  total: sprintTickets.issues.length,
  byStatus: {},
  byType: {},
  blocked: []
};

for (const issue of sprintTickets.issues) {
  const status = issue.fields.status.name;
  const type = issue.fields.issuetype.name;

  report.byStatus[status] = (report.byStatus[status] || 0) + 1;
  report.byType[type] = (report.byType[type] || 0) + 1;

  if (status === 'Blocked') {
    report.blocked.push({
      key: issue.key,
      summary: issue.fields.summary,
      assignee: issue.fields.assignee?.displayName || 'Unassigned'
    });
  }
}

console.log(`${sprintName} Report:`);
console.log(`\nTotal tickets: ${report.total}`);
console.log(`\nBy Status:`);
for (const [status, count] of Object.entries(report.byStatus)) {
  console.log(`  ${status}: ${count}`);
}
console.log(`\nBy Type:`);
for (const [type, count] of Object.entries(report.byType)) {
  console.log(`  ${type}: ${count}`);
}
if (report.blocked.length > 0) {
  console.log(`\nBlocked Tickets:`);
  for (const ticket of report.blocked) {
    console.log(`  ${ticket.key}: ${ticket.summary} (${ticket.assignee})`);
  }
}
```

---

### Workflow 10: Find Duplicate or Related Tickets

**Use case**: Before creating a new ticket, check if similar tickets exist

**Process**:

```javascript
const searchTerm = 'login crash iOS';

// Search for similar tickets
const similar = await jira.searchJQL(
  `project = PROJ AND text ~ "${searchTerm}" ORDER BY created DESC`
);

console.log(`Found ${similar.issues.length} potentially related tickets:`);

for (const issue of similar.issues.slice(0, 10)) {  // Show top 10
  console.log(`\n${issue.key}: ${issue.fields.summary}`);
  console.log(`  Status: ${issue.fields.status.name}`);
  console.log(`  Created: ${issue.fields.created}`);
  console.log(`  URL: https://[your-domain].atlassian.net/browse/${issue.key}`);
}

if (similar.issues.length === 0) {
  console.log('No similar tickets found. Safe to create new ticket.');
} else {
  console.log(`\nReview these tickets before creating a new one to avoid duplicates.`);
}
```

---

## Quality Assurance Workflows

### Workflow 11: Validate Tickets Before Sprint Planning

**Use case**: Check that all tickets in sprint have required fields

**Process**:

```javascript
const sprintName = 'Sprint 47';

const sprintTickets = await jira.searchJQL(
  `project = PROJ AND sprint = "${sprintName}"`
);

const issues = [];

for (const issue of sprintTickets.issues) {
  const problems = [];

  // Check required fields
  if (!issue.fields.assignee) {
    problems.push('No assignee');
  }
  if (!issue.fields.priority) {
    problems.push('No priority');
  }
  if (!issue.fields.description || issue.fields.description.content.length === 0) {
    problems.push('Empty description');
  }
  if (!issue.fields.labels || issue.fields.labels.length === 0) {
    problems.push('No labels');
  }

  if (problems.length > 0) {
    issues.push({
      key: issue.key,
      summary: issue.fields.summary,
      problems: problems
    });
  }
}

if (issues.length === 0) {
  console.log(`All tickets in ${sprintName} are valid!`);
} else {
  console.log(`Found ${issues.length} tickets with issues:\n`);
  for (const issue of issues) {
    console.log(`${issue.key}: ${issue.summary}`);
    console.log(`  Issues: ${issue.problems.join(', ')}`);
  }
}
```

---

## Reference

**See also**:
- Ticket templates: `skills/core/jira-ticket-writer/ticket-templates.md`
- Workflow steps: `skills/core/jira-ticket-writer/workflow-steps.md`
- API reference: `skills/core/jira-ticket-writer/api-reference.md`
