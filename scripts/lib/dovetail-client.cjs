// PM AI Starter Kit - dovetail-client.cjs
// See scripts/README.md for setup
/**
 * Dovetail Client Library
 *
 * Shared library for Dovetail API operations.
 * Supports all Dovetail REST API endpoints including projects, insights,
 * tags, highlights, notes, and AI-powered search.
 */

const https = require('https');
const { URL } = require('url');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Configuration from environment
const DOVETAIL_BASE_URL = process.env.DOVETAIL_BASE_URL || 'https://dovetail.com/api/v1/';
const DOVETAIL_API_TOKEN = process.env.DOVETAIL_API_TOKEN;

if (!DOVETAIL_API_TOKEN) {
  // console.warn('Warning: DOVETAIL_API_TOKEN environment variable required for Dovetail client');
}

// Bearer token header
const authHeader = `Bearer ${DOVETAIL_API_TOKEN}`;

/**
 * Generic HTTP request handler with rate limit handling
 */
async function makeRequest(path, options = {}) {
  const url = new URL(path, DOVETAIL_BASE_URL);

  if (options.queryParams) {
    Object.entries(options.queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
  }

  const requestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: options.method || 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Dovetail-PM-Client/1.0',
      ...options.headers
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 429) {
          const retryAfter = res.headers['retry-after'] || '60';
          const error = new Error(`Rate limited. Retry after ${retryAfter} seconds`);
          error.statusCode = 429;
          error.retryAfter = parseInt(retryAfter);
          error.body = data;
          return reject(error);
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve(parsed);
          } catch (e) {
            resolve(data);
          }
        } else {
          const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
          error.statusCode = res.statusCode;
          error.body = data;
          reject(error);
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Dovetail API Client
 */
const dovetail = {
  async getTokenInfo() { return makeRequest('token/info'); },

  // Projects
  async listProjects(options = {}) { return makeRequest('projects', { queryParams: options }); },
  async getProject(projectId) { return makeRequest(`projects/${projectId}`); },
  async createProject(data) { return makeRequest('projects', { method: 'POST', body: data }); },
  async updateProject(projectId, data) { return makeRequest(`/projects/${projectId}`, { method: 'PATCH', body: data }); },
  async deleteProject(projectId) { return makeRequest(`/projects/${projectId}`, { method: 'DELETE' }); },

  // Insights
  async listInsights(options = {}) { return makeRequest('insights', { queryParams: options }); },
  async getInsight(insightId) { return makeRequest(`insights/${insightId}`); },
  async createInsight(data) { return makeRequest('insights', { method: 'POST', body: data }); },
  async updateInsight(insightId, data) { return makeRequest(`/insights/${insightId}`, { method: 'PATCH', body: data }); },
  async deleteInsight(insightId) { return makeRequest(`/insights/${insightId}`, { method: 'DELETE' }); },
  async importInsights(projectId, fileData) { return makeRequest(`/projects/${projectId}/insights/import`, { method: 'POST', body: fileData, headers: { 'Content-Type': 'multipart/form-data' } }); },

  // Notes
  async listNotes(options = {}) { return makeRequest('notes', { queryParams: options }); },
  async getNote(noteId) { return makeRequest(`notes/${noteId}`); },
  async createNote(data) { return makeRequest('notes', { method: 'POST', body: data }); },
  async updateNote(noteId, data) { return makeRequest(`/notes/${noteId}`, { method: 'PATCH', body: data }); },
  async deleteNote(noteId) { return makeRequest(`/notes/${noteId}`, { method: 'DELETE' }); },
  async exportNotes(options = {}) { return makeRequest('notes/export', { queryParams: options }); },
  async importNotes(projectId, fileData) { return makeRequest(`/projects/${projectId}/notes/import`, { method: 'POST', body: fileData, headers: { 'Content-Type': 'multipart/form-data' } }); },

  // Tags
  async listTags(options = {}) { return makeRequest('tags', { queryParams: options }); },

  // Highlights
  async listHighlights(options = {}) { return makeRequest('highlights', { queryParams: options }); },
  async getHighlight(highlightId) { return makeRequest(`highlights/${highlightId}`); },

  // Contacts
  async listContacts(options = {}) { return makeRequest('contacts', { queryParams: options }); },
  async getContact(contactId) { return makeRequest(`contacts/${contactId}`); },
  async createContact(data) { return makeRequest('contacts', { method: 'POST', body: data }); },
  async updateContact(contactId, data) { return makeRequest(`/contacts/${contactId}`, { method: 'PATCH', body: data }); },
  async deleteContact(contactId) { return makeRequest(`/contacts/${contactId}`, { method: 'DELETE' }); },

  // Channels
  async createChannel(data) { return makeRequest('channels', { method: 'POST', body: data }); },
  async updateChannel(channelId, data) { return makeRequest(`/channels/${channelId}`, { method: 'PATCH', body: data }); },
  async deleteChannel(channelId) { return makeRequest(`/channels/${channelId}`, { method: 'DELETE' }); },
  async addDataToChannel(channelId, data) { return makeRequest(`/channels/${channelId}/data`, { method: 'POST', body: data }); },

  // Data
  async exportData(options = {}) { return makeRequest('data/export', { queryParams: options }); },
  async importData(projectId, fileData) { return makeRequest(`/projects/${projectId}/data/import`, { method: 'POST', body: fileData, headers: { 'Content-Type': 'multipart/form-data' } }); },

  // Search & AI
  async search(data) { return makeRequest('search', { method: 'POST', body: data }); },
  async summarize(data) { return makeRequest('summarize', { method: 'POST', body: data }); },

  // Files
  async getFile(fileId) { return makeRequest(`files/${fileId}`); }
};

module.exports = { dovetail, makeRequest };
