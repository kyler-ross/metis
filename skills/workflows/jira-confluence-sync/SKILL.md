---
name: jira-confluence-sync
description: Common patterns for creating and managing linked Jira tickets and Confluence pages
---

# Jira-Confluence Sync Workflow

**Purpose**: Common patterns for creating and managing linked Jira tickets and Confluence pages.

**Agents Used**: `jira-ticket-writer`, `confluence-manager`

**Performance**: All operations complete in <10s total

---

## Workflow 1: Create Epic with Product Spec

**Use case**: Starting a new feature initiative

### Steps

1. **Create Jira Epic**
```javascript
const { jira } = require('./scripts/atlassian-api.js');

const epic = await jira.createEpic(
  'PROJ',
  'Feature Name Initiative',
  'High-level description of the initiative'
);

console.log(`Epic created: ${epic.key}`);
```

2. **Create Confluence Product Spec**
```javascript
const { confluence } = require('./scripts/atlassian-api.js');

const specContent = `
<h1>Feature Name Product Spec</h1>

<h2>Overview</h2>
<p>What we're building and why</p>

<h2>User Story</h2>
<p>As a [user type], I want [capability] so that [benefit]</p>

<h2>Acceptance Criteria</h2>
<ul>
  <li>Testable outcome 1</li>
  <li>Testable outcome 2</li>
  <li>Success metric</li>
</ul>

<h2>Design</h2>
<p>Figma: [link or TBD]</p>

<h2>Technical Considerations</h2>
<p>What engineers should know - constraints, not solutions</p>

<h2>Related Jira</h2>
<p>Epic: <a href="https://[yourcompany].atlassian.net/browse/${epic.key}">${epic.key}</a></p>

<h2>Success Metrics</h2>
<ul>
  <li>How we measure success</li>
</ul>
`;

const page = await confluence.createPage(
  'PROD',  // or relevant space
  `${epic.fields.summary} - Product Spec`,
  specContent
);

console.log(`Spec created: ${page._links.base}${page._links.webui}`);
```

3. **Link Confluence Page to Epic**
```javascript
await jira.addComment(
  epic.key,
  `Product spec: ${page._links.base}${page._links.webui}`
);
```

4. **Return Summary**
```
✅ Epic & Spec Created

Epic: PROJ-123
https://[yourcompany].atlassian.net/browse/PROJ-123

Spec: Feature Name - Product Spec
https://[yourcompany].atlassian.net/wiki/spaces/PROD/pages/123456

Next: Create implementation tasks and link to epic
```

---

## Workflow 2: Create Task Breakdown for Epic

**Use case**: Breaking down an epic into actionable tasks

### Steps

1. **Define Tasks**
```javascript
const tasks = [
  {
    summary: 'Design: Create UI mockups',
    description: 'Design mockups for all screens in Feature X',
    type: 'Task'
  },
  {
    summary: 'Implement: Backend API endpoints',
    description: 'Create REST APIs for Feature X',
    type: 'Task'
  },
  {
    summary: 'Implement: Frontend components',
    description: 'Build UI components for Feature X',
    type: 'Task'
  },
  {
    summary: 'Test: E2E testing',
    description: 'End-to-end test coverage for Feature X',
    type: 'Task'
  },
  {
    summary: 'Docs: Update user documentation',
    description: 'Document new Feature X for users',
    type: 'Task'
  }
];
```

2. **Create and Link Tasks**
```javascript
const epicKey = 'PROJ-123';
const createdTasks = [];

for (const task of tasks) {
  const issue = await jira.createIssue(
    'PROJ',
    task.summary,
    task.description,
    task.type
  );
  
  await jira.linkToEpic(issue.key, epicKey);
  createdTasks.push(issue.key);
  
  console.log(`✅ Created: ${issue.key}`);
}
```

3. **Update Confluence Spec**
```javascript
// Get existing spec page
const specPage = await confluence.getPage('123456');

// Add task list to spec
const updatedContent = specPage.body.storage.value + `
<h2>Implementation Tasks</h2>
<ul>
  ${createdTasks.map(key => 
    `<li><a href="https://[yourcompany].atlassian.net/browse/${key}">${key}</a></li>`
  ).join('\n  ')}
</ul>
`;

await confluence.updatePage(
  specPage.id,
  specPage.title,
  updatedContent,
  specPage.version.number
);
```

---

## Workflow 3: Weekly Status Update (Jira → Confluence)

**Use case**: Generate weekly progress report from Jira data

### Steps

1. **Query Recent Activity**
```javascript
const lastWeek = await jira.searchJQL(
  'project = PROJ AND updated >= -7d ORDER BY updated DESC',
  { maxResults: 50 }
);
```

2. **Categorize Updates**
```javascript
const categorized = {
  completed: [],
  inProgress: [],
  blocked: []
};

for (const issue of lastWeek.issues) {
  const status = issue.fields.status.name;
  if (status === 'Done') {
    categorized.completed.push(issue);
  } else if (status === 'In Progress') {
    categorized.inProgress.push(issue);
  } else if (issue.fields.labels?.includes('blocked')) {
    categorized.blocked.push(issue);
  }
}
```

3. **Generate Confluence Report**
```javascript
const reportContent = `
<h1>Weekly Update - ${new Date().toISOString().split('T')[0]}</h1>

<h2>Completed (${categorized.completed.length})</h2>
<ul>
${categorized.completed.map(i => 
  `<li><a href="https://[yourcompany].atlassian.net/browse/${i.key}">${i.key}</a>: ${i.fields.summary}</li>`
).join('\n')}
</ul>

<h2>In Progress (${categorized.inProgress.length})</h2>
<ul>
${categorized.inProgress.map(i => 
  `<li><a href="https://[yourcompany].atlassian.net/browse/${i.key}">${i.key}</a>: ${i.fields.summary}</li>`
).join('\n')}
</ul>

<h2>Blocked (${categorized.blocked.length})</h2>
<ul>
${categorized.blocked.map(i => 
  `<li><a href="https://[yourcompany].atlassian.net/browse/${i.key}">${i.key}</a>: ${i.fields.summary}</li>`
).join('\n')}
</ul>
`;

const report = await confluence.createPage(
  'TEAM',
  `Weekly Update - ${new Date().toISOString().split('T')[0]}`,
  reportContent,
  'parent-page-id'  // parent for all weekly updates
);
```

---

## Workflow 4: Find Related Content

**Use case**: Discover related Jira tickets and Confluence pages for a topic

### Steps

1. **Search Jira**
```javascript
const jiraResults = await jira.searchJQL(
  'project = PROJ AND text ~ "feature-name" ORDER BY created DESC'
);
```

2. **Search Confluence**
```javascript
const confluenceResults = await confluence.searchCQL(
  'text ~ "feature-name" AND space IN (PROD, TEAM) ORDER BY lastmodified DESC'
);
```

3. **Present Results**
```
Found Related Content:

Jira Tickets (${jiraResults.total}):
${jiraResults.issues.slice(0, 5).map(i => 
  `- ${i.key}: ${i.fields.summary}`
).join('\n')}

Confluence Pages (${confluenceResults.results.length}):
${confluenceResults.results.slice(0, 5).map(p => 
  `- ${p.title} (${p.space.name})`
).join('\n')}
```

---

## Workflow 5: Bulk Update from Spreadsheet

**Use case**: Create multiple tickets from a list (e.g., tech debt items)

### Steps

1. **Parse Input Data**
```javascript
const items = [
  { summary: 'Fix: Memory leak in component X', type: 'Bug', priority: 'High' },
  { summary: 'Refactor: Simplify auth logic', type: 'Improvement', priority: 'Medium' },
  { summary: 'Update: Upgrade dependency Y', type: 'Task', priority: 'Low' }
];
```

2. **Bulk Create**
```javascript
const created = [];

for (const item of items) {
  try {
    const issue = await jira.createIssue(
      'PROJ',
      item.summary,
      `Priority: ${item.priority}`,
      item.type,
      { labels: ['tech-debt', 'Q1-2026'] }
    );
    
    created.push(issue);
    console.log(`✅ ${issue.key}`);
  } catch (error) {
    console.error(`❌ Failed: ${item.summary} - ${error.message}`);
  }
}
```

3. **Document in Confluence**
```javascript
const content = `
<h1>Tech Debt Tracker - Q1 2025</h1>
<p>Created: ${new Date().toISOString().split('T')[0]}</p>

<table>
  <tr>
    <th>Ticket</th>
    <th>Summary</th>
    <th>Type</th>
  </tr>
  ${created.map(i => `
    <tr>
      <td><a href="https://[yourcompany].atlassian.net/browse/${i.key}">${i.key}</a></td>
      <td>${i.fields.summary}</td>
      <td>${i.fields.issuetype.name}</td>
    </tr>
  `).join('\n')}
</table>
`;

await confluence.createPage(
  'ENG',
  'Tech Debt Tracker - Q1 2025',
  content
);
```

---

## Best Practices

### Performance Optimization

1. **Batch operations sequentially** (avoid rate limits)
2. **Cache project/space metadata** (see `jira-integration.md`)
3. **Use pagination** for large queries
4. **Set timeouts** for all API calls (5-10s max)

### Error Handling

1. **Always wrap in try-catch**
2. **Log failures but continue** in bulk operations
3. **Validate inputs** before API calls
4. **Get current version** before updating Confluence pages

### User Experience

1. **Show progress** for multi-step workflows
2. **Provide URLs** for all created items
3. **Summarize** what was accomplished
4. **Report failures** clearly with next steps

### Example Pattern

```javascript
async function createEpicWithSpec(epicData, specData) {
  console.log('Starting epic creation workflow...');
  
  try {
    // Step 1
    console.log('1/3 Creating epic...');
    const epic = await jira.createEpic(epicData.project, epicData.summary, epicData.description);
    console.log(`✅ Epic: ${epic.key}`);
    
    // Step 2
    console.log('2/3 Creating spec...');
    const page = await confluence.createPage(
      specData.space,
      specData.title,
      specData.content.replace('{{EPIC_KEY}}', epic.key)
    );
    console.log(`✅ Spec: ${page.title}`);
    
    // Step 3
    console.log('3/3 Linking epic to spec...');
    await jira.addComment(epic.key, `Spec: ${page._links.base}${page._links.webui}`);
    console.log('✅ Linked');
    
    return {
      success: true,
      epic: {
        key: epic.key,
        url: `https://[yourcompany].atlassian.net/browse/${epic.key}`
      },
      spec: {
        title: page.title,
        url: `${page._links.base}${page._links.webui}`
      }
    };
  } catch (error) {
    console.error('❌ Workflow failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
```

---

## Reference

- **API Wrapper**: `scripts/atlassian-api.js`
- **Jira Agent**: `skills/core/jira-ticket-writer.md`
- **Confluence Agent**: `skills/core/confluence-manager.md`
- **Integration Guide**: `knowledge/jira-integration.md`
