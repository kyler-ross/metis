# Scripts

CLI tools that connect your PM AI system to external services. Each script is a standalone Node.js program designed to be called by Claude Code during conversations. The agent reads the script, understands its CLI interface, and calls it on your behalf.

You do not need to memorize these commands. Claude Code will call them automatically when you ask it to do things like "check my calendar," "create a Jira ticket," or "what's in my inbox." But understanding what's available helps you know what to ask for.

## Script Overview

| Script | Purpose | Services Used |
|--------|---------|---------------|
| `google-calendar-api.js` | Calendar events, free/busy, scheduling | Google Calendar |
| `google-gmail-api.cjs` | Email inbox, send, draft | Gmail |
| `google-sheets-api.cjs` | Read/write spreadsheet data | Google Sheets |
| `google-drive-api.js` | File listing, search, download | Google Drive |
| `google-docs-creator.cjs` | Create/read/update documents | Google Docs |
| `google-forms-api.js` | Form management | Google Forms |
| `google-slides-api.js` | Presentation management | Google Slides |
| `google-auth-setup.js` | OAuth setup wizard | Google OAuth |
| `atlassian-api.cjs` | Jira tickets, search, Confluence | Jira + Confluence |
| `confluence-sync.cjs` | Sync Confluence pages locally | Confluence |
| `slack-api.cjs` | Channel messages, DMs | Slack |
| `dovetail-api.js` | Research insights, notes | Dovetail |
| `daily-report-dm.cjs` | Automated daily digest | Slack + Google |
| `setup-doctor.cjs` | Diagnose configuration issues | All services |

## Setup by Service

### Google OAuth (Calendar, Gmail, Sheets, Drive, Docs, Forms, Slides)

All Google scripts share a single OAuth token. Set it up once, and every Google script works.

**Step 1: Create a Google Cloud Project**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top, then "New Project"
3. Name it something like "PM AI Tools" and click Create
4. Select the new project from the project dropdown

**Step 2: Enable the APIs**

In the Google Cloud Console for your project:

1. Go to "APIs & Services" > "Library"
2. Search for and enable each of these APIs:
   - Google Calendar API
   - Gmail API
   - Google Sheets API
   - Google Drive API
   - Google Docs API
   - Google Forms API
   - Google Slides API

Click "Enable" on each one. This takes about 30 seconds per API.

**Step 3: Create OAuth 2.0 Credentials**

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted to configure the consent screen:
   - Choose "External" user type
   - Fill in your app name ("PM AI Tools") and your email
   - Add your email as a test user
   - Skip scopes for now (the scripts request them at runtime)
4. For Application Type, choose **Desktop app**
5. Name it "PM AI CLI"
6. Click Create
7. Copy the **Client ID** and **Client Secret**

**Step 4: Add Credentials to Your .env**

Add these lines to `scripts/.env`:

```
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

**Step 5: Run the Auth Flow**

```bash
node scripts/google-auth-setup.js
```

This opens your browser for Google sign-in. After you authorize, a token is saved to `scripts/.google-token.json`. This file is gitignored and should never be committed.

**Token Refresh**: Tokens expire but auto-refresh. If you hit auth errors, re-run `google-auth-setup.js`.

### Jira and Confluence (Atlassian)

Both Jira and Confluence use the same Atlassian API token.

**Step 1: Generate an API Token**

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Label it "PM AI" and copy the token

**Step 2: Add to .env**

```
ATLASSIAN_EMAIL=your-email@company.com
JIRA_API_KEY=your-api-token-here
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_PROJECT_KEY=YOUR_PROJECT
```

**Step 3: Verify**

```bash
node scripts/atlassian-api.cjs jira search "project = YOUR_PROJECT ORDER BY updated DESC" --limit 3
```

If you see your recent tickets, it works.

### Slack

**Step 1: Create a Slack App**

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch"
3. Name it "PM AI" and select your workspace

**Step 2: Add Bot Token Scopes**

Under "OAuth & Permissions", add these Bot Token Scopes:

- `channels:history` - Read public channel messages
- `channels:read` - List channels
- `chat:write` - Send messages
- `groups:history` - Read private channel messages
- `groups:read` - List private channels
- `im:history` - Read DMs
- `im:read` - List DMs
- `users:read` - User info
- `users:read.email` - User emails

**Step 3: Install to Workspace**

Click "Install to Workspace" and authorize. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

**Step 4: Add to .env**

```
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_DEFAULT_CHANNEL=general
```

### Dovetail

**Step 1: Get API Token**

1. In Dovetail, go to Settings > API
2. Generate a new API token
3. Copy it

**Step 2: Add to .env**

```
DOVETAIL_API_KEY=your-dovetail-api-key
```

## Usage Examples

### Google Calendar

```bash
# Today's events
node scripts/google-calendar-api.js today

# Events for a date range
node scripts/google-calendar-api.js events --start 2026-02-14 --end 2026-02-21

# Search for events
node scripts/google-calendar-api.js search "standup"

# Check free/busy for a group
node scripts/google-calendar-api.js freebusy --emails "alice@co.com,bob@co.com" --date 2026-02-14

# Find an open slot
node scripts/google-calendar-api.js find-slot --duration 30 --attendees "alice@co.com"

# Create an event
node scripts/google-calendar-api.js create --title "1:1 with Alice" --start "2026-02-14T10:00" --duration 30

# Quick create (natural language)
node scripts/google-calendar-api.js quick "Lunch with team tomorrow at noon"
```

### Gmail

```bash
# Today's inbox
node scripts/google-gmail-api.cjs today

# List recent messages
node scripts/google-gmail-api.cjs list --limit 10

# Read a specific email
node scripts/google-gmail-api.cjs read MESSAGE_ID

# Read a full thread
node scripts/google-gmail-api.cjs thread THREAD_ID

# Send an email
node scripts/google-gmail-api.cjs send --to "alice@co.com" --subject "Re: Launch plan" --body "Looks good to me."

# Draft an email (does not send)
node scripts/google-gmail-api.cjs draft --to "alice@co.com" --subject "Q1 Update" --body "Here's where we stand..."
```

### Google Sheets

```bash
# Get spreadsheet info
node scripts/google-sheets-api.cjs info SPREADSHEET_ID

# Read entire sheet
node scripts/google-sheets-api.cjs read SPREADSHEET_ID

# Read a specific range
node scripts/google-sheets-api.cjs read-range SPREADSHEET_ID "Sheet1!A1:D10"

# Read specific rows
node scripts/google-sheets-api.cjs read-rows SPREADSHEET_ID --start 1 --end 20

# Write data
node scripts/google-sheets-api.cjs write SPREADSHEET_ID "Sheet1!A1" '{"values": [["Name", "Status"], ["Alice", "Done"]]}'

# Update a cell
node scripts/google-sheets-api.cjs update SPREADSHEET_ID "Sheet1!B2" "In Progress"

# Append rows
node scripts/google-sheets-api.cjs append SPREADSHEET_ID '{"values": [["Bob", "Pending"]]}'

# Create a new tab
node scripts/google-sheets-api.cjs create-tab SPREADSHEET_ID "Q1 Metrics"

# Write a formatted table
node scripts/google-sheets-api.cjs write-table SPREADSHEET_ID "Sheet1!A1" '{"headers": ["Name", "Role"], "rows": [["Alice", "PM"], ["Bob", "Eng"]]}'
```

### Google Drive

```bash
# List recent files
node scripts/google-drive-api.js list

# Search for files
node scripts/google-drive-api.js search "Q1 roadmap"

# Download a file
node scripts/google-drive-api.js download FILE_ID --output ./local-copy.pdf
```

### Google Docs

```bash
# Create a new document
node scripts/google-docs-creator.cjs create --title "Sprint Retrospective" --content "## What went well\n\n## What to improve"

# Read a document
node scripts/google-docs-creator.cjs read DOC_ID

# Update a document
node scripts/google-docs-creator.cjs update DOC_ID --content "Updated content here"

# Append to a document
node scripts/google-docs-creator.cjs append DOC_ID --content "\n## New section\nAdded today."
```

### Jira

```bash
# Search with JQL
node scripts/atlassian-api.cjs jira search "project = PROJ AND status = 'In Progress' ORDER BY updated DESC"

# Shorthand search (non-JQL text)
node scripts/atlassian-api.cjs search "onboarding flow bugs"

# Get a specific ticket
node scripts/atlassian-api.cjs jira get PROJ-123

# Shorthand get
node scripts/atlassian-api.cjs PROJ-123

# Create a ticket
node scripts/atlassian-api.cjs jira create --project PROJ --type Story --summary "Add dark mode" --description "Users have requested dark mode support."

# Create with ADF formatting (use a file for complex descriptions)
node scripts/atlassian-api.cjs jira create --project PROJ --type Story --summary "Add dark mode" --description-file /tmp/desc.json

# Update a ticket
node scripts/atlassian-api.cjs jira update PROJ-123 --status "In Progress"

# Add a comment
node scripts/atlassian-api.cjs jira comment PROJ-123 "Blocked on API changes. Moving to next sprint."
```

### Confluence

```bash
# Search pages
node scripts/atlassian-api.cjs confluence search "onboarding architecture"

# Get a specific page
node scripts/atlassian-api.cjs confluence get PAGE_ID

# Sync Confluence pages locally (check what needs updating)
node scripts/confluence-sync.cjs --check

# Sync a specific page
node scripts/confluence-sync.cjs --page PAGE_ID
```

### Slack

```bash
# Read recent messages from a channel
node scripts/slack-api.cjs read --channel general --limit 20

# Search messages
node scripts/slack-api.cjs search "deployment issues"

# Send a message
node scripts/slack-api.cjs send --channel general --text "Deploy complete."

# List channels
node scripts/slack-api.cjs channels
```

### Dovetail

```bash
# Search research insights
node scripts/dovetail-api.js search "onboarding friction"

# List projects
node scripts/dovetail-api.js projects

# Get notes from a project
node scripts/dovetail-api.js notes --project PROJECT_ID
```

### Daily Report

```bash
# Generate daily digest (dry run)
node scripts/daily-report-dm.cjs --dry-run

# Send to yourself
node scripts/daily-report-dm.cjs --user=YOUR_SLACK_ID
```

### Setup Doctor (Diagnostics)

```bash
# Check all integrations
node scripts/setup-doctor.cjs

# Auto-fix common issues
node scripts/setup-doctor.cjs --fix
```

## Writing Your Own Scripts

Every script follows the same pattern:

1. Load credentials from `.env` using `dotenv`
2. Parse CLI arguments
3. Call the external API
4. Print results to stdout (so Claude Code can read them)
5. Exit with code 0 on success, 1 on error

Here is the minimal template:

```javascript
#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.MY_SERVICE_API_KEY;
if (!API_KEY) {
  console.error('Error: MY_SERVICE_API_KEY required in scripts/.env');
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    case 'list':
      // Call your API and print results
      break;
    case 'get':
      // Get a specific resource
      break;
    default:
      console.log('Usage: node my-script.cjs [list|get] [args]');
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

Claude Code discovers your script by reading the file. Write clear `--help` output and your agent will know how to use it.

## Credential File Reference

| File | Purpose | Gitignored |
|------|---------|------------|
| `scripts/.env` | API keys and tokens for all scripts | Yes |
| `scripts/.google-token.json` | Google OAuth refresh token | Yes |
| `scripts/.env.example` | Template showing required variables | No (committed) |

Never commit `.env` or `.google-token.json`. If you accidentally expose a credential, rotate it immediately.

## Troubleshooting

**"Missing credentials" errors**: Run `node scripts/setup-doctor.cjs` to check all integrations at once.

**Google "token expired"**: Re-run `node scripts/google-auth-setup.js` to get a fresh token.

**Jira 401/403**: Your API token may have been revoked. Generate a new one at id.atlassian.com.

**Slack "invalid_auth"**: Reinstall the Slack app to your workspace and update the bot token.

**"ENOTFOUND" or "ECONNREFUSED"**: Network issue, not an auth issue. Check your internet connection and any VPN settings.

**Script hangs**: Most scripts have no timeout by default. Press Ctrl+C to cancel, then run with `timeout 30s node scripts/...` to add a timeout.
