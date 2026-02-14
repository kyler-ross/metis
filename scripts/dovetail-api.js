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
const { run } = require('./lib/script-runner.cjs');

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

run({
  name: 'dovetail-api',
  mode: 'operational',
  services: ['dovetail'],
}, async (ctx) => {
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
    → Get current token information

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
  node dovetail-api.js insights import PROJECT_ID FILE_DATA

NOTE COMMANDS:
  node dovetail-api.js notes list [--project-id ID] [--limit N] [--offset N]
  node dovetail-api.js notes get NOTE_ID
  node dovetail-api.js notes create '{"title":"Title","content":"...","project_id":"..."}'
  node dovetail-api.js notes update NOTE_ID '{"title":"New Title"}'
  node dovetail-api.js notes delete NOTE_ID
  node dovetail-api.js notes export [--project-id ID] [--format csv]
  node dovetail-api.js notes import PROJECT_ID FILE_DATA

TAG COMMANDS:
  node dovetail-api.js tags list [--project-id ID]

HIGHLIGHT COMMANDS:
  node dovetail-api.js highlights list [--project-id ID] [--note-id ID] [--limit N]
  node dovetail-api.js highlights get HIGHLIGHT_ID

CONTACT COMMANDS:
  node dovetail-api.js contacts list [--limit N] [--offset N]
  node dovetail-api.js contacts get CONTACT_ID
  node dovetail-api.js contacts create '{"name":"Name","email":"...","company":"..."}'
  node dovetail-api.js contacts update CONTACT_ID '{"name":"New Name"}'
  node dovetail-api.js contacts delete CONTACT_ID

CHANNEL COMMANDS:
  node dovetail-api.js channels create '{"name":"Channel","project_id":"..."}'
  node dovetail-api.js channels update CHANNEL_ID '{"name":"New Name"}'
  node dovetail-api.js channels delete CHANNEL_ID
  node dovetail-api.js channels add-data CHANNEL_ID '{"..."}'

DATA COMMANDS:
  node dovetail-api.js data export [--project-id ID] [--format FORMAT]
  node dovetail-api.js data import PROJECT_ID FILE_DATA

SEARCH COMMANDS (AI-Powered):
  node dovetail-api.js search query '{"query":"search terms","project_id":"..."}'
  node dovetail-api.js search summarize '{"content":["text1","text2"],"length":"short"}'

FILE COMMANDS:
  node dovetail-api.js files get FILE_ID

OPTIONS:
  --limit N         Maximum number of results
  --offset N        Starting position for pagination
  --sort FIELD:DIR  Sort field and direction (e.g., created_at:desc)
  --project-id ID   Filter by project ID
  --note-id ID      Filter by note ID
  --format FORMAT   Export/import format (csv, json, etc.)

ENVIRONMENT:
  DOVETAIL_API_TOKEN    Your Dovetail API token (required)
  DOVETAIL_BASE_URL     Base API URL (default: https://dovetail.com/api/v1)

Get your API token from: Settings → Account → Personal API keys
`);
    return;
  }

  // Main execution
  const [resource, command, ...params] = args;

  let result;

  // ============ TOKEN ============
  if (resource === 'token') {
    switch (command) {
      case 'info':
        result = await dovetail.getTokenInfo();
        break;
      default:
        throw new Error(`Unknown token command: ${command}. Available: info`);
    }
  }

  // ============ PROJECTS ============
  else if (resource === 'projects') {
    switch (command) {
      case 'list':
        const projListOpts = parseFlags(params);
        result = await dovetail.listProjects(projListOpts);
        break;
      case 'get':
        if (!params[0]) {
          throw new Error('PROJECT_ID required');
        }
        result = await dovetail.getProject(params[0]);
        break;
      case 'create':
        if (!params[0]) {
          throw new Error('Project data JSON required');
        }
        result = await dovetail.createProject(JSON.parse(params[0]));
        break;
      case 'update':
        if (!params[0] || !params[1]) {
          throw new Error('PROJECT_ID and update data JSON required');
        }
        result = await dovetail.updateProject(params[0], JSON.parse(params[1]));
        break;
      case 'delete':
        if (!params[0]) {
          throw new Error('PROJECT_ID required');
        }
        result = await dovetail.deleteProject(params[0]);
        break;
      default:
        throw new Error(`Unknown projects command: ${command}. Available: list, get, create, update, delete`);
    }
  }

  // ============ INSIGHTS ============
  else if (resource === 'insights') {
    switch (command) {
      case 'list':
        const insListOpts = parseFlags(params);
        result = await dovetail.listInsights(insListOpts);
        break;
      case 'get':
        if (!params[0]) {
          throw new Error('INSIGHT_ID required');
        }
        result = await dovetail.getInsight(params[0]);
        break;
      case 'create':
        if (!params[0]) {
          throw new Error('Insight data JSON required');
        }
        result = await dovetail.createInsight(JSON.parse(params[0]));
        break;
      case 'update':
        if (!params[0] || !params[1]) {
          throw new Error('INSIGHT_ID and update data JSON required');
        }
        result = await dovetail.updateInsight(params[0], JSON.parse(params[1]));
        break;
      case 'delete':
        if (!params[0]) {
          throw new Error('INSIGHT_ID required');
        }
        result = await dovetail.deleteInsight(params[0]);
        break;
      case 'import':
        if (!params[0] || !params[1]) {
          throw new Error('PROJECT_ID and FILE_DATA required');
        }
        result = await dovetail.importInsights(params[0], JSON.parse(params[1]));
        break;
      default:
        throw new Error(`Unknown insights command: ${command}. Available: list, get, create, update, delete, import`);
    }
  }

  // ============ NOTES ============
  else if (resource === 'notes') {
    switch (command) {
      case 'list':
        const noteListOpts = parseFlags(params);
        result = await dovetail.listNotes(noteListOpts);
        break;
      case 'get':
        if (!params[0]) {
          throw new Error('NOTE_ID required');
        }
        result = await dovetail.getNote(params[0]);
        break;
      case 'create':
        if (!params[0]) {
          throw new Error('Note data JSON required');
        }
        result = await dovetail.createNote(JSON.parse(params[0]));
        break;
      case 'update':
        if (!params[0] || !params[1]) {
          throw new Error('NOTE_ID and update data JSON required');
        }
        result = await dovetail.updateNote(params[0], JSON.parse(params[1]));
        break;
      case 'delete':
        if (!params[0]) {
          throw new Error('NOTE_ID required');
        }
        result = await dovetail.deleteNote(params[0]);
        break;
      case 'export':
        const exportOpts = parseFlags(params);
        result = await dovetail.exportNotes(exportOpts);
        break;
      case 'import':
        if (!params[0] || !params[1]) {
          throw new Error('PROJECT_ID and FILE_DATA required');
        }
        result = await dovetail.importNotes(params[0], JSON.parse(params[1]));
        break;
      default:
        throw new Error(`Unknown notes command: ${command}. Available: list, get, create, update, delete, export, import`);
    }
  }

  // ============ TAGS ============
  else if (resource === 'tags') {
    switch (command) {
      case 'list':
        const tagListOpts = parseFlags(params);
        result = await dovetail.listTags(tagListOpts);
        break;
      default:
        throw new Error(`Unknown tags command: ${command}. Available: list`);
    }
  }

  // ============ HIGHLIGHTS ============
  else if (resource === 'highlights') {
    switch (command) {
      case 'list':
        const hlListOpts = parseFlags(params);
        result = await dovetail.listHighlights(hlListOpts);
        break;
      case 'get':
        if (!params[0]) {
          throw new Error('HIGHLIGHT_ID required');
        }
        result = await dovetail.getHighlight(params[0]);
        break;
      default:
        throw new Error(`Unknown highlights command: ${command}. Available: list, get`);
    }
  }

  // ============ CONTACTS ============
  else if (resource === 'contacts') {
    switch (command) {
      case 'list':
        const ctListOpts = parseFlags(params);
        result = await dovetail.listContacts(ctListOpts);
        break;
      case 'get':
        if (!params[0]) {
          throw new Error('CONTACT_ID required');
        }
        result = await dovetail.getContact(params[0]);
        break;
      case 'create':
        if (!params[0]) {
          throw new Error('Contact data JSON required');
        }
        result = await dovetail.createContact(JSON.parse(params[0]));
        break;
      case 'update':
        if (!params[0] || !params[1]) {
          throw new Error('CONTACT_ID and update data JSON required');
        }
        result = await dovetail.updateContact(params[0], JSON.parse(params[1]));
        break;
      case 'delete':
        if (!params[0]) {
          throw new Error('CONTACT_ID required');
        }
        result = await dovetail.deleteContact(params[0]);
        break;
      default:
        throw new Error(`Unknown contacts command: ${command}. Available: list, get, create, update, delete`);
    }
  }

  // ============ CHANNELS ============
  else if (resource === 'channels') {
    switch (command) {
      case 'create':
        if (!params[0]) {
          throw new Error('Channel data JSON required');
        }
        result = await dovetail.createChannel(JSON.parse(params[0]));
        break;
      case 'update':
        if (!params[0] || !params[1]) {
          throw new Error('CHANNEL_ID and update data JSON required');
        }
        result = await dovetail.updateChannel(params[0], JSON.parse(params[1]));
        break;
      case 'delete':
        if (!params[0]) {
          throw new Error('CHANNEL_ID required');
        }
        result = await dovetail.deleteChannel(params[0]);
        break;
      case 'add-data':
        if (!params[0] || !params[1]) {
          throw new Error('CHANNEL_ID and data JSON required');
        }
        result = await dovetail.addDataToChannel(params[0], JSON.parse(params[1]));
        break;
      default:
        throw new Error(`Unknown channels command: ${command}. Available: create, update, delete, add-data`);
    }
  }

  // ============ DATA ============
  else if (resource === 'data') {
    switch (command) {
      case 'export':
        const dataExportOpts = parseFlags(params);
        result = await dovetail.exportData(dataExportOpts);
        break;
      case 'import':
        if (!params[0] || !params[1]) {
          throw new Error('PROJECT_ID and FILE_DATA required');
        }
        result = await dovetail.importData(params[0], JSON.parse(params[1]));
        break;
      default:
        throw new Error(`Unknown data command: ${command}. Available: export, import`);
    }
  }

  // ============ SEARCH ============
  else if (resource === 'search') {
    switch (command) {
      case 'query':
        if (!params[0]) {
          throw new Error('Search query JSON required');
        }
        result = await dovetail.search(JSON.parse(params[0]));
        break;
      case 'summarize':
        if (!params[0]) {
          throw new Error('Summarization data JSON required');
        }
        result = await dovetail.summarize(JSON.parse(params[0]));
        break;
      default:
        throw new Error(`Unknown search command: ${command}. Available: query, summarize`);
    }
  }

  // ============ FILES ============
  else if (resource === 'files') {
    switch (command) {
      case 'get':
        if (!params[0]) {
          throw new Error('FILE_ID required');
        }
        result = await dovetail.getFile(params[0]);
        break;
      default:
        throw new Error(`Unknown files command: ${command}. Available: get`);
    }
  }

  // ============ UNKNOWN RESOURCE ============
  else {
    throw new Error(`Unknown resource: ${resource}. Available resources: token, projects, insights, notes, tags, highlights, contacts, channels, data, search, files`);
  }

  // Output result
  console.log(JSON.stringify(result, null, 2));
});
