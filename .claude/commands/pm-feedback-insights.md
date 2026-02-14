Analyze today's customer feedback sessions and generate actionable insights.

## Steps

1. Read workflow state for today from the scheduler API:
   - Run: `node -e "const s = require('./.ai/scripts/feedback-sessions/lib/shared.cjs'); s.getState().then(r => console.log(JSON.stringify(r, null, 2)))"`
   - Or call directly: `curl -H 'Authorization: Bearer $PM_AI_SCHEDULER_SECRET' $SCHEDULER_WORKER_URL/api/state/feedback-sessions/$(date +%Y-%m-%d)`
   - Extract: slots data, claim patterns, recording status

2. Read the Google Sheet for today's session data:
   - Sheet ID from FEEDBACK_SESSIONS_SHEET_ID env var
   - Check both "Users" and "Daily Slots" tabs for today's date

3. Check Dovetail for any interview notes or insights:
   - Search for today's interviewees by name
   - Pull any highlights or tags

4. Analyze and summarize:
   - **Fill rate**: How many slots were claimed vs available
   - **Time to claim**: How quickly slots were picked up
   - **Team participation**: Who claimed interviews (diversity of interviewers)
   - **User segments**: What types of users were interviewed today
   - **Recording compliance**: Did interviewers upload recordings to Dovetail

5. Generate actionable insights:
   - Patterns across recent sessions (check previous days' state if available)
   - Suggestions for improving fill rate or participation
   - Notable user segments that are under/over-represented

6. Post summary to #feedback-sessions Slack channel:
   - Use the existing thread if available from today's workflow state
   - Include key metrics and recommendations

Output should be concise, data-driven, and action-oriented.
