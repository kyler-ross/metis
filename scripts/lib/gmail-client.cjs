// PM AI Starter Kit - Google Gmail Client Library
// See scripts/README.md for setup instructions
//
// Shared library for Gmail operations.
// Uses unified google-auth.cjs for OAuth2 authentication.
//
// Supports:
// - Reading/searching emails
// - Sending emails
// - Managing drafts
// - Thread operations
// - Labels and filters

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');

function getGmailUrl(messageId) {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

async function listMessages(query = null, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const params = { userId: 'me', maxResults: options.maxResults || 50 };
  if (query) params.q = query;
  if (options.labelIds) params.labelIds = Array.isArray(options.labelIds) ? options.labelIds : [options.labelIds];
  if (options.pageToken) params.pageToken = options.pageToken;

  const response = await gmail.users.messages.list(params);
  const messages = response.data.messages || [];

  const details = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date', 'Content-Type']
      });
      const headers = detail.data.payload.headers || [];
      const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
      const hasAttachments = checkForAttachments(detail.data.payload);
      return {
        id: msg.id, threadId: msg.threadId, snippet: detail.data.snippet,
        subject: getHeader('Subject'), from: getHeader('From'), to: getHeader('To'),
        date: getHeader('Date'), labelIds: detail.data.labelIds || [],
        hasAttachments, url: getGmailUrl(msg.id)
      };
    })
  );

  const unreadCount = details.filter(m => m.labelIds.includes('UNREAD')).length;
  const attachmentCount = details.filter(m => m.hasAttachments).length;

  return {
    messages: details,
    nextPageToken: response.data.nextPageToken || null,
    resultSizeEstimate: response.data.resultSizeEstimate || details.length,
    stats: { total: details.length, unread: unreadCount, withAttachments: attachmentCount }
  };
}

function checkForAttachments(payload) {
  if (!payload) return false;
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.filename.length > 0) return true;
      if (part.parts && checkForAttachments(part)) return true;
    }
  }
  return false;
}

async function getMessage(messageId, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const headers = response.data.payload.headers || [];
  const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
  return {
    id: response.data.id, threadId: response.data.threadId,
    subject: getHeader('Subject'), from: getHeader('From'), to: getHeader('To'),
    cc: getHeader('Cc'), date: getHeader('Date'), snippet: response.data.snippet,
    body: extractBody(response.data.payload, { stripHtml: !options.rawHtml }),
    labelIds: response.data.labelIds || [],
    attachments: extractAttachments(response.data.payload),
    url: getGmailUrl(response.data.id)
  };
}

async function getThread(threadId, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
  const messages = (response.data.messages || []).map(msg => {
    const headers = msg.payload.headers || [];
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
    return {
      id: msg.id, threadId: msg.threadId, subject: getHeader('Subject'),
      from: getHeader('From'), to: getHeader('To'), date: getHeader('Date'),
      snippet: msg.snippet,
      body: extractBody(msg.payload, { stripHtml: !options.rawHtml }),
      url: getGmailUrl(msg.id)
    };
  });
  return {
    id: response.data.id, historyId: response.data.historyId,
    messageCount: messages.length, messages, url: getGmailUrl(response.data.id)
  };
}

async function getThreadIdFromMessage(messageId) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'minimal' });
  return response.data.threadId;
}

async function sendEmail(to, subject, body, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const message = createMessage(to, subject, body, options);
  const response = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: message } });
  return { id: response.data.id, threadId: response.data.threadId, labelIds: response.data.labelIds };
}

async function replyToThread(threadId, body, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const thread = await getThread(threadId);
  const lastMessage = thread.messages[thread.messages.length - 1];
  const to = options.replyAll ? lastMessage.to : lastMessage.from;
  const subject = lastMessage.subject.startsWith('Re:') ? lastMessage.subject : `Re: ${lastMessage.subject}`;
  const message = createMessage(to, subject, body, { ...options, threadId, inReplyTo: lastMessage.id });
  const response = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: message, threadId } });
  return { id: response.data.id, threadId: response.data.threadId };
}

async function createDraft(to, subject, body, options = {}) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const message = createMessage(to, subject, body, options);
  const response = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw: message } } });
  return { id: response.data.id, messageId: response.data.message.id, threadId: response.data.message.threadId };
}

async function sendDraft(draftId) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
  return { id: response.data.id, threadId: response.data.threadId };
}

async function listDrafts() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.drafts.list({ userId: 'me' });
  return response.data.drafts || [];
}

async function listLabels() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.labels.list({ userId: 'me' });
  return (response.data.labels || []).map(label => ({ id: label.id, name: label.name, type: label.type }));
}

async function createLabel(name, options = {}) {
  if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('Label name is required and must be a non-empty string');
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name, labelListVisibility: options.labelListVisibility || 'labelShow',
      messageListVisibility: options.messageListVisibility || 'show'
    }
  });
  return { id: response.data.id, name: response.data.name, type: response.data.type };
}

async function createFilter(criteria, action) {
  if (!criteria || Object.keys(criteria).length === 0) throw new Error('Filter criteria is required and must not be empty');
  if (!action || Object.keys(action).length === 0) throw new Error('Filter action is required and must not be empty');
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const filterAction = {};
  if (action.addLabelIds) filterAction.addLabelIds = action.addLabelIds;
  if (action.removeLabelIds) filterAction.removeLabelIds = action.removeLabelIds;
  if (action.archive) filterAction.removeLabelIds = [...(filterAction.removeLabelIds || []), 'INBOX'];
  if (action.markRead) filterAction.removeLabelIds = [...(filterAction.removeLabelIds || []), 'UNREAD'];
  const response = await gmail.users.settings.filters.create({ userId: 'me', requestBody: { criteria, action: filterAction } });
  return { id: response.data.id, criteria: response.data.criteria, action: response.data.action };
}

async function listFilters() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const response = await gmail.users.settings.filters.list({ userId: 'me' });
  return response.data.filters || [];
}

async function addLabels(messageId, labelIds) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds: labelIds } });
}

async function removeLabels(messageId, labelIds) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: labelIds } });
}

async function markAsRead(messageId) { await removeLabels(messageId, ['UNREAD']); }
async function markAsUnread(messageId) { await addLabels(messageId, ['UNREAD']); }
async function archive(messageId) { await removeLabels(messageId, ['INBOX']); }

async function trash(messageId) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.trash({ userId: 'me', id: messageId });
}

async function batchModify(messageIds, modifications) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: { ids: messageIds, addLabelIds: modifications.addLabelIds || [], removeLabelIds: modifications.removeLabelIds || [] }
  });
}

function createMessage(to, subject, body, options = {}) {
  const lines = [`To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0'];
  if (options.cc) lines.push(`Cc: ${options.cc}`);
  if (options.bcc) lines.push(`Bcc: ${options.bcc}`);
  if (options.inReplyTo) { lines.push(`In-Reply-To: ${options.inReplyTo}`); lines.push(`References: ${options.inReplyTo}`); }
  if (options.html) { lines.push('Content-Type: text/html; charset=utf-8'); } else { lines.push('Content-Type: text/plain; charset=utf-8'); }
  lines.push('');
  lines.push(body);
  const message = lines.join('\r\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function extractBody(payload, options = {}) {
  const shouldStripHtml = options.stripHtml !== false;
  if (!payload) return '';
  if (payload.body?.data) {
    const content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (shouldStripHtml && payload.mimeType === 'text/html') return stripHtml(content);
    return content;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        return shouldStripHtml ? stripHtml(html) : html;
      }
    }
    for (const part of payload.parts) {
      if (part.parts) { const nested = extractBody(part, options); if (nested) return nested; }
    }
  }
  return '';
}

function extractAttachments(payload) {
  const attachments = [];
  if (!payload) return attachments;
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId });
      }
      if (part.parts) attachments.push(...extractAttachments(part));
    }
  }
  return attachments;
}

module.exports = {
  listMessages, getMessage, getThread, getThreadIdFromMessage, listLabels, listDrafts, listFilters,
  sendEmail, replyToThread, createDraft, sendDraft,
  addLabels, removeLabels, createLabel, markAsRead, markAsUnread, archive, trash, batchModify,
  createFilter, getGmailUrl, stripHtml
};
