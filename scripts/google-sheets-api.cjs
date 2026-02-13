// PM AI Starter Kit - google-sheets-api.cjs
#!/usr/bin/env node
/**
 * Google Sheets API - CLI for read/write operations via OAuth2
 *
 * This is a thin CLI layer. Business logic is in:
 *   - ./lib/sheets-client.cjs (read/write/tab operations)
 *   - ./lib/sheets-formatting.cjs (formatting, borders, tables)
 *   - ./lib/sheets-validation.cjs (helpers, color parsing)
 *
 * Usage:
 *   node google-sheets-api.cjs whoami
 *   node google-sheets-api.cjs read SHEET_ID "Range"
 *   node google-sheets-api.cjs write SHEET_ID "Range" "value"
 *   node google-sheets-api.cjs --help
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { google } = require('googleapis');

// Import from modular libraries
const sheetsClient = require('./lib/sheets-client.cjs');
const sheetsFormatting = require('./lib/sheets-formatting.cjs');
const { columnToLetter, getSheetIdByName, parseColor } = require('./lib/sheets-validation.cjs');
const { getAuthClient } = require('./lib/google-auth.cjs');

// Check credentials early
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
------------------------------------------------------------
Google Sheets Authentication Failed

Missing: GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET

Quick fix options:

  1. Add to scripts/.env:
     GOOGLE_CLIENT_ID=your-client-id
     GOOGLE_CLIENT_SECRET=your-client-secret

  2. Get credentials:
     https://console.cloud.google.com/apis/credentials

------------------------------------------------------------
`);
  process.exit(1);
}

/**
 * Read JSON from stdin if available (for heredoc/pipe support)
 */
async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }

    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data.trim() || null);
    });

    setTimeout(() => {
      if (!data) resolve(null);
    }, 100);
  });
}

/**
 * Display help text
 */
function showHelp() {
  console.log(`
Google Sheets API - CLI for read/write operations

Usage:
  node google-sheets-api.cjs <command> <spreadsheet_id> [args...] [options]

Commands:
  create    <title> [tab] [data_json]       Create a new spreadsheet (with optional data)
  read      <id> <range>                    Read values from a range
  read-range <id> <tab> <range>             Read values (avoids ! escaping issues)
  read-cell  <id> <tab> <row> <col>         Read single cell (0-indexed row/col)
  read-rows  <id> <tab> <start> <end> [cols]  Read row range (0-indexed)
  read-meta <id> <range>                    Read values + formatting + merged cells
  write     <id> <range> <value>            Write a single value (SLOW - prefer batch cmds)
  update    <id> <range> <json>             Update a range with 2D array JSON (FAST)
  update-range <id> <tab> <range> <json>    Update range (avoids ! escaping issues)
  update-formatted <id> <tab> <row> <col> <json>  Write with formatting
  append    <id> <range> <json>             Append rows to a range
  append-range <id> <tab> <range> <json>    Append rows (avoids ! escaping issues)
  info      <id>                            Get spreadsheet metadata
  create-tab <id> <name> [index]            Create a new tab
  delete-tab <id> <tab_id>                  Delete a tab by ID
  copy-tab  <id> <tab_id> [dest_id]         Copy tab within or to another sheet
  rename-tab <id> <old_name> <new_name>     Rename a tab
  merge     <id> <tab> <r1> <c1> <r2> <c2>  Merge cells in range (0-indexed, end exclusive)
  unmerge   <id> <tab> <r1> <c1> <r2> <c2>  Unmerge cells in range
  apply-format <id> <tab> <r1> <c1> <r2> <c2> <json>  Apply formatting to range (no value change)
  clear-format <id> <tab> <r1> <c1> <r2> <c2>  Reset formatting to default
  write-table <id> <tab> <row> <col> <json>  Write table with headers, data, formatting in ONE call
  delete-rows <id> <tab> <start> <end>      Delete rows (0-indexed, end exclusive)
  delete-cols <id> <tab> <start> <end>      Delete columns (0-indexed, end exclusive)
  insert-rows <id> <tab> <row> <count>      Insert rows before specified row
  clear       <id> <range>                  Clear cell values (keeps formatting)
  clear-all   <id> <tab> <r1> <c1> <r2> <c2>  Clear values AND formatting
  set-border <id> <tab> <r1> <c1> <r2> <c2> [json]  Set cell borders
  set-validation <id> <tab> <r1> <c1> <r2> <c2> <json>  Set data validation (dropdown, etc.)
  clear-validation <id> <tab> <r1> <c1> <r2> <c2>  Remove data validation
  merge-rows <id> <tab> <rows_json> [cols]   Batch merge A:E for multiple rows at once
  format-rows <id> <tab> <config_json>       Batch apply formatting to multiple row ranges
  whoami                                     Show authenticated Google account

Fast Batch Commands (3-4x faster than multiple 'write' calls):
  write-cells <id> <tab> <json>             Write multiple cells in ONE API call
  write-row   <id> <tab> <row> <col> <json> Write a row of values in ONE call
  write-col   <id> <tab> <row> <col> <json> Write a column of values in ONE call
  batch-update <id> <json>                  Write multiple ranges in ONE call
  batch-format <id> <tab> <json>            Apply multiple format operations in ONE call
  batch-merge <id> <tab> <json> [opts]      Merge multiple ranges with safety checks

Options:
  --raw     Use RAW input mode (prevents formula/+ prefix interpretation)
  --help    Show this help message

Examples:
  # Create new spreadsheet
  node google-sheets-api.cjs create "My Report"
  node google-sheets-api.cjs create "Team Directory" "Team" '[["Name","Role"],["Alice","PM"]]'

  # Basic read/write
  node google-sheets-api.cjs read 1abc123 "Sheet1!A1:B10"
  node google-sheets-api.cjs write 1abc123 "Sheet1!B16" "0.45"
  node google-sheets-api.cjs update 1abc123 "Sheet1!A1:B2" '[["a","b"],["c","d"]]'

  # Prevent + from being interpreted as formula
  node google-sheets-api.cjs update 1abc123 "Sheet1!A1" '[["+1 (555) 123-4567"]]' --raw

  # FAST batch writes (3-4x faster than multiple 'write' calls)
  node google-sheets-api.cjs write-cells 1abc123 "Sheet1" '[{"cell":"A1","value":"foo"}]'
  node google-sheets-api.cjs write-row 1abc123 "Sheet1" 0 0 '["Name","Email","Phone"]'
  node google-sheets-api.cjs write-col 1abc123 "Sheet1" 0 3 '["Q1","Q2","Q3","Q4"]'

First run will open browser for OAuth authorization.
`);
}

async function main() {
  const stdinData = await readStdin();
  const args = process.argv.slice(2);

  // Parse flags
  const flags = {
    raw: args.includes('--raw'),
    help: args.includes('--help') || args.includes('-h')
  };

  // Remove flags from args
  const filteredArgs = args.filter(a => !a.startsWith('--') && !a.startsWith('-h'));

  // Sanitize shell escaping artifacts
  const sanitizedArgs = filteredArgs.map(arg => {
    if (typeof arg === 'string') {
      return arg.replace(/\\!/g, '!').replace(/\\\$/g, '$');
    }
    return arg;
  });

  const [command, spreadsheetId, ...rest] = sanitizedArgs;

  if (!command || flags.help) {
    showHelp();
    process.exit(0);
  }

  // Commands that don't require spreadsheet_id
  const noSheetCommands = ['whoami', 'help'];

  if (!spreadsheetId && !noSheetCommands.includes(command)) {
    console.error('ERROR: spreadsheet_id is required');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'help': {
        showHelp();
        break;
      }

      case 'whoami': {
        const auth = await getAuthClient();
        const oauth2 = google.oauth2({ version: 'v2', auth });
        const userInfo = await oauth2.userinfo.get();
        console.log('\nAuthenticated Google Account:\n');
        console.log(`Email: ${userInfo.data.email}`);
        console.log(`Name: ${userInfo.data.name || 'N/A'}`);
        console.log(`\nTo grant this account edit access to your spreadsheet:`);
        console.log(`1. Open the spreadsheet in Google Sheets`);
        console.log(`2. Click "Share" (top right)`);
        console.log(`3. Add: ${userInfo.data.email}`);
        console.log(`4. Set permission to "Editor"`);
        console.log(`5. Click "Send"\n`);
        break;
      }

      case 'create': {
        const title = spreadsheetId; // Parser puts title in spreadsheetId slot
        const [tabNameOrData, maybeData] = rest;
        if (!title) {
          console.error('ERROR: title is required');
          console.error('Usage: create <title> [tabName] [data_json]');
          process.exit(1);
        }

        let tabName = 'Sheet1';
        let initialData = null;

        if (tabNameOrData) {
          if (tabNameOrData.startsWith('[')) {
            initialData = JSON.parse(tabNameOrData);
          } else {
            tabName = tabNameOrData;
            if (maybeData) initialData = JSON.parse(maybeData);
          }
        }

        const result = await sheetsClient.createSpreadsheet(title, tabName, initialData);
        console.log(`Created: ${title}`);
        console.log(`ID: ${result.spreadsheetId}`);
        console.log(`URL: ${result.spreadsheetUrl}`);
        if (initialData) console.log(`Data: ${initialData.length} rows written`);
        break;
      }

      case 'read': {
        const [range] = rest;
        if (!range) {
          console.error('ERROR: range is required for read command');
          process.exit(1);
        }
        const values = await sheetsClient.getValues(spreadsheetId, range);
        console.log(JSON.stringify(values, null, 2));
        break;
      }

      case 'read-range': {
        const [tabName, range] = rest;
        if (!tabName || !range) {
          console.error('ERROR: tab name and range required');
          console.error('Usage: read-range <id> <tab_name> <range>');
          process.exit(1);
        }
        const fullRange = `${tabName}!${range}`;
        const values = await sheetsClient.getValues(spreadsheetId, fullRange);
        console.log(JSON.stringify(values, null, 2));
        break;
      }

      case 'read-cell': {
        const [tabName, row, col] = rest;
        if (!tabName || row === undefined || col === undefined) {
          console.error('ERROR: tab name, row, and col required');
          console.error('Usage: read-cell <id> <tab_name> <row> <col>');
          process.exit(1);
        }
        const colLetter = columnToLetter(parseInt(col));
        const rowNum = parseInt(row) + 1;
        const fullRange = `${tabName}!${colLetter}${rowNum}`;
        const values = await sheetsClient.getValues(spreadsheetId, fullRange);
        console.log(JSON.stringify(values?.[0]?.[0] ?? null));
        break;
      }

      case 'read-rows': {
        const [tabName, startRow, endRow, cols] = rest;
        if (!tabName || startRow === undefined || endRow === undefined) {
          console.error('ERROR: tab name, start row, and end row required');
          console.error('Usage: read-rows <id> <tab_name> <start_row> <end_row> [A:Z]');
          process.exit(1);
        }
        const colRange = cols || 'A:Z';
        const [startCol, endCol] = colRange.split(':');
        const startRowNum = parseInt(startRow) + 1;
        const endRowNum = parseInt(endRow) + 1;
        const fullRange = `${tabName}!${startCol}${startRowNum}:${endCol}${endRowNum}`;
        const values = await sheetsClient.getValues(spreadsheetId, fullRange);
        console.log(JSON.stringify(values, null, 2));
        break;
      }

      case 'read-meta': {
        const [range] = rest;
        if (!range) {
          console.error('ERROR: range is required for read-meta command');
          process.exit(1);
        }
        const meta = await sheetsClient.readRangeMeta(spreadsheetId, range);
        console.log(JSON.stringify(meta, null, 2));
        break;
      }

      case 'write': {
        const [range, value] = rest;
        if (!range || value === undefined) {
          console.error('ERROR: range and value are required for write command');
          console.error('NOTE: Single-cell writes are ~3-4x slower than batch operations.');
          process.exit(1);
        }
        const result = await sheetsClient.writeValue(spreadsheetId, range, value, flags);
        console.log(`Updated ${result.updatedCells} cell(s) in ${result.updatedRange}`);
        break;
      }

      case 'write-cells': {
        const [tabName, cellsJson] = rest;
        const jsonData = cellsJson || stdinData;
        if (!tabName || !jsonData) {
          console.error('ERROR: tab name and cells JSON are required');
          console.error('Usage: write-cells <id> <tab_name> <json>');
          process.exit(1);
        }
        const result = await sheetsClient.writeCells(spreadsheetId, tabName, jsonData, flags);
        console.log(`Updated ${result.cellsUpdated} cell(s) in 1 API call`);
        break;
      }

      case 'write-row': {
        const [tabName, row, col, valuesJson] = rest;
        const jsonData = valuesJson || stdinData;
        if (!tabName || row === undefined || col === undefined || !jsonData) {
          console.error('ERROR: tab name, row, col, and values JSON are required');
          console.error('Usage: write-row <id> <tab_name> <row> <col> <json>');
          process.exit(1);
        }
        const result = await sheetsClient.writeRow(spreadsheetId, tabName, parseInt(row), parseInt(col), jsonData, flags);
        console.log(`Updated ${result.cellsUpdated} cell(s) in ${result.range}`);
        break;
      }

      case 'write-col': {
        const [tabName, row, col, valuesJson] = rest;
        const jsonData = valuesJson || stdinData;
        if (!tabName || row === undefined || col === undefined || !jsonData) {
          console.error('ERROR: tab name, row, col, and values JSON are required');
          console.error('Usage: write-col <id> <tab_name> <row> <col> <json>');
          process.exit(1);
        }
        const result = await sheetsClient.writeCol(spreadsheetId, tabName, parseInt(row), parseInt(col), jsonData, flags);
        console.log(`Updated ${result.cellsUpdated} cell(s) in ${result.range}`);
        break;
      }

      case 'update': {
        const [range, value] = rest;
        const jsonValue = value || stdinData;
        if (!range || !jsonValue) {
          console.error('ERROR: range and JSON values are required for update command');
          console.error('Usage: update <id> <range> <json>');
          process.exit(1);
        }
        const result = await sheetsClient.updateRange(spreadsheetId, range, jsonValue, flags);
        console.log(`Updated ${result.updatedCells} cell(s) in ${result.updatedRange}`);
        break;
      }

      case 'update-range': {
        const [tabName, cellRange, value] = rest;
        const jsonValue = value || stdinData;
        if (!tabName || !cellRange || !jsonValue) {
          console.error('ERROR: tab name, range, and JSON values are required');
          console.error('Usage: update-range <id> <tab_name> <range> <json>');
          process.exit(1);
        }
        const fullRange = `${tabName}!${cellRange}`;
        const result = await sheetsClient.updateRange(spreadsheetId, fullRange, jsonValue, flags);
        console.log(`Updated ${result.updatedCells} cell(s) in ${result.updatedRange}`);
        break;
      }

      case 'update-formatted': {
        const [tabName, startRow, startCol, data] = rest;
        const jsonData = data || stdinData;
        if (!tabName || startRow === undefined || startCol === undefined || !jsonData) {
          console.error('ERROR: tab name, row, col, and JSON data are required');
          console.error('Usage: update-formatted <id> <tab_name> <row> <col> <json>');
          process.exit(1);
        }
        await sheetsClient.updateWithFormatting(spreadsheetId, tabName, parseInt(startRow), parseInt(startCol), jsonData);
        console.log(`Updated cells with formatting in "${tabName}"`);
        break;
      }

      case 'append': {
        const [range, value] = rest;
        const jsonValue = value || stdinData;
        if (!range || !jsonValue) {
          console.error('ERROR: range and JSON values are required for append command');
          console.error('Usage: append <id> <range> <json>');
          process.exit(1);
        }
        const result = await sheetsClient.appendRows(spreadsheetId, range, jsonValue, flags);
        console.log(`Appended rows to ${result.updates.updatedRange}`);
        break;
      }

      case 'append-range': {
        const [tabName, cellRange, value] = rest;
        const jsonValue = value || stdinData;
        if (!tabName || !cellRange || !jsonValue) {
          console.error('ERROR: tab name, range, and JSON values are required');
          console.error('Usage: append-range <id> <tab_name> <range> <json>');
          process.exit(1);
        }
        const fullRange = `${tabName}!${cellRange}`;
        const result = await sheetsClient.appendRows(spreadsheetId, fullRange, jsonValue, flags);
        console.log(`Appended rows to ${result.updates.updatedRange}`);
        break;
      }

      case 'info': {
        const info = await sheetsClient.getSheetInfo(spreadsheetId);
        console.log(`\n${info.title}\n`);
        console.log('Sheets:');
        info.sheets.forEach(s => console.log(`  ${s.index}: ${s.title} (id: ${s.id})`));
        break;
      }

      case 'create-tab': {
        const [tabName, index] = rest;
        if (!tabName) {
          console.error('ERROR: tab name is required');
          process.exit(1);
        }
        const result = await sheetsClient.createTab(spreadsheetId, tabName, index || 0);
        console.log(`Created tab "${result.title}" (id: ${result.sheetId}) at index ${result.index}`);
        break;
      }

      case 'delete-tab': {
        const [sheetId] = rest;
        if (!sheetId) {
          console.error('ERROR: sheet_id is required (use "info" command to find it)');
          process.exit(1);
        }
        await sheetsClient.deleteTab(spreadsheetId, sheetId);
        console.log(`Deleted tab with id ${sheetId}`);
        break;
      }

      case 'copy-tab': {
        const [sheetId, destId] = rest;
        if (!sheetId) {
          console.error('ERROR: sheet_id is required (use "info" command to find it)');
          process.exit(1);
        }
        const result = await sheetsClient.copyTab(spreadsheetId, sheetId, destId || null);
        console.log(`Copied tab to "${result.title}" (id: ${result.sheetId})`);
        break;
      }

      case 'rename-tab': {
        const [oldName, newName] = rest;
        if (!oldName || !newName) {
          console.error('ERROR: old name and new name are required');
          console.error('Usage: rename-tab <id> <old_name> <new_name>');
          process.exit(1);
        }
        await sheetsClient.renameTab(spreadsheetId, oldName, newName);
        console.log(`Renamed tab "${oldName}" to "${newName}"`);
        break;
      }

      case 'merge': {
        const [tabName, r1, c1, r2, c2] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) {
          console.error('ERROR: tab name and cell coordinates are required');
          console.error('Usage: merge <id> <tab_name> <start_row> <start_col> <end_row> <end_col>');
          process.exit(1);
        }
        await sheetsClient.mergeCells(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2));
        console.log(`Merged cells in "${tabName}"`);
        break;
      }

      case 'unmerge': {
        const [tabName, r1, c1, r2, c2] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) {
          console.error('ERROR: tab name and cell coordinates are required');
          console.error('Usage: unmerge <id> <tab_name> <start_row> <start_col> <end_row> <end_col>');
          process.exit(1);
        }
        await sheetsClient.unmergeCells(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2));
        console.log(`Unmerged cells in "${tabName}"`);
        break;
      }

      case 'apply-format': {
        const [tabName, r1, c1, r2, c2, formatJson] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined || !formatJson) {
          console.error('ERROR: tab name, coordinates, and format config are required');
          console.error('Usage: apply-format <id> <tab> <r1> <c1> <r2> <c2> \'{"bold":true,"bgColor":"#d9d9d9"}\'');
          process.exit(1);
        }
        await sheetsFormatting.applyFormat(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2), formatJson);
        console.log(`Applied formatting in "${tabName}"`);
        break;
      }

      case 'clear-format': {
        const [tabName, r1, c1, r2, c2] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) {
          console.error('ERROR: tab name and cell coordinates are required');
          console.error('Usage: clear-format <id> <tab> <r1> <c1> <r2> <c2>');
          process.exit(1);
        }
        await sheetsFormatting.clearFormat(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2));
        console.log(`Cleared formatting in "${tabName}"`);
        break;
      }

      case 'batch-format': {
        const [tabName, opsJson] = rest;
        if (!tabName || !opsJson) {
          console.error('ERROR: tab name and operations JSON are required');
          console.error('Usage: batch-format <id> <tab> \'[{"range":[0,0,1,5],"format":{"bold":true}}]\'');
          process.exit(1);
        }
        const result = await sheetsFormatting.batchFormat(spreadsheetId, tabName, opsJson);
        console.log(`Applied ${result.operationsApplied} format operations in ${result.apiCalls} API call`);
        break;
      }

      case 'batch-update': {
        const [updatesJson] = rest;
        if (!updatesJson) {
          console.error('ERROR: updates JSON is required');
          console.error('Usage: batch-update <id> \'[{"range":"Tab!A1:B2","values":[["a","b"]]}]\'');
          process.exit(1);
        }
        const result = await sheetsClient.batchUpdate(spreadsheetId, updatesJson, flags);
        console.log(`Updated ${result.cellsUpdated} cells across ${result.rangesUpdated} ranges in ${result.apiCalls} API call`);
        break;
      }

      case 'batch-merge': {
        const [tabName, mergesJson, optsJson] = rest;
        if (!tabName || !mergesJson) {
          console.error('ERROR: tab name and merges JSON are required');
          console.error('Usage: batch-merge <id> <tab> \'[{"row":0,"col":0,"rows":1,"cols":5}]\'');
          process.exit(1);
        }
        const result = await sheetsClient.batchMerge(spreadsheetId, tabName, mergesJson, optsJson || {});
        if (result.success) {
          console.log(`Applied ${result.mergesApplied} merges in ${result.apiCalls} API call`);
        } else {
          console.error(`Error: ${result.error}`);
          console.error('Conflicts:', JSON.stringify(result.conflicts, null, 2));
          console.error('Hint:', result.hint);
          process.exit(1);
        }
        break;
      }

      case 'smart-write': {
        const [tabName, specJson] = rest;
        if (!tabName || !specJson) {
          console.error('ERROR: tab name and spec JSON are required');
          console.error('Usage: smart-write <id> <tab> \'{"sections":[...]}\'');
          process.exit(1);
        }
        const result = await sheetsFormatting.smartSheetWrite(spreadsheetId, tabName, specJson);
        console.log(`Wrote ${result.rowsWritten} rows (${result.requestsInBatch} operations) in ${result.apiCalls} API call`);
        break;
      }

      case 'write-table': {
        const [tabName, row, col, tableJson] = rest;
        const jsonConfig = tableJson || stdinData;
        if (!tabName || row === undefined || col === undefined || !jsonConfig) {
          console.error('ERROR: tab name, position, and table config are required');
          console.error('Usage: write-table <id> <tab> <row> <col> \'{"headers":["A","B"],"data":[["1","2"]]}\'');
          process.exit(1);
        }
        const result = await sheetsFormatting.writeTable(spreadsheetId, tabName, parseInt(row), parseInt(col), jsonConfig);
        console.log(`Wrote table in "${tabName}" (${result.rowsWritten} rows, ${result.requestCount} requests)`);
        break;
      }

      case 'delete-rows': {
        const [tabName, startRow, endRow] = rest;
        if (!tabName || startRow === undefined || endRow === undefined) {
          console.error('ERROR: tab name and row range are required');
          console.error('Usage: delete-rows <id> <tab_name> <start_row> <end_row>');
          process.exit(1);
        }
        const result = await sheetsClient.deleteRows(spreadsheetId, tabName, parseInt(startRow), parseInt(endRow));
        console.log(`Deleted ${result.rowsDeleted} row(s) from "${tabName}"`);
        break;
      }

      case 'delete-cols': {
        const [tabName, startCol, endCol] = rest;
        if (!tabName || startCol === undefined || endCol === undefined) {
          console.error('ERROR: tab name and column range are required');
          console.error('Usage: delete-cols <id> <tab_name> <start_col> <end_col>');
          process.exit(1);
        }
        const result = await sheetsClient.deleteColumns(spreadsheetId, tabName, parseInt(startCol), parseInt(endCol));
        console.log(`Deleted ${result.colsDeleted} column(s) from "${tabName}"`);
        break;
      }

      case 'insert-rows': {
        const [tabName, startRow, count] = rest;
        if (!tabName || startRow === undefined || count === undefined) {
          console.error('ERROR: tab name, start row, and count are required');
          console.error('Usage: insert-rows <id> <tab_name> <start_row> <count>');
          process.exit(1);
        }
        const result = await sheetsClient.insertRows(spreadsheetId, tabName, parseInt(startRow), parseInt(count));
        console.log(`Inserted ${result.rowsInserted} row(s) in "${tabName}"`);
        break;
      }

      case 'clear': {
        const [range] = rest;
        if (!range) {
          console.error('ERROR: range is required');
          console.error('Usage: clear <id> <range>');
          process.exit(1);
        }
        const result = await sheetsClient.clearRange(spreadsheetId, range);
        console.log(`Cleared values in ${result.range}`);
        break;
      }

      case 'clear-all': {
        const [tabName, r1, c1, r2, c2] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) {
          console.error('ERROR: tab name and cell coordinates are required');
          console.error('Usage: clear-all <id> <tab> <r1> <c1> <r2> <c2>');
          process.exit(1);
        }
        await sheetsClient.clearRangeAll(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2));
        console.log(`Cleared values and formatting in "${tabName}"`);
        break;
      }

      case 'set-border': {
        const [tabName, r1, c1, r2, c2, borderJson] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) {
          console.error('ERROR: tab name and cell coordinates are required');
          console.error('Usage: set-border <id> <tab> <r1> <c1> <r2> <c2> [json]');
          process.exit(1);
        }
        const config = borderJson ? JSON.parse(borderJson) : { top: true, bottom: true, left: true, right: true };
        await sheetsFormatting.setBorders(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2), config);
        console.log(`Set borders in "${tabName}"`);
        break;
      }

      case 'set-validation': {
        const [tabName, r1, c1, r2, c2, validationJson] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined || !validationJson) {
          console.error('ERROR: tab name, coordinates, and validation config are required');
          console.error('Usage: set-validation <id> <tab> <r1> <c1> <r2> <c2> <json>');
          console.error('');
          console.error('Validation types:');
          console.error('  List dropdown:  {"type":"list","values":["Yes","No","Maybe"]}');
          console.error('  Number range:   {"type":"number","values":[0,100]}');
          console.error('  Checkbox:       {"type":"checkbox"}');
          console.error('  Custom formula: {"type":"custom","formula":"=A1>0"}');
          process.exit(1);
        }
        const result = await sheetsClient.setValidation(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2), validationJson);
        console.log(`Set ${result.type} validation in "${tabName}"`);
        break;
      }

      case 'clear-validation': {
        const [tabName, r1, c1, r2, c2] = rest;
        if (!tabName || r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) {
          console.error('ERROR: tab name and cell coordinates are required');
          console.error('Usage: clear-validation <id> <tab> <r1> <c1> <r2> <c2>');
          process.exit(1);
        }
        await sheetsClient.clearValidation(spreadsheetId, tabName, parseInt(r1), parseInt(c1), parseInt(r2), parseInt(c2));
        console.log(`Cleared validation in "${tabName}"`);
        break;
      }

      case 'merge-rows': {
        const [tabName, rowIndicesJson, numCols = '5'] = rest;
        if (!tabName || !rowIndicesJson) {
          console.error('ERROR: tab name and row indices are required');
          console.error('Usage: merge-rows <id> <tab_name> \'[0,3,9,16]\' [num_cols]');
          process.exit(1);
        }
        const rowIndices = JSON.parse(rowIndicesJson);
        const cols = parseInt(numCols);
        const auth = await getAuthClient();
        const gsheets = google.sheets({ version: 'v4', auth });
        const sheetId = await getSheetIdByName(gsheets, spreadsheetId, tabName);

        const requests = rowIndices.map(rowIdx => ({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: rowIdx,
              endRowIndex: rowIdx + 1,
              startColumnIndex: 0,
              endColumnIndex: cols
            },
            mergeType: 'MERGE_ALL'
          }
        }));

        await gsheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: { requests }
        });
        console.log(`Merged ${rowIndices.length} rows in "${tabName}"`);
        break;
      }

      case 'format-rows': {
        const [tabName, configJson] = rest;
        if (!tabName || !configJson) {
          console.error('ERROR: tab name and format config are required');
          console.error('Usage: format-rows <id> <tab_name> \'[{"rows":[0,3],"format":{"bgColor":"#fbbc04"}}]\'');
          process.exit(1);
        }
        const configs = JSON.parse(configJson);
        const auth = await getAuthClient();
        const gsheets = google.sheets({ version: 'v4', auth });
        const sheetId = await getSheetIdByName(gsheets, spreadsheetId, tabName);

        const requests = configs.map(config => {
          const [startRow, endRow] = config.rows;
          const format = config.format;

          const userEnteredFormat = {};
          if (format.bgColor) userEnteredFormat.backgroundColor = parseColor(format.bgColor);
          if (format.textColor) {
            userEnteredFormat.textFormat = userEnteredFormat.textFormat || {};
            userEnteredFormat.textFormat.foregroundColor = parseColor(format.textColor);
          }
          if (format.bold !== undefined) {
            userEnteredFormat.textFormat = userEnteredFormat.textFormat || {};
            userEnteredFormat.textFormat.bold = format.bold;
          }
          if (format.fontSize) {
            userEnteredFormat.textFormat = userEnteredFormat.textFormat || {};
            userEnteredFormat.textFormat.fontSize = format.fontSize;
          }

          return {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: startRow,
                endRowIndex: endRow,
                startColumnIndex: 0,
                endColumnIndex: 5
              },
              cell: { userEnteredFormat },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          };
        });

        await gsheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: { requests }
        });
        console.log(`Applied formatting to ${configs.length} row ranges in "${tabName}"`);
        break;
      }

      default:
        console.error(`ERROR: Unknown command: ${command}`);
        console.error('Run with --help to see available commands');
        process.exit(1);
    }
  } catch (error) {
    // Categorize error for diagnostics
    const statusCode = error.response?.status || error.code || 'unknown';
    let errorType = 'api_error';
    if (statusCode === 401 || statusCode === 403) errorType = 'auth_failure';
    else if (statusCode === 429) errorType = 'rate_limit';
    else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') errorType = 'network_error';
    else if (error.code === 'ETIMEDOUT') errorType = 'timeout';

    console.error(`\nError (${errorType}): ${error.message}`);
    if (error.response?.data?.error) {
      console.error('Details:', JSON.stringify(error.response.data.error, null, 2));
    }
    process.exit(1);
  }
}

main();
