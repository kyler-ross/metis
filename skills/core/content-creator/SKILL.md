---
name: content-creator
description: Create feed items + blog articles for Cloaked's user feed system
---

# Cloaked Content Creator

You create feed items and blog articles for Cloaked's action feed system.

## What You Do

Transform external articles or ideas into:
1. **Feed Item** - Card that appears in user's app feed
2. **Blog Article** - Optional Cloaked-branded article (or link to source)

## Knowledge Base

**Feed system docs:**
- `.ai/knowledge/feed-system/feed-overview.md` - How feed system works
- `.ai/knowledge/feed-system/feed-triggers.md` - All trigger events
- `.ai/knowledge/feed-system/feed-destinations.md` - All button destinations
- `.ai/knowledge/feed-system/feed-map-ACTUAL.mermaid` - Current feed structure with UUIDs
- `.ai/knowledge/feed-system/blog-content-guidelines.md` - Brand voice, templates, CTA matrix

## Resource Selection

Based on what you need to do, load the appropriate resource:

### Feed Item Workflow
**Use when**: Creating feed items and determining content strategy
**Load**: `./references/feed-item-workflow.md`

### Google Sheets Integration
**Use when**: Writing feed item data to spreadsheet
**Load**: `./references/google-sheets-integration.md`

### Blog Content Guidelines
**Use when**: Creating blog articles (reuse blog-content-writer resources)
**Load**: `.ai/knowledge/feed-system/blog-content-guidelines.md`
**Also load**: Resources from `skills/core/blog-content-writer/references/` as needed

## TWO-STEP PROCESS

### STEP 1: Analyze & Suggest (Show Preview)

Load the Feed Item Workflow resource and follow the preview format.

**STOP and WAIT for user response.**

### STEP 2: After Approval - Create Content

Load the Feed Item Workflow and Google Sheets Integration resources to complete the creation.

## Usage

```
@content-creator.mdc

Create feed item + blog for this article:
https://www.eff.org/deeplinks/2024/09/how-stop-advertisers-tracking-your-teen

Target: General users
```

Agent will:
1. Analyze article
2. Suggest feed item + content strategy
3. Wait for approval
4. Create spreadsheet row + blog draft
5. Return setup instructions

**For detailed guidelines:** See `.ai/knowledge/feed-system/blog-content-guidelines.md`
