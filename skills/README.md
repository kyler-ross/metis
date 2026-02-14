# PM AI Skills

This directory contains 50 skills following the [SKILL.md standard](https://agentskills.io) with 100% spec compliance.

## Directory Structure

```
skills/
├── _index.json          # Central registry for routing and discovery
├── core/                # Core PM skills (17)
├── experts/             # Expert personas for panels (13)
├── specialized/         # Specialized tools - PDF, video, OCR (10)
├── workflows/           # Multi-skill orchestration (3)
├── personas/            # Customer personas for testing (4)
└── utilities/           # System utilities (3)
```

## Categories

| Category | Count | Purpose |
|----------|-------|---------|
| **core** | 17 | Daily PM work: Jira, Confluence, SQL, coaching, updates |
| **experts** | 13 | Expert personas for `/expert-panel` discussions |
| **specialized** | 10 | Tools: PDF processor, video processor, OCR, transcripts |
| **workflows** | 3 | Multi-skill orchestration patterns |
| **personas** | 4 | Customer personas for feature testing |
| **utilities** | 3 | System helpers: auto-pull, desktop-launcher, ralph |

## SKILL.md Format

Each skill follows the SKILL.md specification:

```yaml
---
name: skill-name          # 1-64 chars, lowercase, hyphens only
description: Brief desc   # 1-1024 chars, what this skill does
---

# Skill content here
Instructions, modes, examples...
```

**Required frontmatter fields:**
- `name`: Lowercase with hyphens only (`^[a-z0-9-]+$`), max 64 chars
- `description`: Brief description, max 1024 chars

**No other frontmatter fields are allowed** per the spec.

## Skill Structure

Each skill directory contains:

```
skills/<category>/<name>/
├── SKILL.md              # Main instructions (required)
└── references/           # Supporting files (required)
    ├── manifest.json     # Routing metadata (required)
    └── *.md              # Additional docs (optional)
```

### manifest.json Schema

```json
{
  "version": "1.0",
  "routing": {
    "keywords": ["trigger", "words"],
    "semantic_tags": ["capability-tags"],
    "confidence_threshold": 0.7
  },
  "io": {
    "input_types": ["what-it-accepts"],
    "output_types": ["what-it-produces"]
  },
  "execution": {
    "estimated_tokens": 2500,
    "mcp_tools": ["github", "jira"],
    "can_orchestrate": false,
    "compatible_skills": []
  },
  "quality": {
    "success_signals": ["indicators-of-success"],
    "failure_modes": ["common-failures"]
  },
  "required_context": [".ai/knowledge/file.md"],
  "meta": {
    "author": "kyler",
    "version": "1.0",
    "status": "active"
  }
}
```

## Using Skills

### Automatic routing (recommended)
```
/pm-ai "create a Jira ticket for the login bug"
```
The router checks `_index.json` keywords and routes to the appropriate skill.

### Direct invocation
```
/pm-jira "create ticket for login bug"
/pm-coach "review this feature design"
/expert-panel "should we build X?"
```

## Adding New Skills

See [docs/ADDING-SKILLS.md](../docs/ADDING-SKILLS.md) for a step-by-step guide.

Quick version:
```bash
# 1. Create structure
mkdir -p skills/core/my-skill/references

# 2. Create SKILL.md with proper frontmatter
# 3. Create references/manifest.json

# 4. Validate
node scripts/validate-skills.cjs

# 5. Regenerate index
node scripts/generate-index.cjs
```

## Validation

```bash
# Check all skills against spec
node scripts/validate-skills.cjs

# Expected output:
# === VALIDATION SUMMARY ===
# Total skills:      50
# Valid (no errors): 50
# Spec compliance: 50/50 (100%)
```

## Marketplace

Skills are organized into 6 installable plugins in `.claude-plugin/marketplace.json`:
- `core-pm-skills` - Core PM workflows
- `expert-personas` - Expert panel discussions
- `specialized-tools` - PDF, video, OCR tools
- `workflows` - Multi-skill orchestration
- `customer-personas` - User testing personas
- `utilities` - System helpers
