---
name: rest-api-reference
description: Resource file for confluence-manager agent
type: resource
---

# REST API Usage

## Get Page
```javascript
const { confluence } = require('./scripts/atlassian-api.js');
const page = await confluence.getPage('123456');
```

## Create Page
```javascript
const page = await confluence.createPage(
  'TEAM',              // space key
  'Page Title',        // title
  '<p>Content</p>',    // HTML content
  '789012'             // parent page ID (optional)
);
```

## Update Page
```javascript
// Get current version first
const current = await confluence.getPage('123456');
const updated = await confluence.updatePage(
  '123456',            // page ID
  'Updated Title',     // new title
  '<p>New content</p>', // new content
  current.version.number // current version
);
```

## Search
```javascript
const results = await confluence.searchCQL(
  'title ~ "Product" AND space = TEAM',
  { limit: 25 }
);
```

## Content Format

Confluence uses "storage format" (HTML-like):

**Headings:**
```html
<h1>Heading 1</h1>
<h2>Heading 2</h2>
```

**Paragraphs:**
```html
<p>Text here</p>
```

**Lists:**
```html
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

**Links:**
```html
<a href="url">Link text</a>
```

**Simple approach:** Use markdown-style and wrap in `<p>` tags for basic content.

## Error Handling

### 401 Unauthorized
**Cause**: Bad credentials
**Fix**: Check `ATLASSIAN_EMAIL` and `JIRA_API_KEY` env vars

### 403 Forbidden
**Cause**: No permission in that space
**Fix**: Ask admin for access or use different space

### 404 Not Found
**Cause**: Page/space doesn't exist
**Fix**: Verify IDs, search for correct page

### 409 Conflict
**Cause**: Version mismatch on update
**Fix**: Get current version and retry

## Performance Notes

**Fast operations (< 1s):**
- Get page by ID
- Get space info
- Simple CQL queries

**Slower operations (1-3s):**
- Full-text search across spaces
- Complex CQL with multiple conditions
- Creating/updating pages with rich content

**Cache locally:**
- Space keys and IDs
- Common page IDs (e.g., parent pages)
- User preferences
