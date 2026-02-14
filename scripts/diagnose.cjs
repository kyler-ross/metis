const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { track, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');

const TOKEN_PATH = path.join(__dirname, '.google-sheets-token.json');
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/oauth2callback'
);

async function main() {
  const startTime = Date.now();
  track('pm_ai_diagnose_start', {});

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const spreadsheetId = '1NxUxtoF03R9x4veNyyfFibVnR3Qwfe3WiUrJibbTL6c';

  console.log('=== DIAGNOSING WHY SCENARIOS LOOK SIMILAR ===\n');

  // Check M24 Free/Family/Referred users and their costs for each scenario
  const scenarios = ['Current_State', 'Conservative', 'Value-Led', 'Family-First', 'Full-Opt'];
  
  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario} ---`);
    
    // Get user counts at M24
    const users = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${scenario}!Z47:Z69`
    });
    
    // Get costs at M24
    const costs = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${scenario}!Z73:Z78`
    });
    
    // Get the derived tier values (should be different per scenario!)
    const derived = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${scenario}!A22:C25`
    });
    
    console.log('Derived Tier Values:');
    derived.data.values?.forEach(row => console.log('  ' + row.join(' | ')));
    
    console.log('\nM24 User Counts:');
    console.log('  Paid Users: ' + (users.data.values?.[0]?.[0] || 'N/A'));
    console.log('  Free Users: ' + (users.data.values?.[9]?.[0] || 'N/A'));  // Row 56
    console.log('  Family Users: ' + (users.data.values?.[16]?.[0] || 'N/A'));  // Row 63
    console.log('  Referred Users: ' + (users.data.values?.[22]?.[0] || 'N/A'));  // Row 69
    
    console.log('\nM24 Monthly Costs:');
    costs.data.values?.forEach(row => console.log('  ' + row[0]));
  }

  // Check COGS inputs - are they hardcoded?
  const cogsInputs = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Inputs!A33:B35'
  });
  console.log('\n\n=== COGS INPUTS (from Inputs tab) ===');
  cogsInputs.data.values.forEach(row => console.log(row.join(': ')));

  // Check if COGS formulas in scenarios reference local values or hardcoded inputs
  const cogsFormula = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Conservative!B74:B77',
    valueRenderOption: 'FORMULA'
  });
  console.log('\n=== COGS FORMULAS (Conservative) ===');
  cogsFormula.data.values.forEach((row, i) => console.log('Row ' + (74+i) + ': ' + row[0]));

  trackComplete('pm_ai_diagnose_complete', startTime, { scenarios_checked: 5, success: true });
  await flush();
}

main().catch(async (err) => {
  trackError('pm_ai_diagnose_error', err, {});
  await flush();
  console.error(err);
});
