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

// Use shared retry logic
const { withRetry: sharedRetry } = require('./with-retry.cjs');

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

/**
 * Check that token is configured
 */
function checkToken() {
  if (!SLACK_TOKEN) {
    throw new Error(
      'SLACK_BOT_TOKEN must be set in environment.\n' +
      'Add to ~/.zshrc or ~/.bashrc:\n' +
      '  export SLACK_BOT_TOKEN="xoxb-your-token-here"'
    );
  }
}

/**
 * Execute a function with retry and exponential backoff.
 * Delegates to shared with-retry module.
 *
 * @param {Function} fn - Async function to execute
 * @param {number} [maxRetries=3] - Max retry attempts
 * @returns {Promise<*>} Result of the function
 */
async function withRetry(fn, maxRetries = 3) {
  return sharedRetry(fn, {
    maxRetries,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    service: 'slack',
    onRetry: (attempt, err, delayMs) => {
      console.warn(`Slack API error (attempt ${attempt}/${maxRetries + 1}): ${err.message}. Retrying in ${Math.round(delayMs)}ms...`);
    },
  });
}

/**
 * Make a Slack API request
 * @param {string} method - API method (e.g., 'chat.postMessage')
 * @param {Object} params - Request parameters
 * @returns {Promise<Object>} API response
 */
async function slackRequest(method, params = {}) {
  checkToken();

  // Slack methods that send structured data (blocks, attachments) need JSON.
  // Read-only / simple methods work more reliably with form-urlencoded
  // (users.info, conversations.info, etc. ignore JSON bodies).
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

/**
 * Test authentication
 * @returns {Promise<Object>} Auth info
 */
async function testAuth() {
  return slackRequest('auth.test');
}

// ============ Channels ============

/**
 * List channels the bot has access to
 * @param {Object} options - Options (types, limit, cursor)
 * @returns {Promise<Array>} List of channels
 */
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

/**
 * Get channel info
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object>} Channel info
 */
async function getChannelInfo(channelId) {
  const response = await slackRequest('conversations.info', { channel: channelId });
  return response.channel;
}

/**
 * List members in a channel
 * @param {string} channelId - Channel ID
 * @returns {Promise<Array>} List of user IDs
 */
async function listChannelMembers(channelId) {
  const response = await slackRequest('conversations.members', { channel: channelId });
  return response.members || [];
}

// ============ Messages ============

/**
 * Post a message to a channel
 * @param {string} channel - Channel ID or name
 * @param {string} text - Message text
 * @param {Object} options - Additional options (blocks, attachments, etc.)
 * @returns {Promise<Object>} Posted message info
 */
async function postMessage(channel, text, options = {}) {
  const params = {
    channel,
    text,
    ...options
  };
  return withRetry(() => slackRequest('chat.postMessage', params));
}

/**
 * Reply in a thread
 * @param {string} channel - Channel ID
 * @param {string} threadTs - Thread timestamp
 * @param {string} text - Reply text
 * @returns {Promise<Object>} Posted message info
 */
async function postThreadReply(channel, threadTs, text) {
  return withRetry(() => slackRequest('chat.postMessage', {
    channel,
    thread_ts: threadTs,
    text
  }));
}

/**
 * Update an existing message
 * @param {string} channel - Channel ID
 * @param {string} ts - Message timestamp to update
 * @param {string} text - New message text
 * @param {Object} options - Additional options (blocks, attachments, etc.)
 * @returns {Promise<Object>} Updated message info
 */
async function updateMessage(channel, ts, text, options = {}) {
  return slackRequest('chat.update', {
    channel,
    ts,
    text,
    ...options
  });
}

/**
 * Get message history from a channel
 * @param {string} channel - Channel ID
 * @param {Object} options - Options (limit, oldest, latest)
 * @returns {Promise<Array>} List of messages
 */
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

/**
 * Search messages
 * @param {string} query - Search query
 * @param {Object} options - Options (count, sort, sort_dir)
 * @returns {Promise<Object>} Search results
 */
async function searchMessages(query, options = {}) {
  const params = {
    query,
    count: options.count || 20,
    sort: options.sort || 'timestamp',
    sort_dir: options.sort_dir || 'desc'
  };
  return slackRequest('search.messages', params);
}

/**
 * Get thread replies
 * @param {string} channel - Channel ID
 * @param {string} threadTs - Thread timestamp
 * @param {Object} options - Options (limit, oldest, latest)
 * @returns {Promise<Array>} List of thread messages
 */
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

/**
 * List all users in the workspace
 * @returns {Promise<Array>} List of users
 */
async function listUsers() {
  const response = await slackRequest('users.list');
  return response.members || [];
}

/**
 * Get user info by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User info
 */
async function getUserInfo(userId) {
  const response = await slackRequest('users.info', { user: userId });
  return response.user;
}

/**
 * Find user by email
 * @param {string} email - Email address
 * @returns {Promise<Object>} User info
 */
async function getUserByEmail(email) {
  const response = await slackRequest('users.lookupByEmail', { email });
  return response.user;
}

// ============ DMs ============

/**
 * Open a DM channel with a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} DM channel info
 */
async function openDM(userId) {
  const response = await slackRequest('conversations.open', { users: userId });
  return response.channel;
}

/**
 * Send a DM to a user
 * @param {string} userId - User ID
 * @param {string} text - Message text
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Posted message info
 */
async function sendDM(userId, text, options = {}) {
  const dm = await openDM(userId);
  return postMessage(dm.id, text, options);
}

/**
 * Send a DM to a user by email
 * @param {string} email - User's email address
 * @param {string} text - Message text
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Posted message info
 */
async function sendDMByEmail(email, text, options = {}) {
  const user = await getUserByEmail(email);
  return sendDM(user.id, text, options);
}

// ============ Reminders ============

/**
 * Add a reminder
 * @param {string} text - Reminder text
 * @param {string|number} time - When to remind (Unix timestamp, or Slack time string like "tomorrow at 9am")
 * @param {string} userId - User to remind (optional, defaults to bot's user)
 * @returns {Promise<Object>} Created reminder info
 */
async function addReminder(text, time, userId = null) {
  const params = { text, time };
  if (userId) params.user = userId;
  const response = await slackRequest('reminders.add', params);
  return response.reminder;
}

/**
 * List reminders
 * @returns {Promise<Array>} List of reminders
 */
async function listReminders() {
  const response = await slackRequest('reminders.list');
  return response.reminders || [];
}

/**
 * Complete a reminder
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<Object>} Result
 */
async function completeReminder(reminderId) {
  return slackRequest('reminders.complete', { reminder: reminderId });
}

/**
 * Delete a reminder
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<Object>} Result
 */
async function deleteReminder(reminderId) {
  return slackRequest('reminders.delete', { reminder: reminderId });
}

// ============ Exports ============

module.exports = {
  // Auth
  testAuth,

  // Channels
  listChannels,
  getChannelInfo,
  listChannelMembers,

  // Messages
  postMessage,
  updateMessage,
  postThreadReply,
  getMessages,
  searchMessages,
  getThreadReplies,

  // Users
  listUsers,
  getUserInfo,
  getUserByEmail,

  // DMs
  openDM,
  sendDM,
  sendDMByEmail,

  // Reminders
  addReminder,
  listReminders,
  completeReminder,
  deleteReminder,

  // Low-level
  slackRequest,
  withRetry
};
