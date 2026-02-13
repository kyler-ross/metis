---
name: api-reference
description: Resource file for jira-ticket-writer agent
type: resource
---

# Jira Ticket Writer - API Reference

This resource contains technical reference for Jira API operations, ADF formatting, JQL queries, and troubleshooting.

---

## CLI Command Reference

**Primary method**: Use CLI scripts at `scripts/atlassian-api.js`

**Why CLI over MCP**: <3 second response time, no timeouts, proven reliable

---

## Creating Tickets

### Basic Ticket Creation

```bash
node scripts/atlassian-api.js jira create \
  --project "PROJ" \
  --type "Task" \
  --summary "Title here" \
  --description "[ADF formatted JSON or plain text]" \
  --priority "High" \
  --labels "label1,label2" \
  --components "Mobile"
```

### Using JavaScript Library

```javascript
const { jira } = require('./scripts/atlassian-api.js');

const issue = await jira.createIssue(
  'ALL',                    // project key
  'Title here',             // summary
  descriptionADF,           // description (ADF object or string)
  'Task'                    // issue type
);

console.log(`Created: ${issue.key}`);
console.log(`URL: https://[your-domain].atlassian.net/browse/${issue.key}`);
```

---

## ADF (Atlassian Document Format)

**CRITICAL**: Jira uses ADF (JSON-based) for descriptions, NOT plain text or markdown.

### Basic Structure

All ADF documents follow this structure:

```javascript
{
  type: 'doc',
  version: 1,
  content: [
    // array of content nodes (paragraphs, headings, lists, etc.)
  ]
}
```

### Paragraph

```javascript
{
  type: 'paragraph',
  content: [
    { type: 'text', text: 'Your text here' }
  ]
}
```

### Heading

```javascript
{
  type: 'heading',
  attrs: { level: 2 },  // H2 (use 1-6)
  content: [
    { type: 'text', text: 'Heading Text' }
  ]
}
```

### Bullet List

```javascript
{
  type: 'bulletList',
  content: [
    {
      type: 'listItem',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'First item' }]
      }]
    },
    {
      type: 'listItem',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Second item' }]
      }]
    }
  ]
}
```

### Ordered List

```javascript
{
  type: 'orderedList',
  content: [
    {
      type: 'listItem',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Step 1' }]
      }]
    },
    {
      type: 'listItem',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Step 2' }]
      }]
    }
  ]
}
```

### Complete Bug Description Example

```javascript
const bugDescription = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Source' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'internal-qa' }]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Impact' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'moderate - Affects users who attempt account deletion' }]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'User Pain' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'crash - App crashes, forcing restart' }]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'What happened' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'App crashes immediately when user taps "Delete Account" in Settings' }]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'What should have happened' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Should show confirmation dialog, then delete account and log out' }]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Repro' }]
    },
    {
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Open [Your Company] app on iOS' }]
          }]
        },
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Navigate to Settings > Account' }]
          }]
        },
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Tap "Delete Account"' }]
          }]
        },
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'App crashes before confirmation dialog appears' }]
          }]
        }
      ]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Notes' }]
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Only affects iOS 16+' }]
          }]
        },
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'May be related to recent keychain changes in PROJ-XXX' }]
          }]
        }
      ]
    }
  ]
};
```

---

## JQL (Jira Query Language)

### Search Tickets

```bash
node scripts/atlassian-api.js jira search "project = PROJ AND status = 'In Progress'"
```

### Common JQL Patterns

**By project**:
```jql
project = PROJ
```

**By status**:
```jql
status = "In Progress"
status != Done
status IN ("To Do", "In Progress")
```

**By assignee**:
```jql
assignee = currentUser()
assignee = "john.doe@company.com"
assignee IN (john, jane, bob)
```

**By date**:
```jql
created >= -7d          # Last 7 days
updated >= -7d
created >= "2025-01-01"
```

**By labels**:
```jql
labels = iOS
labels IN (iOS, Android)
```

**By text search**:
```jql
text ~ "search term"
summary ~ "login bug"
```

**By sprint**:
```jql
sprint in openSprints()
sprint = "Sprint 47"
```

**By parent (epic)**:
```jql
parent = PROJ-XXX
"Epic Link" = PROJ-XXX
```

**Complex queries**:
```jql
project = PROJ
  AND status = "In Progress"
  AND assignee = currentUser()
  AND labels IN (iOS, Android)
  AND created >= -7d
ORDER BY priority DESC, updated DESC
```

### JavaScript Usage

```javascript
const { jira } = require('./scripts/atlassian-api.js');

// Recent tickets
const recent = await jira.searchJQL('project = PROJ AND created >= -7d');

// My open tickets
const mine = await jira.searchJQL('assignee = currentUser() AND status != Done');

// By label
const labeled = await jira.searchJQL('project = PROJ AND labels = product-analytics');
```

---

## Epic Management

### Create Epic

```javascript
const epic = await jira.createEpic(
  'ALL',
  'Feature X Initiative',
  'Complete rollout of Feature X across all platforms'
);

console.log(`Created epic: ${epic.key}`);
```

### Link Task to Epic

```javascript
await jira.linkToEpic('PROJ-XXX', 'PROJ-XXX');
// Links PROJ-XXX as a child of epic PROJ-XXX
```

### Search Epic's Tasks

```jql
parent = PROJ-XXX
```

```javascript
const tasks = await jira.searchJQL('parent = PROJ-XXX');
console.log(`Epic has ${tasks.issues.length} tasks`);
```

---

## Updating Tickets

### Add Comment

```javascript
await jira.addComment('PROJ-XXX', 'Status update: Implementation complete, testing in progress');
```

### Update Fields

```javascript
await jira.updateIssue('PROJ-XXX', {
  labels: ['Q1-2025', 'high-priority'],
  priority: { name: 'High' },
  assignee: { name: 'john.doe' }
});
```

### Get Ticket Details

```javascript
const issue = await jira.getIssue('PROJ-XXX');
console.log(`Status: ${issue.fields.status.name}`);
console.log(`Assignee: ${issue.fields.assignee?.displayName || 'Unassigned'}`);
console.log(`Priority: ${issue.fields.priority.name}`);
```

---

## Environment Setup

### Required Environment Variables

```bash
export ATLASSIAN_URL="https://[your-domain].atlassian.net"
export ATLASSIAN_EMAIL="your.email@company.com"
export JIRA_API_KEY="your_api_token"
```

### Get API Token

1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a name (e.g., "PM AI System")
4. Copy the token
5. Set as `JIRA_API_KEY` environment variable

**Security**: Store in `.env` file (gitignored) or shell profile, never commit to git

---

## Troubleshooting

### 401 Unauthorized

**Cause**: Invalid credentials

**Fix**:
- Check `ATLASSIAN_EMAIL` is set correctly (use email, not username)
- Check `JIRA_API_KEY` is valid (regenerate if needed)
- Verify env vars are exported in current shell

### 403 Forbidden

**Cause**: No permission in project

**Fix**:
- Ask admin for "Create Issues" permission in ALL project
- Verify you're using the correct Atlassian account

### 400 Bad Request

**Cause**: Invalid field values or missing required fields

**Fix**:
- Check issue type name is correct (case-sensitive: "Task", "Bug", "Story")
- Verify all required fields are provided
- Check ADF format is valid (common issue: malformed JSON)
- Check priority/component/label names are valid

**Debug**:
```javascript
try {
  await jira.createIssue(...);
} catch (error) {
  console.error('Error details:', error.response.data);
  // Shows which field is invalid
}
```

### 404 Not Found

**Cause**: Project or issue doesn't exist

**Fix**:
- Verify project key is correct ("ALL", not "all" or "All")
- Check issue key exists (e.g., PROJ-XXX is a real ticket)

### Timeout / No Response

**Cause**: Network issue or API slowness

**Fix**:
- Retry the request
- Check internet connection
- Verify Atlassian status: https://status.atlassian.com/

### ADF Format Errors

**Common mistakes**:

❌ **Wrong**: Plain text string
```javascript
description: "This is a description"
```

✅ **Right**: ADF object
```javascript
description: {
  type: 'doc',
  version: 1,
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'This is a description' }]
  }]
}
```

❌ **Wrong**: Missing `content` array in paragraph
```javascript
{
  type: 'paragraph',
  text: 'Wrong format'
}
```

✅ **Right**: Paragraph with content array
```javascript
{
  type: 'paragraph',
  content: [{ type: 'text', text: 'Correct format' }]
}
```

---

## REST API Direct Access

**If CLI fails**, use REST API directly:

### Endpoint

```
POST https://[your-domain].atlassian.net/rest/api/3/issue
```

### Headers

```
Content-Type: application/json
Authorization: Basic [base64(email:api_token)]
```

### Body

```json
{
  "fields": {
    "project": { "key": "ALL" },
    "summary": "Ticket title",
    "description": { /* ADF object */ },
    "issuetype": { "name": "Task" },
    "priority": { "name": "High" },
    "labels": ["iOS", "Account-Management"],
    "components": [{ "name": "Mobile" }]
  }
}
```

### Example with curl

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -u "your.email@company.com:your_api_token" \
  -d '{"fields":{"project":{"key":"ALL"},"summary":"Test ticket","issuetype":{"name":"Task"}}}' \
  https://[your-domain].atlassian.net/rest/api/3/issue
```

---

## Reference Documentation

**Jira REST API**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
**ADF Spec**: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
**JQL Reference**: https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/

**Internal docs**:
- Priority matrix: `knowledge/jira-priority-matrix.md`
- Components/labels: `knowledge/jira-components-labels.md`
- Integration guide: `knowledge/jira-integration.md`
