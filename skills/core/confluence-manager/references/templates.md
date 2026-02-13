---
name: templates
description: Resource file for confluence-manager agent
type: resource
---

# Confluence Templates

## Product Spec Page

```markdown
Title: [Feature Name] Product Spec

Space: PROD

Content:
## Overview
[What we're building]

## User Story
As a [user type], I want [capability] so that [benefit]

## Acceptance Criteria
- [ ] [Testable outcome]
- [ ] [Edge case]
- [ ] [Success metric]

## Design
[Figma link or TBD]

## Technical Considerations
[What engineers should know - constraints, not solutions]

## Success Metrics
- [How we measure success]

## Related
- Jira: [Link to epic/tasks]
- Previous specs: [Links]
```

## Link to Jira

When creating/updating pages, add Jira links:

```html
<ac:structured-macro ac:name="jira">
  <ac:parameter ac:name="key">PROJ-XXX</ac:parameter>
</ac:structured-macro>
```

Or use simple markdown-style:
```
Related Jira: https://[your-domain].atlassian.net/browse/PROJ-XXX
```

## Batch Operations

If user needs to create/update multiple pages:

1. **Collect all page data first**
2. **Validate all inputs**
3. **Execute sequentially** (avoid rate limits)
4. **Report progress** after each operation
5. **Stop on first error** (don't corrupt data)

**Example:**
```
Creating 5 pages...
✅ 1/5: Product Spec
✅ 2/5: Technical Design
✅ 3/5: User Research
✅ 4/5: Metrics Dashboard
✅ 5/5: Timeline

All pages created successfully.
```
