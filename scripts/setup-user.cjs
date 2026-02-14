#!/usr/bin/env node
/**
 * setup-user.cjs - Interactive wizard for adding a new user to the PM AI multi-user system.
 *
 * Steps:
 *   1. Collect name, email, Slack DM channel, timezone
 *   2. Run Google OAuth flow for their account
 *   3. Optionally run Granola auth
 *   4. Choose enabled jobs and schedule
 *   5. Write .ai/config/users/{id}.yml
 *   6. Merge credentials into PM_USER_CREDENTIALS GHA secret
 *   7. Print next steps
 *
 * Usage:
 *   node .ai/scripts/setup-user.cjs               # Interactive wizard
 *   node .ai/scripts/setup-user.cjs --user=<id>   # Update existing user's credentials
 */
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');
const { validateUserId, USERS_DIR } = require('./lib/user-context.cjs');
const LOCAL_CREDS_PATH = path.resolve(__dirname, '..', 'local', 'pm-user-credentials.json');

const { run } = require('./lib/script-runner.cjs');

function ask(rl, question, defaultVal) {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function loadLocalCreds() {
  try {
    if (fs.existsSync(LOCAL_CREDS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CREDS_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveLocalCreds(creds) {
  const dir = path.dirname(LOCAL_CREDS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOCAL_CREDS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

const { detectRepo } = require('./lib/repo-utils.cjs');

run({
  name: 'setup-user',
  mode: 'operational',
  services: [],
}, async (ctx) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n=== PM AI User Setup Wizard ===\n');

  // Check for --user flag (update mode)
  const userFlag = ctx.args.flags.user;
  let userId = userFlag || null;
  let existingProfile = null;

  if (userId) {
    validateUserId(userId);
    const profilePath = path.join(USERS_DIR, `${userId}.yml`);
    if (fs.existsSync(profilePath)) {
      existingProfile = yaml.load(fs.readFileSync(profilePath, 'utf-8'), { schema: yaml.JSON_SCHEMA });
      console.log(`Updating existing user: ${userId} (${existingProfile.name})\n`);
    } else {
      rl.close();
      throw new Error(`User profile not found: ${profilePath}\nTo create a new user, run without --user flag: node .ai/scripts/setup-user.cjs`);
    }
  }

  // Step 1: Collect basic info
  if (!existingProfile) {
    console.log('Step 1: Basic Information\n');
    const name = await ask(rl, 'Full name');
    userId = await ask(rl, 'User ID (short lowercase, e.g., kyler)', name.toLowerCase().split(' ')[0]);
    try {
      validateUserId(userId);
    } catch (err) {
      rl.close();
      throw err;
    }

    // Check for existing profile collision
    const existingPath = path.join(USERS_DIR, `${userId}.yml`);
    if (fs.existsSync(existingPath)) {
      const overwrite = await ask(rl, `Profile ${userId}.yml already exists. Overwrite? (y/n)`, 'n');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Aborted.');
        rl.close();
        return;
      }
    }

    const email = await ask(rl, 'Email', `${userId}@cloaked.id`);
    if (!email.includes('@')) {
      rl.close();
      throw new Error('Invalid email format');
    }
    const title = await ask(rl, 'Title', 'Product Manager');
    const timezone = await ask(rl, 'Timezone', 'America/New_York');
    const slackDm = await ask(rl, 'Slack DM channel ID (find via Slack app)', '');
    const googleAccount = await ask(rl, 'Google account email', email);

    // Step 2: Schedule preferences
    console.log('\nStep 2: Schedule\n');
    const briefingTime = await ask(rl, 'Daily briefing time (HH:MM, 24h)', '08:15');
    if (!/^\d{1,2}:\d{2}$/.test(briefingTime)) {
      rl.close();
      throw new Error('Invalid time format. Use HH:MM (e.g., 08:15)');
    }
    const [hour, minute] = briefingTime.split(':');
    const briefingCron = `${minute} ${hour} * * 1-5`;

    // Step 3: Enabled jobs
    console.log('\nStep 3: Jobs\n');
    console.log('Available multi-user jobs:');
    console.log('  1. daily-report-dm  - Daily chief-of-staff briefing email');
    console.log('  2. push-granola-tokens - Push Granola tokens for cloud runs');
    console.log('  3. granola-token-refresh - Keep Granola tokens fresh');
    const jobChoice = await ask(rl, 'Enable which jobs? (comma-separated numbers, or "all")', 'all');
    const allJobs = ['daily-report-dm', 'push-granola-tokens', 'granola-token-refresh'];
    let enabledJobs;
    if (jobChoice === 'all') {
      enabledJobs = allJobs;
    } else {
      const indices = jobChoice.split(',').map(s => parseInt(s.trim()) - 1);
      enabledJobs = indices.filter(i => i >= 0 && i < allJobs.length).map(i => allJobs[i]);
    }

    // Step 4: Persona
    console.log('\nStep 4: AI Persona\n');
    const useDefault = await ask(rl, 'Use default persona template? (y/n)', 'y');
    let persona;
    if (useDefault.toLowerCase() === 'y') {
      persona = `You are the chief of staff for {{name}}, {{title}} at Cloaked (a privacy platform).\nCustomize this persona to reflect your role, priorities, and communication style.\n`;
    } else {
      console.log('Enter your custom persona (end with an empty line):');
      const lines = [];
      while (true) {
        const line = await ask(rl, '');
        if (!line) break;
        lines.push(line);
      }
      persona = lines.join('\n') + '\n';
    }

    // Write profile YAML
    if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
    const profile = {
      user_id: userId,
      name,
      title,
      email,
      slack_dm_channel: slackDm,
      timezone,
      google_account: googleAccount,
      schedule_overrides: { 'daily-report-dm': briefingCron },
      enabled_jobs: enabledJobs,
      persona,
    };

    const yamlContent = yaml.dump(profile, { lineWidth: 120, quotingType: '"' });
    fs.writeFileSync(path.join(USERS_DIR, `${userId}.yml`), yamlContent);
    console.log(`\nProfile written to .ai/config/users/${userId}.yml`);
    existingProfile = profile;
  }

  // Step 5: Google OAuth
  console.log('\nStep 5: Google OAuth\n');
  const doGoogle = await ask(rl, 'Run Google OAuth flow now? (y/n)', 'y');
  let googleToken = null;
  if (doGoogle.toLowerCase() === 'y') {
    console.log('Starting Google OAuth flow...');
    try {
      const authScript = path.join(__dirname, 'google-auth-setup.cjs');
      if (fs.existsSync(authScript)) {
        const authResult = spawnSync('node', [authScript], { stdio: 'inherit', timeout: 120000 });
        if (authResult.error) throw authResult.error;
        if (authResult.status !== 0) throw new Error('Google OAuth setup failed');
        const tokenPath = path.join(__dirname, '.google-suite-token.json');
        if (fs.existsSync(tokenPath)) {
          googleToken = fs.readFileSync(tokenPath, 'utf-8').trim();
          console.log('Google OAuth token captured.');
        }
      } else {
        console.log('google-auth-setup.cjs not found. Run it manually later.');
      }
    } catch (err) {
      console.error('Google OAuth failed:', err.message);
      console.log('You can run it manually later: node .ai/scripts/google-auth-setup.cjs');
    }
  }

  // Step 6: Granola Auth (optional)
  console.log('\nStep 6: Granola Auth (optional)\n');
  const doGranola = await ask(rl, 'Set up Granola auth? (y/n)', 'n');
  let granolaAuth = null;
  if (doGranola.toLowerCase() === 'y') {
    console.log('Starting Granola auth flow...');
    try {
      const authScript = path.join(__dirname, 'granola-auth.cjs');
      validateUserId(userId); // re-validate before shell use (defense-in-depth)
      const granolaResult = spawnSync('node', [authScript, 'login', `--user=${userId}`], { stdio: 'inherit', timeout: 120000 });
      if (granolaResult.error) throw granolaResult.error;
      if (granolaResult.status !== 0) throw new Error('Granola auth failed');

      // Read the token file to get the supabase.json format
      const tokenPath = path.join(__dirname, '..', 'local', `granola-tokens-${userId}.json`);
      if (fs.existsSync(tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
        // NOTE: This JSON structure must match granola-auth.cjs buildSupabaseJson()
        granolaAuth = JSON.stringify({
          workos_tokens: JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            obtained_at: tokens.obtained_at,
          }),
        });
        console.log('Granola auth captured.');
      }
    } catch (err) {
      console.error('Granola auth failed:', err.message);
    }
  }

  // Step 7: Merge into PM_USER_CREDENTIALS
  console.log('\nStep 7: Push credentials to GitHub Actions\n');
  const doPush = await ask(rl, 'Push credentials to GHA secret? (y/n)', 'y');
  if (doPush.toLowerCase() === 'y' && (googleToken || granolaAuth)) {
    const creds = loadLocalCreds();
    if (!creds[userId]) creds[userId] = {};
    if (googleToken) creds[userId].GOOGLE_OAUTH_TOKEN_JSON = googleToken;
    if (granolaAuth) creds[userId].GRANOLA_AUTH_JSON = granolaAuth;
    saveLocalCreds(creds);
    console.log(`Local credentials manifest updated at ${LOCAL_CREDS_PATH}`);

    const repo = detectRepo();
    try {
      const pushResult = spawnSync('gh', ['secret', 'set', 'PM_USER_CREDENTIALS', '-R', repo], {
        input: JSON.stringify(creds),
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: 15000,
      });
      if (pushResult.error) throw pushResult.error;
      if (pushResult.status !== 0) throw new Error('gh secret set failed');
      console.log(`PM_USER_CREDENTIALS secret updated for repo ${repo}`);
    } catch (err) {
      console.error('Failed to push to GHA:', err.message);
      console.log('You can push manually later:');
      console.log(`  cat ${LOCAL_CREDS_PATH} | gh secret set PM_USER_CREDENTIALS -R ${repo}`);
    }
  } else if (doPush.toLowerCase() === 'y') {
    console.log('No credentials to push (OAuth/Granola setup was skipped).');
  }

  rl.close();

  // Summary
  console.log('\n=== Setup Complete ===\n');
  console.log(`User: ${existingProfile.name} (${userId})`);
  console.log(`Profile: .ai/config/users/${userId}.yml`);
  console.log(`Google OAuth: ${googleToken ? 'configured' : 'skipped'}`);
  console.log(`Granola: ${granolaAuth ? 'configured' : 'skipped'}`);
  console.log('\nNext steps:');
  console.log(`  1. Review and commit: git add .ai/config/users/${userId}.yml && git commit`);
  console.log('  2. Push to main: git push');
  console.log('  3. Sync jobs: node .ai/scheduler/sync-jobs.cjs');
  console.log(`  4. Verify: node .ai/scripts/daily-report-dm.cjs --user=${userId} --dry-run`);
});
