// PM AI Starter Kit - atlassian-api.cjs
// See scripts/README.md for setup
/**
 * Atlassian API CLI - Jira and Confluence operations
 *
 * Wraps jira-client.cjs and confluence-client.cjs with a CLI interface.
 */

// Load environment variables BEFORE importing clients (they read env at module load)
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { confluence, makeRequest: makeConfluenceRequest } = require('./lib/confluence-client.cjs');
const { jira } = require('./lib/jira-client.cjs');

// Re-export both
module.exports = { jira, confluence };

/**
 * Parse CLI args into an object
 * Handles: --key value, --key "value with spaces", --flag (boolean)
 */
function parseArgs(args) {
  const result = { _positional: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      result._positional.push(arg);
      i += 1;
    }
  }
  return result;
}

/**
 * Look up user account ID by name
 */
async function lookupUser(name) {
  const https = require('https');
  const email = process.env.ATLASSIAN_EMAIL;
  const apiKey = process.env.JIRA_API_KEY;
  const baseUrl = process.env.JIRA_BASE_URL || 'https://yourcompany.atlassian.net';
  const hostname = new URL(baseUrl).hostname;

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: `/rest/api/3/user/search?query=${encodeURIComponent(name)}`,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${email}:${apiKey}`).toString('base64'),
        'Accept': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const users = JSON.parse(data);
          if (users.length > 0) {
            resolve(users[0].accountId);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

const JIRA_HELP = `
Jira CLI Commands:

  READ:
    jira get-issue <key>              Get issue details (alias: get-ticket)
    jira search "<JQL>"               Search with JQL
    jira get-projects                 List all projects

  WRITE:
    jira create --type <type> --summary "<title>" --description "<body>" [options]
      Options:
        --project <key>      Project key (default: PROJ)
        --type <type>        Issue type: Bug, Task, Story, Epic (required)
        --summary "<text>"   Issue title (required)
        --description "<text>" Issue body (plain text or ADF JSON)
        --description-file <path> Read description from file (preferred for ADF JSON)
        --labels "a,b,c"     Comma-separated labels
        --priority <level>   Highest, High, Medium, Low, Lowest
        --assignee "<name>"  Assignee name (will look up account ID)
        --components "a,b"   Comma-separated components
        --parent <key>       Parent issue key (for subtasks)

    jira create-epic --summary "<title>" --description "<body>" [options]
      Creates an Epic. DR planning sections are auto-embedded for high-risk categories:
        - Labels: payments, auth, infrastructure, data, security (and variants)
          NOTE: Label matching is case-insensitive
        - Components: Payments, Auth, Infrastructure, Data, Security, etc.
          NOTE: Component names are case-sensitive (use exact Jira component names)
      DR sections include: failure scenarios, impact assessment, monitoring, and rollback plan.
      For other epics, use --with-dr to force DR sections.
      Options:
        --project <key>      Project key (default: PROJ)
        --summary "<text>"   Epic title (required)
        --description "<text>" Epic description (plain text or ADF JSON)
        --description-file <path> Read description from file (preferred for ADF JSON)
        --labels "a,b,c"     Comma-separated labels (triggers auto-DR if matches, case-insensitive)
        --components "a,b"   Comma-separated components (triggers auto-DR if matches, case-sensitive)
        --priority <level>   Highest, High, Medium, Low, Lowest
        --with-dr            Force DR sections even for low-risk epics

    jira update <key> --field value   Update issue fields
      Options:
        --description-file <path> Read description from file (preferred for ADF JSON)
      Examples:
        jira update PROJ-123 --summary "New title"
        jira update PROJ-123 --assignee "Jane Smith"
        jira update PROJ-123 --labels "urgent,backend"

    jira comment <key> "<comment>"    Add a comment
    jira assign <key> "<name>"        Assign to user

  Examples:
    jira create --type Bug --summary "Login broken" --description "Users cannot log in" --priority High
    jira create --type Task --summary "Update docs" --description "..." --labels "docs,low-priority"
    jira create-epic --summary "User Auth Overhaul" --description "Migrate to OAuth 2.0"
    jira update PROJ-123 --priority Highest --labels "urgent"
    jira assign PROJ-123 "Jane Smith"
`;

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Atlassian CLI - Jira and Confluence operations

Usage:
  node atlassian-api.cjs jira <command> [args...]
  node atlassian-api.cjs confluence <command> [args...]

Run 'node atlassian-api.cjs jira help' for Jira commands.
`);
    process.exit(0);
  }

  let [service, command, ...params] = args;

  // === Desire Path Support ===
  // Make what agents naturally try actually work

  // Pattern 1: If first arg is a known Jira command, assume jira service
  const jiraCommands = ['get', 'get-issue', 'get-ticket', 'search', 'jql', 'create', 'create-epic', 'update', 'comment', 'assign', 'help', 'get-projects'];
  if (jiraCommands.includes(service)) {
    params = command ? [command, ...params] : params;
    command = service;
    service = 'jira';
  }

  // Pattern 2: If first arg looks like a ticket key (PROJ-123), assume "jira get"
  if (/^[A-Z]+-\d+$/.test(service)) {
    params = [service, command, ...params].filter(Boolean);
    command = 'get';
    service = 'jira';
  }

  (async () => {
    try {
      let result;

      if (service === 'jira') {
        switch (command) {
          case 'help':
            console.log(JIRA_HELP);
            process.exit(0);
            break;

          case 'get':        // alias - short form
          case 'get-issue':
          case 'get-ticket':  // alias - LLMs naturally try "get-ticket"
            result = await jira.getIssue(params[0]);
            break;

          case 'search':
          case 'jql': {
            const searchOpts = parseArgs(params.slice(1));
            result = await jira.searchJQL(params[0], {
              maxResults: searchOpts.limit ? parseInt(searchOpts.limit) : undefined,
            });
            break;
          }

          case 'get-projects':
            result = await jira.getProjects();
            break;

          case 'create': {
            const opts = parseArgs(params);
            const project = opts.project || 'PROJ';
            const type = opts.type;
            const summary = opts.summary;
            let description = opts.description || '';

            // Support --description-file to avoid shell escaping issues with ADF JSON
            if (opts['description-file']) {
              try {
                description = fs.readFileSync(opts['description-file'], 'utf8');
              } catch (e) {
                console.error(`ERROR: Could not read description file: ${e.message}`);
                process.exit(1);
              }
            }

            if (!type || !summary) {
              console.error('ERROR: --type and --summary are required');
              console.error('Run: node atlassian-api.cjs jira help');
              process.exit(1);
            }

            const createOpts = {};
            if (opts.labels) createOpts.labels = opts.labels.split(',').map(s => s.trim());
            if (opts.components) createOpts.components = opts.components.split(',').map(s => s.trim());
            if (opts.priority) createOpts.priority = opts.priority;
            if (opts.parent) createOpts.parent = { key: opts.parent };

            // Look up assignee if provided
            if (opts.assignee) {
              const accountId = await lookupUser(opts.assignee);
              if (accountId) {
                createOpts.assignee = { accountId };
              } else {
                console.error(`Warning: Could not find user "${opts.assignee}", creating without assignee`);
              }
            }

            result = await jira.createIssue(project, summary, description, type, createOpts);
            const ticketKey = result.key;
            const baseUrl = process.env.JIRA_BASE_URL || 'https://yourcompany.atlassian.net';

            // Auto-verify the ticket exists (anti-hallucination)
            try {
              const verification = await jira.getIssue(ticketKey);
              if (verification && verification.key === ticketKey) {
                console.log(`Created: ${ticketKey}`);
                console.log(`   URL: ${baseUrl}/browse/${ticketKey}`);
                console.log(`   Verified: Ticket exists`);
              } else {
                console.error(`Created ${ticketKey} but verification failed - ticket not found`);
                process.exit(1);
              }
            } catch (verifyErr) {
              console.error(`Created ${ticketKey} but verification failed: ${verifyErr.message}`);
              process.exit(1);
            }
            process.exit(0);
          }

          case 'create-epic': {
            const opts = parseArgs(params);
            const project = opts.project || 'PROJ';
            const summary = opts.summary;
            let description = opts.description || '';

            // Support --description-file to avoid shell escaping issues with ADF JSON
            if (opts['description-file']) {
              try {
                description = fs.readFileSync(opts['description-file'], 'utf8');
              } catch (e) {
                console.error(`ERROR: Could not read description file: ${e.message}`);
                process.exit(1);
              }
            }

            if (!summary) {
              console.error('ERROR: --summary is required');
              console.error('Run: node atlassian-api.cjs jira help');
              process.exit(1);
            }

            const createOpts = {};
            if (opts.labels) createOpts.labels = opts.labels.split(',').map(s => s.trim());
            if (opts.components) createOpts.components = opts.components.split(',').map(s => s.trim());
            if (opts.priority) createOpts.priority = opts.priority;
            if (opts['with-dr']) createOpts.forceDR = true;

            const epicResult = await jira.createEpicWithDR(project, summary, description, createOpts);

            console.log(`Created Epic: ${epicResult.epic}`);
            console.log(`   URL: ${epicResult.epicUrl}`);

            if (epicResult.hasDR) {
              console.log(`DR sections included (reason: ${epicResult.drReason})`);
              console.log(`\nNext steps:`);
              console.log(`   1. Engineer reviews DR sections with PM`);
              console.log(`   2. Answer: "What happens if this fails?"`);
              console.log(`   3. Fill in failure scenarios and recovery plan`);
            } else {
              console.log(`No DR sections (${epicResult.drReason})`);
              console.log(`   Use --with-dr flag to include DR planning sections`);
            }
            process.exit(0);
          }

          case 'update': {
            const issueKey = params[0];
            if (!issueKey) {
              console.error('ERROR: Issue key required');
              process.exit(1);
            }
            const opts = parseArgs(params.slice(1));
            const fields = {};

            if (opts.summary) fields.summary = opts.summary;
            if (opts['description-file']) {
              try {
                fields.description = fs.readFileSync(opts['description-file'], 'utf8');
              } catch (e) {
                console.error(`ERROR: Could not read description file: ${e.message}`);
                process.exit(1);
              }
            } else if (opts.description) {
              fields.description = opts.description;
            }
            if (opts.priority) fields.priority = { name: opts.priority };
            if (opts.labels) fields.labels = opts.labels.split(',').map(s => s.trim());

            if (opts.assignee) {
              const accountId = await lookupUser(opts.assignee);
              if (accountId) {
                fields.assignee = { accountId };
              } else {
                console.error(`Warning: Could not find user "${opts.assignee}"`);
              }
            }

            if (Object.keys(fields).length === 0) {
              console.error('ERROR: No fields to update');
              process.exit(1);
            }

            await jira.updateIssue(issueKey, fields);
            console.log(`Updated: ${issueKey}`);
            process.exit(0);
          }

          case 'comment': {
            const issueKey = params[0];
            const comment = params[1];
            if (!issueKey || !comment) {
              console.error('ERROR: Issue key and comment text required');
              console.error('Usage: jira comment PROJ-123 "Your comment here"');
              process.exit(1);
            }
            await jira.addComment(issueKey, comment);
            console.log(`Comment added to ${issueKey}`);
            process.exit(0);
          }

          case 'assign': {
            const issueKey = params[0];
            const assigneeName = params[1];
            if (!issueKey || !assigneeName) {
              console.error('ERROR: Issue key and assignee name required');
              console.error('Usage: jira assign PROJ-123 "Jane Smith"');
              process.exit(1);
            }
            const accountId = await lookupUser(assigneeName);
            if (!accountId) {
              console.error(`ERROR: Could not find user "${assigneeName}"`);
              process.exit(1);
            }
            await jira.updateIssue(issueKey, { assignee: { accountId } });
            console.log(`Assigned ${issueKey} to ${assigneeName}`);
            process.exit(0);
          }

          default:
            console.error(`Unknown jira command: ${command}`);
            console.error('Run: node atlassian-api.cjs jira help');
            process.exit(1);
        }
      } else if (service === 'confluence') {
        switch (command) {
          case 'get-page':
            result = await confluence.getPage(params[0]);
            break;
          case 'search':
            result = await confluence.searchCQL(params[0]);
            break;
          case 'get-spaces':
            result = await confluence.getSpaces();
            break;
          case 'create-page': {
            const opts = parseArgs(params);
            const spaceKey = opts.space;
            const title = opts.title;
            const content = opts.content || '';
            const parentId = opts.parent || null;

            if (!spaceKey || !title) {
              console.error('ERROR: --space and --title are required');
              console.error('Usage: confluence create-page --space TEAM --title "Page Title" [--content "<p>HTML</p>"] [--parent 123456]');
              process.exit(1);
            }

            result = await confluence.createPage(spaceKey, title, content, parentId);
            const pageId = result.id;
            const baseUrl = process.env.JIRA_BASE_URL || 'https://yourcompany.atlassian.net';

            // Auto-verify the page exists (anti-hallucination)
            try {
              const verification = await confluence.getPage(pageId);
              if (verification && verification.id === pageId) {
                console.log(`Created: ${result.title}`);
                console.log(`   ID: ${pageId}`);
                console.log(`   URL: ${baseUrl}/wiki${result._links?.webui || ''}`);
                console.log(`   Verified: Page exists`);
              } else {
                console.error(`Created page ${pageId} but verification failed - page not found`);
                process.exit(1);
              }
            } catch (verifyErr) {
              console.error(`Created page ${pageId} but verification failed: ${verifyErr.message}`);
              process.exit(1);
            }
            process.exit(0);
          }
          case 'update-page': {
            const pageId = params[0];
            if (!pageId) {
              console.error('ERROR: Page ID required');
              process.exit(1);
            }
            const opts = parseArgs(params.slice(1));

            // Get current page to get version
            const currentPage = await confluence.getPage(pageId);
            const currentVersion = currentPage.version?.number || 1;
            const title = opts.title || currentPage.title;
            const content = opts.content !== undefined ? opts.content : currentPage.body?.storage?.value || '';

            result = await confluence.updatePage(pageId, title, content, currentVersion);
            console.log(`Updated: ${result.title}`);
            console.log(`   Version: ${result.version?.number}`);
            process.exit(0);
          }
          default:
            console.error(`Unknown confluence command: ${command}`);
            process.exit(1);
        }
      } else {
        console.error(`Unknown service: ${service}. Use 'jira' or 'confluence'`);
        process.exit(1);
      }

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      if (error.body) {
        try {
          console.error('Details:', JSON.stringify(JSON.parse(error.body), null, 2));
        } catch { console.error('Details:', error.body); }
      }
      process.exit(1);
    }
  })();
}
