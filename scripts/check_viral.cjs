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
  track('pm_ai_check_viral_start', {});

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const spreadsheetId = '1NxUxtoF03R9x4veNyyfFibVnR3Qwfe3WiUrJibbTL6c';

  console.log('=== CHECKING VIRAL LOOP MECHANICS ===\n');

  // Check Family-First scenario M12 data
  const familyData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Family-First!A57:N70'
  });
  
  console.log('Family-First - Family Invites Section (M1-M12):');
  familyData.data.values?.forEach(row => {
    console.log(row.slice(0, 8).join(' | '));
  });

  // Expected calculation for K-factor:
  // K = % paid who invite × invites per user × accept rate × conversion rate
  // K = 40% × 3 × 50% × 30% = 0.18
  
  console.log('\n=== EXPECTED K-FACTOR CALCULATION ===');
  console.log('% Paid Who Invite: 40%');
  console.log('Avg Invites: 3');
  console.log('Accept Rate: 50%');
  console.log('Family → Paid (90d): 30%');
  console.log('Expected K = 0.40 × 3 × 0.50 × 0.30 = 0.18');
  console.log('\nBut model shows K = 0.01-0.02... Why?');

  // Check the actual numbers at M12
  const m12 = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Family-First!N41:N70'
  });
  
  console.log('\n=== FAMILY-FIRST M12 ACTUALS ===');
  const labels = ['New Paid (Ads + Organic)', 'New Paid (Freemium)', 'New Paid (Family Conv)', 
                  'New Paid (Referred Conv)', 'Total New Paid', 'Paid Churn', 'Paid Users (End)',
                  '', 'Ad Clicks', 'New Free Signups', 'Free → Paid (D1)', 'Free → Paid (ongoing)',
                  'Free → Referred', 'Free Users (Start)', 'Free Churn', 'Free Users (End)',
                  '', 'Paid Inviting', 'Family Invited', 'Family → Paid', 'Family (Start)',
                  'Family Churn', 'Family (End)', '', 'New Referred (from Free)', 'Referred → Paid',
                  'Referred (Start)', 'Referred Churn', 'Referred (End)'];
  
  m12.data.values?.forEach((row, i) => {
    if (labels[i]) console.log(labels[i] + ': ' + row[0]);
  });

  trackComplete('pm_ai_check_viral_complete', startTime, { success: true });
  await flush();
}

main().catch(async (err) => {
  trackError('pm_ai_check_viral_error', err, {});
  await flush();
  console.error(err);
});
