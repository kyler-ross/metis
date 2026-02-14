---
name: confluence-publishing
description: Resource file for blog-content-writer agent
type: resource
---

# Confluence Publishing Workflow

## TWO-STEP WORKFLOW: Review Before Publishing

### Step 1: Generate & Show Preview

After transforming content, OUTPUT THE COMPLETE ARTICLE for user review.

Show:
1. **Metadata section** (title, slug, category, source)
2. **3D Glass Icon JSONs** (blog featured + feed card)
3. **Full article body** with inline screenshot URLs
4. **Article statistics**

Then ASK FOR APPROVAL:

```
📝 Article Ready for Review

Title: [title]
Word count: [X words]
Screenshots: [X] real URLs extracted from source
Steps: [X] total (for how-tos)
Sections: [X] H2 headings
Reading level: ~6th grade (estimated)
CTA: [Feature Name] - [brief rationale]

---

Review the article above.

✅ Type "yes" / "looks good" / "publish" to create Confluence page
❌ Type "no" or provide feedback for revisions

**Do you approve this article for publishing?**
```

### Step 2: Publish Only After Approval

**STOP and WAIT for user response.**

ONLY proceed to "Automatic Confluence Publishing" if user says:
- "yes"
- "looks good"
- "publish it"
- "go ahead"
- or similar approval

If user provides feedback, revise the article and show preview again.

## Automatic Confluence Publishing

**Only execute after user approval in Step 1.**

### Create Page

Use Confluence MCP tool `createConfluencePage`:
- cloudId: `e0c48326-d63b-455f-a056-0b08f4ca6a3d`
- spaceId: `131328` (Product Management)
- parentId: `864288777` (Draft Blog Articles folder)
- contentFormat: `markdown`
- title: [from metadata]
- body: [complete article with all sections]

### CRITICAL: Verify After Creation

**Immediately verify the page was created completely:**

1. **Read back page** using `getConfluencePage` with the returned pageId
2. **Count elements** in returned content:
   - H2 sections (## headers)
   - For how-tos: Numbered list items (1., 2., 3., etc.)
   - Image tags (`![`)
   - CTA section presence

3. **Compare against expected:**
   ```
   Expected vs Got:
   - H2 sections: 4 vs [X]
   - Steps: 8 vs [X]
   - Images: 3 vs [X]
   - CTA: Yes vs [Yes/No]
   ```

4. **If truncated**:
   ```
   ⚠️ TRUNCATION DETECTED

   Expected: 4 sections, 8 steps, 3 images, CTA
   Got: 3 sections, 6 steps, 2 images, no CTA

   Fixing with updateConfluencePage...
   ```

5. Call `updateConfluencePage` with complete content
6. **Verify again** - read back and count
7. Repeat until counts match

### Pre-Flight Size Check

Before creating page:
- If markdown > 40,000 chars: Warn user "Long article - watch for truncation"
- If > 60,000 chars: Ask user "Very long article. Split into Part 1/2?"

### Return Verified Result

Only after successful verification:

```
✅ Created & Verified: [Title]

📄 Confluence: https://yourcompany.atlassian.net/wiki/spaces/PM/pages/[ID]

Verification Status:
- ✅ All [X] H2 sections present
- ✅ All [X] numbered steps included
- ✅ [X] screenshots with real source URLs
- ✅ CTA section complete
- 📊 Size: [X] characters

Image Prompts in Page:
- Blog Featured (16:9): 3D Glass Icon JSON
- Feed Card (2:1): 3D Glass Icon JSON

Next Steps:
1. Open Confluence page
2. Copy JSONs → Paste into ChatGPT 5.1 → "Generate the image"
3. Crop as needed (16:9 or 2:1)
4. Review article content
5. Share page link with team for Webflow publishing
```
