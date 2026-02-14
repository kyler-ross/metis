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
  track('pm_ai_check_conversion_start', {});

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const spreadsheetId = '1NxUxtoF03R9x4veNyyfFibVnR3Qwfe3WiUrJibbTL6c';

  console.log('=== CHECKING CONVERSION RATES ===\n');

  const scenarios = ['Conservative', 'Value-Led', 'Family-First', 'Full-Opt'];
  
  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario} ---`);
    
    // Get derived conversion rates (should be in rows 27-35)
    const rates = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${scenario}!A27:B35`
    });
    
    console.log('Derived Rates:');
    rates.data.values?.forEach(row => console.log('  ' + row.join(': ')));
    
    // Get the value gap that drives conversion
    const gap = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${scenario}!A22:F25`
    });
    console.log('\nTier Values:');
    gap.data.values?.forEach(row => console.log('  ' + row.slice(0, 4).join(' | ')));
  }

  // Check the elasticity parameters
  const elasticity = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Inputs!A47:B75'
  });
  console.log('\n=== ELASTICITY PARAMETERS ===');
  elasticity.data.values?.forEach(row => {
    if (row[0] && row[1]) console.log(row.join(': '));
  });

  trackComplete('pm_ai_check_conversion_complete', startTime, { scenarios_checked: 4, success: true });
  await flush();
}

main().catch(async (err) => {
  trackError('pm_ai_check_conversion_error', err, {});
  await flush();
  console.error(err);
});
