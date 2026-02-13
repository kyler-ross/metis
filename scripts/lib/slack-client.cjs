// PM AI Starter Kit - slack-client.cjs
// See scripts/README.md for setup
/**
 * Slack Client Library
 *
 * Provides Slack API operations:
 * - Channels (list, info, members)
 * - Messages (post, reply, history, search)
 * - Users (list, info, lookup)
 * - Reminders (add, list, complete, delete)
 * - DMs (open, send)
 *
 * Requires SLACK_BOT_TOKEN environment variable.
 */

const https = require('https');
const path = require('path');

// Load .env from scripts directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

/**
 * Check that token is configured
 */
function checkToken() {
  if (!SLACK_TOKEN) {
    throw new Error(
      'SLACK_BOT_TOKEN must be set in .env file.\n' +
      'Add SLACK_BOT_TOKEN=xoxb-your-token-here to scripts/.env'
    );
  }
}

/**
 * Retryable status codes for Slack API.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

/**
 * Execute a function with retry and exponential backoff.
 */
async function withRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable = RETRYABLE_STATUSES.has(err.statusCode)
        || err.data?.error === 'ratelimited'
        || (err.message && err.message.includes('timed out'))
        || (err.message && err.message.includes('ECONNRESET'));

      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }

      let delayMs;
      const retryAfter = err.retryAfter;
      if (retryAfter) {
        delayMs = Math.ceil(parseFloat(retryAfter) * 1000);
      } else {
        delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000);
      }
      console.warn(`Slack API error (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}. Retrying in ${Math.round(delayMs)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/**
 * Make a Slack API request
 */
async function slackRequest(method, params = {}) {
  checkToken();

  const jsonMethods = new Set([
    'chat.postMessage', 'chat.update', 'chat.delete',
    'chat.postEphemeral', 'chat.unfurl',
  ]);
  const useJson = jsonMethods.has(method);

  return new Promise((resolve, reject) => {
    let postData;
    let contentType;
    if (useJson) {
      postData = JSON.stringify(params);
      contentType = 'application/json; charset=utf-8';
    } else {
      postData = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
      ).toString();
      contentType = 'application/x-www-form-urlencoded';
    }

    const options = {
      hostname: 'slack.com',
      port: 443,
      path: `/api/${method}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_TOKEN}`,
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (!response.ok) {
            const error = new Error(`Slack API error: ${response.error}`);
            error.data = response;
            error.statusCode = res.statusCode;
            error.retryAfter = res.headers['retry-after'];
            reject(error);
          } else {
            resolve(response);
          }
        } catch (e) {
          const parseErr = new Error(`Failed to parse Slack response: ${e.message}`);
          parseErr.statusCode = res.statusCode;
          reject(parseErr);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Slack API request timed out after 15s'));
    });
    req.write(postData);
    req.end();
  });
}

// ============ Auth ============

async function testAuth() {
  return slackRequest('auth.test');
}

// ============ Channels ============

async function listChannels(options = {}) {
  const params = {
    types: options.types || 'public_channel,private_channel',
    limit: options.limit || 200,
    exclude_archived: true
  };
  if (options.cursor) params.cursor = options.cursor;

  const response = await slackRequest('conversations.list', params);
  return response.channels || [];
}

async function getChannelInfo(channelId) {
  const response = await slackRequest('conversations.info', { channel: channelId });
  return response.channel;
}

async function listChannelMembers(channelId) {
  const response = await slackRequest('conversations.members', { channel: channelId });
  return response.members || [];
}

// ============ Messages ============

async function postMessage(channel, text, options = {}) {
  const params = { channel, text, ...options };
  return withRetry(() => slackRequest('chat.postMessage', params));
}

async function postThreadReply(channel, threadTs, text) {
  return withRetry(() => slackRequest('chat.postMessage', {
    channel,
    thread_ts: threadTs,
    text
  }));
}

async function updateMessage(channel, ts, text, options = {}) {
  return slackRequest('chat.update', { channel, ts, text, ...options });
}

async function getMessages(channel, options = {}) {
  const params = {
    channel,
    limit: options.limit || 20
  };
  if (options.oldest) params.oldest = options.oldest;
  if (options.latest) params.latest = options.latest;

  const response = await slackRequest('conversations.history', params);
  return response.messages || [];
}

async function searchMessages(query, options = {}) {
  const params = {
    query,
    count: options.count || 20,
    sort: options.sort || 'timestamp',
    sort_dir: options.sort_dir || 'desc'
  };
  return slackRequest('search.messages', params);
}

async function getThreadReplies(channel, threadTs, options = {}) {
  const params = {
    channel,
    ts: threadTs,
    limit: options.limit || 100
  };
  if (options.oldest) params.oldest = options.oldest;
  if (options.latest) params.latest = options.latest;

  const response = await slackRequest('conversations.replies', params);
  return response.messages || [];
}

// ============ Users ============

async function listUsers() {
  const response = await slackRequest('users.list');
  return response.members || [];
}

async function getUserInfo(userId) {
  const response = await slackRequest('users.info', { user: userId });
  return response.user;
}

async function getUserByEmail(email) {
  const response = await slackRequest('users.lookupByEmail', { email });
  return response.user;
}

// ============ DMs ============

async function openDM(userId) {
  const response = await slackRequest('conversations.open', { users: userId });
  return response.channel;
}

async function sendDM(userId, text, options = {}) {
  const dm = await openDM(userId);
  return postMessage(dm.id, text, options);
}

async function sendDMByEmail(email, text, options = {}) {
  const user = await getUserByEmail(email);
  return sendDM(user.id, text, options);
}

// ============ Reminders ============

async function addReminder(text, time, userId = null) {
  const params = { text, time };
  if (userId) params.user = userId;
  const response = await slackRequest('reminders.add', params);
  return response.reminder;
}

async function listReminders() {
  const response = await slackRequest('reminders.list');
  return response.reminders || [];
}

async function completeReminder(reminderId) {
  return slackRequest('reminders.complete', { reminder: reminderId });
}

async function deleteReminder(reminderId) {
  return slackRequest('reminders.delete', { reminder: reminderId });
}

// ============ Exports ============

module.exports = {
  testAuth,
  listChannels,
  getChannelInfo,
  listChannelMembers,
  postMessage,
  updateMessage,
  postThreadReply,
  getMessages,
  searchMessages,
  getThreadReplies,
  listUsers,
  getUserInfo,
  getUserByEmail,
  openDM,
  sendDM,
  sendDMByEmail,
  addReminder,
  listReminders,
  completeReminder,
  deleteReminder,
  slackRequest,
  withRetry
};
