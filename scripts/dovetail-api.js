// PM AI Starter Kit - dovetail-api.js
// See scripts/README.md for setup
#!/usr/bin/env node
/**
 * Dovetail API - Comprehensive CLI for all Dovetail operations
 *
 * Usage:
 *   node dovetail-api.js <resource> <command> [args...]
 *
 * Resources:
 *   token      - Token operations
 *   projects   - Project management
 *   insights   - Insights management
 *   notes      - Notes management
 *   tags       - Tag operations
 *   highlights - Highlights management
 *   contacts   - Contact management
 *   channels   - Channel management
 *   data       - Data import/export
 *   search     - AI-powered search and summarization
 *   files      - File operations
 *
 * Examples:
 *   node dovetail-api.js token info
 *   node dovetail-api.js projects list
 *   node dovetail-api.js projects get PROJECT_ID
 *   node dovetail-api.js projects create '{"name":"My Project","description":"..."}'
 *   node dovetail-api.js insights list --project-id PROJECT_ID
 *   node dovetail-api.js insights create '{"title":"Insight","project_id":"..."}'
 *   node dovetail-api.js search query '{"query":"user feedback","project_id":"..."}'
 *   node dovetail-api.js search summarize '{"content":["text1","text2"],"length":"short"}'
 *
 * Environment Variables:
 *   DOVETAIL_API_TOKEN    - Your Dovetail API token (required)
 *   DOVETAIL_BASE_URL     - Base API URL (default: https://dovetail.com/api/v1)
 */

const { dovetail } = require('./lib/dovetail-client');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Dovetail API CLI - Comprehensive interface to Dovetail REST API

Usage: node dovetail-api.js <resource> <command> [args...]

RESOURCES:
  token          Token operations
  projects       Project management (CRUD + list)
  insights       Insights management (CRUD + list + import)
  notes          Notes management (CRUD + list + import/export)
  tags           Tag operations (list)
  highlights     Highlights management (list + get)
  contacts       Contact management (CRUD + list)
  channels       Channel management (create/update/delete + add data)
  data           Data import/export operations
  search         AI-powered search and summarization
  files          File operations (get)

TOKEN COMMANDS:
  node dovetail-api.js token info

PROJECT COMMANDS:
  node dovetail-api.js projects list [--limit N] [--offset N] [--sort FIELD:DIR]
  node dovetail-api.js projects get PROJECT_ID
  node dovetail-api.js projects create '{"name":"Project Name","description":"..."}'
  node dovetail-api.js projects update PROJECT_ID '{"name":"New Name"}'
  node dovetail-api.js projects delete PROJECT_ID

INSIGHT COMMANDS:
  node dovetail-api.js insights list [--project-id ID] [--limit N] [--offset N]
  node dovetail-api.js insights get INSIGHT_ID
  node dovetail-api.js insights create '{"title":"Title","description":"...","project_id":"..."}'
  node dovetail-api.js insights update INSIGHT_ID '{"title":"New Title"}'
  node dovetail-api.js insights delete INSIGHT_ID

NOTE COMMANDS:
  node dovetail-api.js notes list [--project-id ID] [--limit N] [--offset N]
  node dovetail-api.js notes get NOTE_ID
  node dovetail-api.js notes create '{"title":"Title","content":"...","project_id":"..."}'
  node dovetail-api.js notes update NOTE_ID '{"title":"New Title"}'
  node dovetail-api.js notes delete NOTE_ID

SEARCH COMMANDS (AI-Powered):
  node dovetail-api.js search query '{"query":"search terms","project_id":"..."}'
  node dovetail-api.js search summarize '{"content":["text1","text2"],"length":"short"}'

ENVIRONMENT:
  DOVETAIL_API_TOKEN    Your Dovetail API token (required)
  DOVETAIL_BASE_URL     Base API URL (default: https://dovetail.com/api/v1)

Get your API token from: Settings > Account > Personal API keys
`);
  process.exit(0);
}

// Parse flags into options object
function parseFlags(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2).replace(/-/g, '_');
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        options[key] = value;
        i++; // Skip next arg
      }
    }
  }
  return options;
}

// Main execution
const [resource, command, ...params] = args;

(async () => {
  try {
    let result;

    // ============ TOKEN ============
    if (resource === 'token') {
      switch (command) {
        case 'info':
          result = await dovetail.getTokenInfo();
          break;
        default:
          console.error(`Unknown token command: ${command}`);
          console.error('Available: info');
          process.exit(1);
      }
    }

    // ============ PROJECTS ============
    else if (resource === 'projects') {
      switch (command) {
        case 'list':
          const listOpts = parseFlags(params);
          result = await dovetail.listProjects(listOpts);
          break;
        case 'get':
          if (!params[0]) { console.error('Error: PROJECT_ID required'); process.exit(1); }
          result = await dovetail.getProject(params[0]);
          break;
        case 'create':
          if (!params[0]) { console.error('Error: Project data JSON required'); process.exit(1); }
          result = await dovetail.createProject(JSON.parse(params[0]));
          break;
        case 'update':
          if (!params[0] || !params[1]) { console.error('Error: PROJECT_ID and update data JSON required'); process.exit(1); }
          result = await dovetail.updateProject(params[0], JSON.parse(params[1]));
          break;
        case 'delete':
          if (!params[0]) { console.error('Error: PROJECT_ID required'); process.exit(1); }
          result = await dovetail.deleteProject(params[0]);
          break;
        default:
          console.error(`Unknown projects command: ${command}`);
          process.exit(1);
      }
    }

    // ============ INSIGHTS ============
    else if (resource === 'insights') {
      switch (command) {
        case 'list':
          const listOpts = parseFlags(params);
          result = await dovetail.listInsights(listOpts);
          break;
        case 'get':
          if (!params[0]) { console.error('Error: INSIGHT_ID required'); process.exit(1); }
          result = await dovetail.getInsight(params[0]);
          break;
        case 'create':
          if (!params[0]) { console.error('Error: Insight data JSON required'); process.exit(1); }
          result = await dovetail.createInsight(JSON.parse(params[0]));
          break;
        case 'update':
          if (!params[0] || !params[1]) { console.error('Error: INSIGHT_ID and update data JSON required'); process.exit(1); }
          result = await dovetail.updateInsight(params[0], JSON.parse(params[1]));
          break;
        case 'delete':
          if (!params[0]) { console.error('Error: INSIGHT_ID required'); process.exit(1); }
          result = await dovetail.deleteInsight(params[0]);
          break;
        default:
          console.error(`Unknown insights command: ${command}`);
          process.exit(1);
      }
    }

    // ============ NOTES ============
    else if (resource === 'notes') {
      switch (command) {
        case 'list':
          const listOpts = parseFlags(params);
          result = await dovetail.listNotes(listOpts);
          break;
        case 'get':
          if (!params[0]) { console.error('Error: NOTE_ID required'); process.exit(1); }
          result = await dovetail.getNote(params[0]);
          break;
        case 'create':
          if (!params[0]) { console.error('Error: Note data JSON required'); process.exit(1); }
          result = await dovetail.createNote(JSON.parse(params[0]));
          break;
        case 'update':
          if (!params[0] || !params[1]) { console.error('Error: NOTE_ID and update data JSON required'); process.exit(1); }
          result = await dovetail.updateNote(params[0], JSON.parse(params[1]));
          break;
        case 'delete':
          if (!params[0]) { console.error('Error: NOTE_ID required'); process.exit(1); }
          result = await dovetail.deleteNote(params[0]);
          break;
        case 'export':
          const exportOpts = parseFlags(params);
          result = await dovetail.exportNotes(exportOpts);
          break;
        default:
          console.error(`Unknown notes command: ${command}`);
          process.exit(1);
      }
    }

    // ============ TAGS ============
    else if (resource === 'tags') {
      switch (command) {
        case 'list':
          const listOpts = parseFlags(params);
          result = await dovetail.listTags(listOpts);
          break;
        default:
          console.error(`Unknown tags command: ${command}`);
          process.exit(1);
      }
    }

    // ============ HIGHLIGHTS ============
    else if (resource === 'highlights') {
      switch (command) {
        case 'list':
          const listOpts = parseFlags(params);
          result = await dovetail.listHighlights(listOpts);
          break;
        case 'get':
          if (!params[0]) { console.error('Error: HIGHLIGHT_ID required'); process.exit(1); }
          result = await dovetail.getHighlight(params[0]);
          break;
        default:
          console.error(`Unknown highlights command: ${command}`);
          process.exit(1);
      }
    }

    // ============ CONTACTS ============
    else if (resource === 'contacts') {
      switch (command) {
        case 'list':
          const listOpts = parseFlags(params);
          result = await dovetail.listContacts(listOpts);
          break;
        case 'get':
          if (!params[0]) { console.error('Error: CONTACT_ID required'); process.exit(1); }
          result = await dovetail.getContact(params[0]);
          break;
        case 'create':
          if (!params[0]) { console.error('Error: Contact data JSON required'); process.exit(1); }
          result = await dovetail.createContact(JSON.parse(params[0]));
          break;
        case 'update':
          if (!params[0] || !params[1]) { console.error('Error: CONTACT_ID and update data JSON required'); process.exit(1); }
          result = await dovetail.updateContact(params[0], JSON.parse(params[1]));
          break;
        case 'delete':
          if (!params[0]) { console.error('Error: CONTACT_ID required'); process.exit(1); }
          result = await dovetail.deleteContact(params[0]);
          break;
        default:
          console.error(`Unknown contacts command: ${command}`);
          process.exit(1);
      }
    }

    // ============ CHANNELS ============
    else if (resource === 'channels') {
      switch (command) {
        case 'create':
          if (!params[0]) { console.error('Error: Channel data JSON required'); process.exit(1); }
          result = await dovetail.createChannel(JSON.parse(params[0]));
          break;
        case 'update':
          if (!params[0] || !params[1]) { console.error('Error: CHANNEL_ID and update data JSON required'); process.exit(1); }
          result = await dovetail.updateChannel(params[0], JSON.parse(params[1]));
          break;
        case 'delete':
          if (!params[0]) { console.error('Error: CHANNEL_ID required'); process.exit(1); }
          result = await dovetail.deleteChannel(params[0]);
          break;
        case 'add-data':
          if (!params[0] || !params[1]) { console.error('Error: CHANNEL_ID and data JSON required'); process.exit(1); }
          result = await dovetail.addDataToChannel(params[0], JSON.parse(params[1]));
          break;
        default:
          console.error(`Unknown channels command: ${command}`);
          process.exit(1);
      }
    }

    // ============ DATA ============
    else if (resource === 'data') {
      switch (command) {
        case 'export':
          const exportOpts = parseFlags(params);
          result = await dovetail.exportData(exportOpts);
          break;
        case 'import':
          if (!params[0] || !params[1]) { console.error('Error: PROJECT_ID and FILE_DATA required'); process.exit(1); }
          result = await dovetail.importData(params[0], JSON.parse(params[1]));
          break;
        default:
          console.error(`Unknown data command: ${command}`);
          process.exit(1);
      }
    }

    // ============ SEARCH ============
    else if (resource === 'search') {
      switch (command) {
        case 'query':
          if (!params[0]) { console.error('Error: Search query JSON required'); process.exit(1); }
          result = await dovetail.search(JSON.parse(params[0]));
          break;
        case 'summarize':
          if (!params[0]) { console.error('Error: Summarization data JSON required'); process.exit(1); }
          result = await dovetail.summarize(JSON.parse(params[0]));
          break;
        default:
          console.error(`Unknown search command: ${command}`);
          process.exit(1);
      }
    }

    // ============ FILES ============
    else if (resource === 'files') {
      switch (command) {
        case 'get':
          if (!params[0]) { console.error('Error: FILE_ID required'); process.exit(1); }
          result = await dovetail.getFile(params[0]);
          break;
        default:
          console.error(`Unknown files command: ${command}`);
          process.exit(1);
      }
    }

    // ============ UNKNOWN RESOURCE ============
    else {
      console.error(`Unknown resource: ${resource}`);
      console.error('Available resources: token, projects, insights, notes, tags, highlights, contacts, channels, data, search, files');
      process.exit(1);
    }

    // Output result
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.statusCode === 429) {
      console.error(`Rate limited. Retry after ${error.retryAfter} seconds`);
    }
    if (error.body) {
      try {
        const errorBody = JSON.parse(error.body);
        console.error('Response:', JSON.stringify(errorBody, null, 2));
      } catch {
        console.error('Response:', error.body);
      }
    }
    process.exit(1);
  }
})();
