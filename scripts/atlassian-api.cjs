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
const { formatOutput, formatError } = require('./lib/output-formatter');
const { run } = require('./lib/script-runner.cjs');

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

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'yourcompany.atlassian.net',
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
        --project <key>      Project key (default: ALL)
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
        --project <key>      Project key (default: ALL)
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
        jira update ALL-123 --summary "New title"
        jira update ALL-123 --assignee "Trung Phan"
        jira update ALL-123 --labels "urgent,backend"

    jira comment <key> "<comment>"    Add a comment
    jira assign <key> "<name>"        Assign to user

  Examples:
    jira create --type Bug --summary "Login broken" --description "Users cannot log in" --priority High
    jira create --type Task --summary "Update docs" --description "..." --labels "docs,low-priority"
    jira create-epic --summary "User Auth Overhaul" --description "Migrate to OAuth 2.0"
    jira update ALL-123 --priority Highest --labels "urgent"
    jira assign ALL-123 "Trung Phan"
`;

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);

  let [service, command, ...params] = args;

  // === Desire Path Support ===
  // Make what agents naturally try actually work

  // Pattern 1: If first arg is a known Jira command, assume jira service
  // e.g., "search 'query'" → "jira search 'query'"
  const jiraCommands = ['get', 'get-issue', 'get-ticket', 'search', 'jql', 'create', 'create-epic', 'update', 'comment', 'assign', 'help', 'get-projects'];
  if (service && jiraCommands.includes(service)) {
    params = command ? [command, ...params] : params;
    command = service;
    service = 'jira';
  }

  // Pattern 2: If first arg looks like a ticket key (ALL-123), assume "jira get"
  // e.g., "ALL-123" → "jira get ALL-123"
  if (service && /^[A-Z]+-\d+$/.test(service)) {
    params = [service, command, ...params].filter(Boolean);
    command = 'get';
    service = 'jira';
  }

  run({
    name: 'atlassian-api',
    mode: 'operational',
    services: ['jira'],
  }, async (ctx) => {
    if (args.length === 0) {
      console.log(`
Atlassian CLI - Jira and Confluence operations

Usage:
  node atlassian-api.cjs jira <command> [args...]
  node atlassian-api.cjs confluence <command> [args...]

Run 'node atlassian-api.cjs jira help' for Jira commands.
`);
      return;
    }

    let result;

    if (service === 'jira') {
        switch (command) {
          case 'help':
            console.log(JIRA_HELP);
            return;

          case 'get':        // alias - short form
          case 'get-issue':
          case 'get-ticket':  // alias - LLMs naturally try "get-ticket"
            result = await jira.getIssue(params[0]);
            break;

          case 'search':
          case 'jql': { // alias - agents naturally think "jql" for JQL queries
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
            const project = opts.project || 'ALL';
            const type = opts.type;
            const summary = opts.summary;
            let description = opts.description || '';

            // Support --description-file to avoid shell escaping issues with ADF JSON
            if (opts['description-file']) {
              try {
                description = fs.readFileSync(opts['description-file'], 'utf8');
              } catch (e) {
                throw new Error(`Could not read description file: ${e.message}`);
              }
            }

            if (!type || !summary) {
              throw new Error('--type and --summary are required. Run: node atlassian-api.cjs jira help');
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

            // Auto-verify the ticket exists (anti-hallucination)
            try {
              const verification = await jira.getIssue(ticketKey);
              if (verification && verification.key === ticketKey) {
                console.log(`Created: ${ticketKey}`);
                console.log(`   URL: https://yourcompany.atlassian.net/browse/${ticketKey}`);
                console.log(`   Verified: Ticket exists`);
              } else {
                throw new Error(`Created ${ticketKey} but verification failed - ticket not found`);
              }
            } catch (verifyErr) {
              if (verifyErr.message.includes('verification failed')) throw verifyErr;
              throw new Error(`Created ${ticketKey} but verification failed: ${verifyErr.message}`);
            }
            return;
          }

          case 'create-epic': {
            const opts = parseArgs(params);
            const project = opts.project || 'ALL';
            const summary = opts.summary;
            let description = opts.description || '';

            // Support --description-file to avoid shell escaping issues with ADF JSON
            if (opts['description-file']) {
              try {
                description = fs.readFileSync(opts['description-file'], 'utf8');
              } catch (e) {
                throw new Error(`Could not read description file: ${e.message}`);
              }
            }

            if (!summary) {
              throw new Error('--summary is required. Run: node atlassian-api.cjs jira help');
            }

            const createOpts = {};
            if (opts.labels) createOpts.labels = opts.labels.split(',').map(s => s.trim());
            if (opts.components) createOpts.components = opts.components.split(',').map(s => s.trim());
            if (opts.priority) createOpts.priority = opts.priority;
            // Support --with-dr flag to force DR ticket creation
            if (opts['with-dr']) createOpts.forceDR = true;

            // Create epic (DR ticket is conditional based on labels/components or --with-dr)
            // Note: createEpicWithDR handles its own rollback on failure, so we trust its return value
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
            return;
          }

          case 'update': {
            const issueKey = params[0];
            if (!issueKey) {
              throw new Error('Issue key required');
            }
            const opts = parseArgs(params.slice(1));
            const fields = {};

            if (opts.summary) fields.summary = opts.summary;
            // Support --description-file to avoid shell escaping issues with ADF JSON
            if (opts['description-file']) {
              try {
                fields.description = fs.readFileSync(opts['description-file'], 'utf8');
              } catch (e) {
                throw new Error(`Could not read description file: ${e.message}`);
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
              throw new Error('No fields to update');
            }

            await jira.updateIssue(issueKey, fields);
            console.log(`Updated: ${issueKey}`);
            return;
          }

          case 'comment': {
            const issueKey = params[0];
            const comment = params[1];
            if (!issueKey || !comment) {
              throw new Error('Issue key and comment text required. Usage: jira comment ALL-123 "Your comment here"');
            }
            await jira.addComment(issueKey, comment);
            console.log(`Comment added to ${issueKey}`);
            return;
          }

          case 'assign': {
            const issueKey = params[0];
            const assigneeName = params[1];
            if (!issueKey || !assigneeName) {
              throw new Error('Issue key and assignee name required. Usage: jira assign ALL-123 "Trung Phan"');
            }
            const accountId = await lookupUser(assigneeName);
            if (!accountId) {
              throw new Error(`Could not find user "${assigneeName}"`);
            }
            await jira.updateIssue(issueKey, { assignee: { accountId } });
            console.log(`Assigned ${issueKey} to ${assigneeName}`);
            return;
          }

          default:
            throw new Error(`Unknown jira command: ${command}. Run: node atlassian-api.cjs jira help`);
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
              throw new Error('--space and --title are required. Usage: confluence create-page --space CPET --title "Page Title" [--content "<p>HTML</p>"] [--parent 123456]');
            }

            result = await confluence.createPage(spaceKey, title, content, parentId);
            const pageId = result.id;

            // Auto-verify the page exists (anti-hallucination)
            try {
              const verification = await confluence.getPage(pageId);
              if (verification && verification.id === pageId) {
                console.log(`Created: ${result.title}`);
                console.log(`   ID: ${pageId}`);
                console.log(`   URL: https://yourcompany.atlassian.net/wiki${result._links?.webui || ''}`);
                console.log(`   Verified: Page exists`);
              } else {
                throw new Error(`Created page ${pageId} but verification failed - page not found`);
              }
            } catch (verifyErr) {
              if (verifyErr.message.includes('verification failed')) throw verifyErr;
              throw new Error(`Created page ${pageId} but verification failed: ${verifyErr.message}`);
            }
            return;
          }
          case 'update-page': {
            const pageId = params[0];
            if (!pageId) {
              throw new Error('Page ID required');
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
            return;
          }
          default:
            throw new Error(`Unknown confluence command: ${command}`);
        }
      } else {
        throw new Error(`Unknown service: ${service}. Use 'jira' or 'confluence'`);
      }

      console.log(formatOutput(result));
    });
}
