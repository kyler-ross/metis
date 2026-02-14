/**
 * Google Gmail Client Library
 *
 * Shared library for Gmail operations.
 * Uses unified google-auth.js for OAuth2 authentication.
 *
 * Supports:
 * - Reading/searching emails
 * - Sending emails
 * - Managing drafts
 * - Thread operations
 * - Labels
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');

// ============ URL Helper ============

/**
 * Get Gmail web URL for a message
 * @param {string} messageId - The message ID
 * @returns {string} Gmail web URL
 */
function getGmailUrl(messageId) {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

// ============ HTML Stripping ============

/**
 * Strip HTML tags and convert to plain text
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    // Remove style tags and content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove script tags and content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove head section
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    // Convert <br> and <p> to newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    // Convert links to text with URL
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    // Remove remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    // Clean up whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

// ============ Core API Functions ============

/**
 * List messages matching a query
 * @param {string} [query] - Gmail search query (e.g., "from:john subject:meeting")
 * @param {Object} [options] - Options
 * @param {number} [options.maxResults=50] - Max results to return
 * @param {string} [options.labelIds] - Filter by label ID
 * @param {string} [options.pageToken] - Page token for pagination
 * @returns {Promise<Object>} Object with messages array and pagination info
 */
async function listMessages(query = null, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const params = {
    userId: 'me',
    maxResults: options.maxResults || 50
  };

  if (query) {
    params.q = query;
  }

  if (options.labelIds) {
    params.labelIds = Array.isArray(options.labelIds) ? options.labelIds : [options.labelIds];
  }

  if (options.pageToken) {
    params.pageToken = options.pageToken;
  }

  const response = await gmail.users.messages.list(params);
  const messages = response.data.messages || [];

  // Fetch basic details for each message (including attachment check)
  const details = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date', 'Content-Type']
      });

      const headers = detail.data.payload.headers || [];
      const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

      // Check for attachments by looking at payload parts
      const hasAttachments = checkForAttachments(detail.data.payload);

      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: detail.data.snippet,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        labelIds: detail.data.labelIds || [],
        hasAttachments,
        url: getGmailUrl(msg.id)
      };
    })
  );

  // Count stats
  const unreadCount = details.filter(m => m.labelIds.includes('UNREAD')).length;
  const attachmentCount = details.filter(m => m.hasAttachments).length;

  return {
    messages: details,
    nextPageToken: response.data.nextPageToken || null,
    resultSizeEstimate: response.data.resultSizeEstimate || details.length,
    stats: {
      total: details.length,
      unread: unreadCount,
      withAttachments: attachmentCount
    }
  };
}

/**
 * Check if a message payload has attachments
 * @param {Object} payload - Message payload
 * @returns {boolean}
 */
function checkForAttachments(payload) {
  if (!payload) return false;
  
  if (payload.parts) {
    for (const part of payload.parts) {
      // Check for attachment disposition or filename
      if (part.filename && part.filename.length > 0) {
        return true;
      }
      // Recurse into nested parts
      if (part.parts && checkForAttachments(part)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get a full message by ID
 * @param {string} messageId - The message ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.rawHtml=false] - Return raw HTML instead of stripped text
 * @returns {Promise<Object>} Full message data
 */
async function getMessage(messageId, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const headers = response.data.payload.headers || [];
  const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

  return {
    id: response.data.id,
    threadId: response.data.threadId,
    subject: getHeader('Subject'),
    from: getHeader('From'),
    to: getHeader('To'),
    cc: getHeader('Cc'),
    date: getHeader('Date'),
    snippet: response.data.snippet,
    body: extractBody(response.data.payload, { stripHtml: !options.rawHtml }),
    labelIds: response.data.labelIds || [],
    attachments: extractAttachments(response.data.payload),
    url: getGmailUrl(response.data.id)
  };
}

/**
 * Get a full thread by ID
 * @param {string} threadId - The thread ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.rawHtml=false] - Return raw HTML instead of stripped text
 * @returns {Promise<Object>} Thread with all messages
 */
async function getThread(threadId, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  });

  const messages = (response.data.messages || []).map(msg => {
    const headers = msg.payload.headers || [];
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    return {
      id: msg.id,
      threadId: msg.threadId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      snippet: msg.snippet,
      body: extractBody(msg.payload, { stripHtml: !options.rawHtml }),
      url: getGmailUrl(msg.id)
    };
  });

  return {
    id: response.data.id,
    historyId: response.data.historyId,
    messageCount: messages.length,
    messages,
    url: getGmailUrl(response.data.id)
  };
}

/**
 * Get thread ID from a message ID
 * @param {string} messageId - The message ID
 * @returns {Promise<string>} The thread ID
 */
async function getThreadIdFromMessage(messageId) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'minimal'
  });

  return response.data.threadId;
}

/**
 * Send a new email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} body - Email body (plain text or HTML)
 * @param {Object} [options] - Options
 * @param {string} [options.cc] - CC recipients
 * @param {string} [options.bcc] - BCC recipients
 * @param {boolean} [options.html] - If true, body is HTML
 * @returns {Promise<Object>} Sent message info
 */
async function sendEmail(to, subject, body, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const message = createMessage(to, subject, body, options);

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: message
    }
  });

  return {
    id: response.data.id,
    threadId: response.data.threadId,
    labelIds: response.data.labelIds
  };
}

/**
 * Reply to a thread
 * @param {string} threadId - Thread ID to reply to
 * @param {string} body - Reply body
 * @param {Object} [options] - Options
 * @param {boolean} [options.replyAll] - Reply to all recipients
 * @returns {Promise<Object>} Sent message info
 */
async function replyToThread(threadId, body, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  // Get the thread to find the last message
  const thread = await getThread(threadId);
  const lastMessage = thread.messages[thread.messages.length - 1];

  // Build reply headers
  const to = options.replyAll ? lastMessage.to : lastMessage.from;
  const subject = lastMessage.subject.startsWith('Re:')
    ? lastMessage.subject
    : `Re: ${lastMessage.subject}`;

  const message = createMessage(to, subject, body, {
    ...options,
    threadId,
    inReplyTo: lastMessage.id
  });

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: message,
      threadId
    }
  });

  return {
    id: response.data.id,
    threadId: response.data.threadId
  };
}

/**
 * Create a draft
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} body - Email body
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Draft info
 */
async function createDraft(to, subject, body, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const message = createMessage(to, subject, body, options);

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: message
      }
    }
  });

  return {
    id: response.data.id,
    messageId: response.data.message.id,
    threadId: response.data.message.threadId
  };
}

/**
 * Send an existing draft
 * @param {string} draftId - Draft ID to send
 * @returns {Promise<Object>} Sent message info
 */
async function sendDraft(draftId) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.drafts.send({
    userId: 'me',
    requestBody: {
      id: draftId
    }
  });

  return {
    id: response.data.id,
    threadId: response.data.threadId
  };
}

/**
 * List all drafts
 * @returns {Promise<Object[]>} Array of drafts
 */
async function listDrafts() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.drafts.list({
    userId: 'me'
  });

  return response.data.drafts || [];
}

/**
 * List all labels
 * @returns {Promise<Object[]>} Array of labels
 */
async function listLabels() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.labels.list({
    userId: 'me'
  });

  return (response.data.labels || []).map(label => ({
    id: label.id,
    name: label.name,
    type: label.type
  }));
}

/**
 * Create a new label
 * @param {string} name - Label name
 * @param {Object} [options] - Options
 * @param {string} [options.labelListVisibility] - 'labelShow', 'labelShowIfUnread', 'labelHide'
 * @param {string} [options.messageListVisibility] - 'show' or 'hide'
 * @returns {Promise<Object>} Created label info
 */
async function createLabel(name, options = {}) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Label name is required and must be a non-empty string');
  }

  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: options.labelListVisibility || 'labelShow',
      messageListVisibility: options.messageListVisibility || 'show'
    }
  });

  return {
    id: response.data.id,
    name: response.data.name,
    type: response.data.type
  };
}

/**
 * Create a filter to auto-label messages
 * @param {Object} criteria - Filter criteria
 * @param {string} [criteria.from] - From address
 * @param {string} [criteria.to] - To address
 * @param {string} [criteria.subject] - Subject contains
 * @param {string} [criteria.query] - Gmail search query
 * @param {Object} action - Filter action
 * @param {string[]} [action.addLabelIds] - Labels to add
 * @param {string[]} [action.removeLabelIds] - Labels to remove
 * @param {boolean} [action.archive] - Skip inbox (archive)
 * @param {boolean} [action.markRead] - Mark as read
 * @returns {Promise<Object>} Created filter info
 */
async function createFilter(criteria, action) {
  if (!criteria || Object.keys(criteria).length === 0) {
    throw new Error('Filter criteria is required and must not be empty');
  }
  if (!action || Object.keys(action).length === 0) {
    throw new Error('Filter action is required and must not be empty');
  }

  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const filterAction = {};
  if (action.addLabelIds) filterAction.addLabelIds = action.addLabelIds;
  if (action.removeLabelIds) filterAction.removeLabelIds = action.removeLabelIds;
  if (action.archive) filterAction.removeLabelIds = [...(filterAction.removeLabelIds || []), 'INBOX'];
  if (action.markRead) filterAction.removeLabelIds = [...(filterAction.removeLabelIds || []), 'UNREAD'];

  const response = await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: {
      criteria,
      action: filterAction
    }
  });

  return {
    id: response.data.id,
    criteria: response.data.criteria,
    action: response.data.action
  };
}

/**
 * List all filters
 * @returns {Promise<Object[]>} Array of filters
 */
async function listFilters() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.settings.filters.list({
    userId: 'me'
  });

  // Gmail API returns empty object (no filters property) when no filters exist
  return response.data.filters || [];
}

/**
 * Add labels to a message
 * @param {string} messageId - Message ID
 * @param {string[]} labelIds - Label IDs to add
 * @returns {Promise<void>}
 */
async function addLabels(messageId, labelIds) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: labelIds
    }
  });
}

/**
 * Remove labels from a message
 * @param {string} messageId - Message ID
 * @param {string[]} labelIds - Label IDs to remove
 * @returns {Promise<void>}
 */
async function removeLabels(messageId, labelIds) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: labelIds
    }
  });
}

/**
 * Mark message as read
 * @param {string} messageId - Message ID
 * @returns {Promise<void>}
 */
async function markAsRead(messageId) {
  await removeLabels(messageId, ['UNREAD']);
}

/**
 * Mark message as unread
 * @param {string} messageId - Message ID
 * @returns {Promise<void>}
 */
async function markAsUnread(messageId) {
  await addLabels(messageId, ['UNREAD']);
}

/**
 * Archive a message (remove from INBOX)
 * @param {string} messageId - Message ID
 * @returns {Promise<void>}
 */
async function archive(messageId) {
  await removeLabels(messageId, ['INBOX']);
}

/**
 * Move message to trash
 * @param {string} messageId - Message ID
 * @returns {Promise<void>}
 */
async function trash(messageId) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.trash({
    userId: 'me',
    id: messageId
  });
}

/**
 * Batch modify multiple messages at once (much more efficient)
 * @param {string[]} messageIds - Array of message IDs
 * @param {Object} modifications - What to change
 * @param {string[]} [modifications.addLabelIds] - Labels to add
 * @param {string[]} [modifications.removeLabelIds] - Labels to remove
 * @returns {Promise<void>}
 */
async function batchModify(messageIds, modifications) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: messageIds,
      addLabelIds: modifications.addLabelIds || [],
      removeLabelIds: modifications.removeLabelIds || []
    }
  });
}

// ============ Helper Functions ============

/**
 * Create a base64 encoded email message
 */
function createMessage(to, subject, body, options = {}) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0'
  ];

  if (options.cc) {
    lines.push(`Cc: ${options.cc}`);
  }

  if (options.bcc) {
    lines.push(`Bcc: ${options.bcc}`);
  }

  if (options.inReplyTo) {
    lines.push(`In-Reply-To: ${options.inReplyTo}`);
    lines.push(`References: ${options.inReplyTo}`);
  }

  if (options.html) {
    lines.push('Content-Type: text/html; charset=utf-8');
  } else {
    lines.push('Content-Type: text/plain; charset=utf-8');
  }

  lines.push('');
  lines.push(body);

  const message = lines.join('\r\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Extract body from message payload
 * @param {Object} payload - Message payload
 * @param {Object} [options] - Options
 * @param {boolean} [options.stripHtml=true] - Strip HTML tags from HTML-only content
 */
function extractBody(payload, options = {}) {
  const shouldStripHtml = options.stripHtml !== false;
  
  if (!payload) return '';

  // Simple text body
  if (payload.body?.data) {
    const content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    // Check if it's HTML
    if (shouldStripHtml && payload.mimeType === 'text/html') {
      return stripHtml(content);
    }
    return content;
  }

  // Multipart message
  if (payload.parts) {
    // Prefer plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    // Fall back to HTML (and strip it)
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        return shouldStripHtml ? stripHtml(html) : html;
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part, options);
        if (nested) return nested;
      }
    }
  }

  return '';
}

/**
 * Extract attachment info from message payload
 */
function extractAttachments(payload) {
  const attachments = [];

  if (!payload) return attachments;

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size,
          attachmentId: part.body.attachmentId
        });
      }
      // Recurse into nested parts
      if (part.parts) {
        attachments.push(...extractAttachments(part));
      }
    }
  }

  return attachments;
}

module.exports = {
  // Read operations
  listMessages,
  getMessage,
  getThread,
  getThreadIdFromMessage,
  listLabels,
  listDrafts,
  listFilters,

  // Write operations
  sendEmail,
  replyToThread,
  createDraft,
  sendDraft,

  // Label operations
  addLabels,
  removeLabels,
  createLabel,
  markAsRead,
  markAsUnread,
  archive,
  trash,
  batchModify,

  // Filter operations
  createFilter,

  // Utilities
  getGmailUrl,
  stripHtml
};

