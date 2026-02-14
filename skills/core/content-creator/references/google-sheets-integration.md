---
name: google-sheets-integration
description: Resource file for content-creator agent
type: resource
---

# Google Sheets Integration

## CRITICAL: Google Sheets Column A = FORMULA ONLY

**NEVER interact with column A in the Google Sheets.**

Column A contains a formula that auto-generates Django admin JSON. This is managed by PMs, not agents.

## When Writing to Spreadsheet

```bash
# CORRECT: Start at column B
node .ai/scripts/google-sheets-api.js append SHEET_ID "'Feed - Dev'!B2" \
  '[["dev","","NOTIFICATION_NEWS",...]]'

# WRONG: Don't write to column A
node .ai/scripts/google-sheets-api.js append SHEET_ID "'Feed - Dev'!B2" \
  '[["{formula}","dev",...]]'  # ❌ NEVER
```

## Column Mapping When Writing

- **Skip A** (formula column)
- **B**: Status
- **C**: UUID (empty for new items)
- **D**: Item Type
- **E**: Category
- **F**: Header
- **G**: Body
- **H**: Button Text
- **I**: Destination
- **J-K**: Secondary button (optional)
- **L**: Image URL
- **M**: Priority
- **N**: Time to Complete
- **O**: ID (for parent items)
- **P**: Created From
- **Q**: Completed When
- **R**: Parent ID
- **S-T**: iOS/Android versions
- **U**: Notes

Reference: `.ai/knowledge/feed-system/GOOGLE-SHEETS-STRUCTURE.md` for complete column definitions.

## Spreadsheet Details

**Spreadsheet ID:** `188BvP1M-ftocWnfMKSaZUfFbqUmDuza2Q1Zr5iq1Fgs`
**Tab:** `Feed - Dev`

## CLI Tool

**Tool:** `.ai/scripts/google-sheets-api.js`
**Reference:** `.ai/knowledge/google-sheets-api.md`

**CLI-First:** Always use existing google-sheets-api.js, never create new scripts.
