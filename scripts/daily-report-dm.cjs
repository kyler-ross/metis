#!/usr/bin/env node
/**
 * daily-report-dm.cjs - Daily chief-of-staff briefing via email.
 *
 * Gathers data from Granola, Calendar, Jira, Email, and Slack in parallel,
 * then calls the Anthropic API directly (Sonnet 4.5) to synthesize a
 * chief-of-staff briefing, and delivers it as an email.
 *
 * Usage:
 *   node .ai/scripts/daily-report-dm.cjs [--dry-run] [--date=YYYY-MM-DD] [--user=<id>]
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { loadUserContext, resolveUserId } = require('./lib/user-context.cjs');
const { run } = require('./lib/script-runner.cjs');

// Load env vars for CLI scripts
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5-20250929';

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateArg = args.find(a => a.startsWith('--date='));

// Load user profile (defaults to kyler for backward compat)
const userId = resolveUserId(args);
const { profile: USER } = loadUserContext(userId);
console.log(`User: ${USER.name} (${userId})`);

// Validate required fields
if (!USER.email) throw new Error(`User profile ${userId} missing required field: email`);
if (!USER.slack_dm_channel) console.warn(`Warning: User ${userId} has no slack_dm_channel - Slack context will be unavailable`);
if (!USER.persona) {
  console.warn(`Warning: User ${userId} has no persona template - using generic`);
  USER.persona = `You are the chief of staff for ${USER.name || userId} at Cloaked.`;
}

const DM_CHANNEL = USER.slack_dm_channel;
const RECIPIENT_EMAIL = USER.email;

function getDateStrings() {
  if (dateArg) {
    const d = new Date(dateArg.split('=')[1] + 'T12:00:00');
    const y = new Date(d);
    y.setDate(y.getDate() - 1);
    const fmt = d2 => d2.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return { today: fmt(d), yesterday: fmt(y) };
  }
  const now = new Date();
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const fmt = d => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return { today: fmt(now), yesterday: fmt(y) };
}

function runCmd(cmd, args = [], { timeout = 30000 } = {}) {
  try {
    const result = spawnSync(cmd, args, {
      cwd: path.resolve(__dirname, '../..'),
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // Unlike handle-claim.cjs (which uses an env allowlist for untrusted agent subprocesses),
      // daily-report runs trusted first-party scripts that need full env access for API keys.
      env: { ...process.env, TZ: 'America/New_York' },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `Command failed: ${cmd}`);
    return { ok: true, output: result.stdout.trim(), error: null };
  } catch (err) {
    return { ok: false, output: '', error: err.message.split('\n')[0] };
  }
}

async function gatherData() {
  const { today, yesterday } = getDateStrings();
  console.log(`Gathering data for ${today} (yesterday: ${yesterday})...`);

  // Run all data sources in parallel
  const results = await Promise.allSettled([
    // Granola meetings
    Promise.resolve().then(() => {
      const listResult = runCmd(process.execPath, ['.ai/scripts/granola-fetch.cjs', 'list', '--limit', '20'], { timeout: 45000 });
      if (!listResult.ok) return { source: 'granola', data: `[Error: ${listResult.error}]` };

      let docs;
      try { docs = JSON.parse(listResult.output); } catch { return { source: 'granola', data: '[Error: Invalid JSON from granola-fetch]' }; }

      // Filter to last 2 days
      const cutoff = new Date(yesterday + 'T00:00:00');
      const recent = docs.filter(d => new Date(d.created_at) >= cutoff);

      // Fetch transcripts for recent meetings (limit to 5 to avoid timeouts)
      const transcripts = [];
      for (const doc of recent.slice(0, 5)) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doc.id)) {
          transcripts.push({ id: doc.id, title: doc.title, created_at: doc.created_at, markdown: doc.markdown, transcript: '[Error: Invalid doc ID format]' });
          continue;
        }
        const tResult = runCmd(process.execPath, ['.ai/scripts/granola-fetch.cjs', 'transcript', doc.id], { timeout: 30000 });
        transcripts.push({
          id: doc.id,
          title: doc.title,
          created_at: doc.created_at,
          markdown: doc.markdown,
          transcript: !tResult.ok ? `[Error: ${tResult.error}]` : tResult.output.substring(0, 15000), // cap transcript size
        });
      }
      return { source: 'granola', meetings: recent.length, transcripts };
    }),

    // Calendar - today
    Promise.resolve().then(() => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('Invalid date format');
      const calResult = runCmd(process.execPath, ['.ai/scripts/google-calendar-api.js', 'events', `--date=${today}`], { timeout: 30000 });
      return { source: 'calendar_today', date: today, data: calResult.ok ? calResult.output : `[Error: ${calResult.error}]` };
    }),

    // Calendar - yesterday
    Promise.resolve().then(() => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(yesterday)) throw new Error('Invalid date format');
      const calResult = runCmd(process.execPath, ['.ai/scripts/google-calendar-api.js', 'events', `--date=${yesterday}`], { timeout: 30000 });
      return { source: 'calendar_yesterday', date: yesterday, data: calResult.ok ? calResult.output : `[Error: ${calResult.error}]` };
    }),

    // Jira
    Promise.resolve().then(() => {
      const jiraResult = runCmd(process.execPath, ['.ai/scripts/atlassian-api.cjs', 'jira', 'search', "assignee = currentUser() AND updated >= '-2d' ORDER BY updated DESC"], { timeout: 30000 });
      return { source: 'jira', data: jiraResult.ok ? jiraResult.output : `[Error: ${jiraResult.error}]` };
    }),

    // Email
    Promise.resolve().then(() => {
      const emailResult = runCmd(process.execPath, ['.ai/scripts/google-gmail-api.cjs', 'today'], { timeout: 30000 });
      return { source: 'email', data: emailResult.ok ? emailResult.output : `[Error: ${emailResult.error}]` };
    }),

    // Slack DM history (skip if no channel configured)
    DM_CHANNEL
      ? Promise.resolve().then(() => {
          if (!/^[CDGW][A-Za-z0-9]+$/.test(DM_CHANNEL)) throw new Error('Invalid Slack channel ID format');
          const slackResult = runCmd(process.execPath, ['.ai/scripts/slack-api.cjs', 'history', DM_CHANNEL, '10'], { timeout: 15000 });
          return { source: 'slack_dm', data: slackResult.ok ? slackResult.output : `[Error: ${slackResult.error}]` };
        })
      : Promise.resolve({ source: 'slack_dm', data: 'Slack DM channel not configured for this user' }),
  ]);

  // Collect results
  const data = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      data[r.value.source] = r.value;
    } else {
      console.error('Data source failed:', r.reason?.message);
    }
  }
  return { today, yesterday, ...data };
}

function buildPrompt(data) {
  const { today, yesterday } = data;
  const dayName = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York',
  });

  let context = `# Data Sources (gathered ${today})\n\n`;

  // Granola
  if (data.granola?.transcripts) {
    context += `## Granola Meetings (${data.granola.meetings} in last 2 days)\n`;
    for (const t of data.granola.transcripts) {
      context += `\n### ${t.title} (${t.created_at})\n`;
      if (t.markdown) context += `Notes:\n${t.markdown}\n`;
      if (t.transcript && !t.transcript.startsWith('[Error:')) {
        context += `Transcript:\n${t.transcript}\n`;
      } else if (t.transcript) {
        context += `Transcript: ${t.transcript}\n`;
      }
    }
  } else {
    context += `## Granola Meetings\n${data.granola?.data || 'No data available'}\n`;
  }

  // Calendar
  context += `\n## Calendar - Today (${today})\n${data.calendar_today?.data || 'No data'}\n`;
  context += `\n## Calendar - Yesterday (${yesterday})\n${data.calendar_yesterday?.data || 'No data'}\n`;

  // Jira
  context += `\n## Jira (updated last 2 days)\n${data.jira?.data || 'No data'}\n`;

  // Email
  context += `\n## Email\n${data.email?.data || 'No data'}\n`;

  // Slack DM history
  context += `\n## Recent Slack DM History (for follow-up context)\n${data.slack_dm?.data || 'No data'}\n`;

  const systemPrompt = `${USER.persona.trim()}

Your job: produce a daily briefing that a seasoned chief of staff would write - someone who
knows ${USER.name}'s priorities, understands what actually matters, and filters ruthlessly.

The system timezone is ${USER.timezone || 'America/New_York'} (Eastern Time). All times are already in the local timezone.`;

  const userPrompt = `${context}

---

Using the data above, write a daily briefing for ${dayName}, ${today}.

Before writing, consider:
- What did ${USER.name} commit to that needs follow-through?
- What decisions from yesterday affect what should be done today?
- What's the ONE thing that matters most today?
- What can be safely ignored?
- Are there patterns across meetings/emails worth noticing?

Output as clean, well-formatted HTML for an email. Use inline styles throughout (email clients
strip <style> blocks). Use this palette: #1a1a1a text, #2563eb headings/accent, #f8f9fa light
background for callout boxes, #dc2626 for urgent/overdue items.

Structure:

<h2 style="...">Daily Briefing - [Day, Date]</h2>

<h3>The One Thing</h3>
<p>What matters most today and why. One sentence, in a callout box with light background.</p>

<h3>Yesterday Recap</h3>
<p>A narrative of what happened, what was decided, and what carries forward.
Connect the dots between meetings. Highlight commitments ${USER.name} made.
NOT a list of meetings. Write flowing paragraphs.</p>

<h3>Today's Schedule</h3>
<p>Use a clean list or table. For each meeting:</p>
<ul>
<li><strong>Time</strong> - Meeting name. What ${USER.name} should know going in.</li>
<li>Flag conflicts, prep needed, or meetings that could be skipped.</li>
<li>For 1:1s: the most important topic based on recent context.</li>
</ul>

<h3>Action Items</h3>
<p>Things ${USER.name} personally committed to (from transcripts, emails, Jira). Each with source.
Use <span style="color: #dc2626">red</span> for overdue or at-risk items.</p>

<h3>Strategic Signals</h3>
<p>Patterns worth noticing: recurring themes, emerging risks, opportunities.
This is where a good chief of staff adds value - connecting dots ${USER.name} might miss.</p>

<h3>Decisions Needed</h3>
<p>Things blocked on ${USER.name} making a call.</p>

<h3>Safe to Ignore</h3>
<p>Briefly note what came in but doesn't need attention.</p>

Formatting rules:
- ALL styles must be inline (style="...") on each element. Do not rely on CSS classes or <style> blocks.
- Use <strong> for emphasis, <ul>/<li> for lists, <p> for paragraphs.
- Use background-color: #f8f9fa; padding: 12px; border-radius: 6px; for callout boxes.
- Use border-left: 3px solid #2563eb for highlighted sections.
- Keep good spacing between sections (margin-top: 20px on h3 tags).

Content rules:
- Write like a trusted advisor, not a robot listing bullet points.
- Be substantive. Include enough context that each item is actionable without clicking through.
- Connect information across sources. A Jira ticket + a meeting discussion + an email = one story.
- Do NOT use <hr> tags or em-dashes.
- Do NOT fabricate. If a source returned no data or had errors, say so.
- NEVER attribute quotes or ideas to specific individuals from Granola transcripts. Speaker
  attribution in transcripts is unreliable. Instead say "the team discussed", "it was noted",
  "the meeting covered", etc. You can reference what meetings topics came from, just not who said what.
- Sentry/monitoring alerts are noise unless they indicate a pattern affecting product decisions.
- Times are already in ET from the calendar API. Do not convert or offset them.
- AGGRESSIVE EMAIL FILTERING: Only include emails where ${USER.name} must personally act or decide.
  IGNORE: newsletters, Sentry/PagerDuty/monitoring alerts, CC'd emails, automated notifications,
  marketing emails, Linear/GitHub/Figma notifications, Firebase/analytics digests.
- Output ONLY the HTML body content (starting from <h2>). No <html>, <head>, <body> wrappers, no code fences, no preamble.`;

  return { systemPrompt, userPrompt, dayName };
}

async function callAnthropic(systemPrompt, userPrompt) {
  const key = ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY required');

  console.log(`Calling Anthropic API (${MODEL})...`);

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${body.substring(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Anthropic API');

  console.log(`Synthesis complete (${text.length} chars, ${data.usage?.output_tokens || '?'} tokens)`);
  return text;
}

function wrapHtml(bodyContent) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 680px; margin: 0 auto; padding: 20px; }
  h2 { color: #1a1a1a; font-size: 22px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  h3 { color: #2563eb; font-size: 16px; margin-top: 24px; margin-bottom: 8px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  p { margin: 8px 0; }
  strong { color: #1a1a1a; }
  .muted { color: #6b7280; font-size: 13px; }
</style>
</head>
<body>
${bodyContent}
<p class="muted" style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px;">Generated by PM AI Chief of Staff</p>
</body>
</html>`;
}

async function sendEmail(htmlBody, dayName, today) {
  const googleAuth = require(path.join(__dirname, '../tools/lib/google-auth.cjs'));
  const gmailClient = require(path.join(__dirname, '../tools/lib/gmail-client.cjs'));

  // Ensure we send from the correct account
  googleAuth.setCurrentAccount(RECIPIENT_EMAIL);

  const subject = `Daily Briefing - ${dayName}, ${today}`;
  const fullHtml = wrapHtml(htmlBody);

  console.log(`Sending email to ${RECIPIENT_EMAIL}...`);
  const result = await gmailClient.sendEmail(RECIPIENT_EMAIL, subject, fullHtml, { html: true });
  console.log(`Email sent (id: ${result.id})`);
}

run({
  name: 'daily-report-dm',
  mode: 'operational',
  services: ['google', 'jira', 'slack'],
}, async (ctx) => {
  const startTime = Date.now();

  // 1. Gather all data in parallel
  const data = await gatherData();

  // 2. Build and send to Anthropic for synthesis
  const { systemPrompt, userPrompt, dayName } = buildPrompt(data);
  const report = await callAnthropic(systemPrompt, userPrompt);

  // 3. Deliver
  if (dryRun) {
    console.log('\n--- DRY RUN OUTPUT ---\n');
    console.log(report);
  } else {
    await sendEmail(report, dayName, data.today);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
});
