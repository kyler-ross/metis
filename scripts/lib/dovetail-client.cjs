/**
 * Dovetail Client Library
 *
 * Shared library for Dovetail API operations.
 * Supports all Dovetail REST API endpoints including projects, insights, tags, highlights, notes, and search.
 */

const https = require('https');
const { URL } = require('url');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

  // Add query params if provided
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

        // Handle rate limiting
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
            resolve(data); // Return raw if not JSON
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

    req.setTimeout(30000, () => {
      req.destroy(new Error('Dovetail request timed out'));
    });

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
  /**
   * Token Info - Get information about the current token
   * @returns {Promise<Object>} Token information
   */
  async getTokenInfo() {
    return makeRequest('token/info');
  },

  // ============ PROJECTS ============

  /**
   * List all projects
   * @param {Object} options - Pagination and filter options
   *   - limit: number - Max results per page (default 100)
   *   - offset: number - Starting position
   *   - sort: string - Sort field and direction (e.g., 'created_at:desc')
   * @returns {Promise<Object>} Projects list with pagination
   */
  async listProjects(options = {}) {
    return makeRequest('projects', { queryParams: options });
  },

  /**
   * Get a single project by ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Project details
   */
  async getProject(projectId) {
    return makeRequest(`projects/${projectId}`);
  },

  /**
   * Create a new project
   * @param {Object} data - Project data
   *   - name: string (required) - Project name
   *   - description: string - Project description
   * @returns {Promise<Object>} Created project
   */
  async createProject(data) {
    return makeRequest('projects', {
      method: 'POST',
      body: data
    });
  },

  /**
   * Update a project
   * @param {string} projectId - Project ID
   * @param {Object} data - Updated project data
   * @returns {Promise<Object>} Updated project
   */
  async updateProject(projectId, data) {
    return makeRequest(`/projects/${projectId}`, {
      method: 'PATCH',
      body: data
    });
  },

  /**
   * Delete a project
   * @param {string} projectId - Project ID
   * @returns {Promise<void>}
   */
  async deleteProject(projectId) {
    return makeRequest(`/projects/${projectId}`, {
      method: 'DELETE'
    });
  },

  // ============ INSIGHTS ============

  /**
   * List all insights
   * @param {Object} options - Filter and pagination options
   *   - project_id: string - Filter by project
   *   - limit: number - Max results
   *   - offset: number - Starting position
   *   - sort: string - Sort field
   * @returns {Promise<Object>} Insights list
   */
  async listInsights(options = {}) {
    return makeRequest('insights', { queryParams: options });
  },

  /**
   * Get a single insight by ID
   * @param {string} insightId - Insight ID
   * @returns {Promise<Object>} Insight details
   */
  async getInsight(insightId) {
    return makeRequest(`insights/${insightId}`);
  },

  /**
   * Create a new insight
   * @param {Object} data - Insight data
   *   - title: string (required)
   *   - description: string
   *   - project_id: string
   *   - tags: string[]
   * @returns {Promise<Object>} Created insight
   */
  async createInsight(data) {
    return makeRequest('insights', {
      method: 'POST',
      body: data
    });
  },

  /**
   * Update an insight
   * @param {string} insightId - Insight ID
   * @param {Object} data - Updated insight data
   * @returns {Promise<Object>} Updated insight
   */
  async updateInsight(insightId, data) {
    return makeRequest(`/insights/${insightId}`, {
      method: 'PATCH',
      body: data
    });
  },

  /**
   * Delete an insight
   * @param {string} insightId - Insight ID
   * @returns {Promise<void>}
   */
  async deleteInsight(insightId) {
    return makeRequest(`/insights/${insightId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Import insights from file
   * @param {string} projectId - Project ID
   * @param {Object} fileData - File upload data
   * @returns {Promise<Object>} Import result
   */
  async importInsights(projectId, fileData) {
    return makeRequest(`/projects/${projectId}/insights/import`, {
      method: 'POST',
      body: fileData,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // ============ NOTES ============

  /**
   * List all notes
   * @param {Object} options - Filter and pagination options
   *   - project_id: string - Filter by project
   *   - limit: number
   *   - offset: number
   * @returns {Promise<Object>} Notes list
   */
  async listNotes(options = {}) {
    return makeRequest('notes', { queryParams: options });
  },

  /**
   * Get a single note by ID
   * @param {string} noteId - Note ID
   * @returns {Promise<Object>} Note details
   */
  async getNote(noteId) {
    return makeRequest(`notes/${noteId}`);
  },

  /**
   * Create a new note
   * @param {Object} data - Note data
   *   - title: string (required)
   *   - content: string (required)
   *   - project_id: string
   * @returns {Promise<Object>} Created note
   */
  async createNote(data) {
    return makeRequest('notes', {
      method: 'POST',
      body: data
    });
  },

  /**
   * Update a note
   * @param {string} noteId - Note ID
   * @param {Object} data - Updated note data
   * @returns {Promise<Object>} Updated note
   */
  async updateNote(noteId, data) {
    return makeRequest(`/notes/${noteId}`, {
      method: 'PATCH',
      body: data
    });
  },

  /**
   * Delete a note
   * @param {string} noteId - Note ID
   * @returns {Promise<void>}
   */
  async deleteNote(noteId) {
    return makeRequest(`/notes/${noteId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Export notes
   * @param {Object} options - Export options
   *   - project_id: string
   *   - format: string - 'csv', 'json', etc.
   * @returns {Promise<Object>} Export data
   */
  async exportNotes(options = {}) {
    return makeRequest('notes/export', { queryParams: options });
  },

  /**
   * Import notes from file
   * @param {string} projectId - Project ID
   * @param {Object} fileData - File upload data
   * @returns {Promise<Object>} Import result
   */
  async importNotes(projectId, fileData) {
    return makeRequest(`/projects/${projectId}/notes/import`, {
      method: 'POST',
      body: fileData,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // ============ TAGS ============

  /**
   * List all available tags
   * @param {Object} options - Filter options
   *   - project_id: string - Filter by project
   * @returns {Promise<Object>} Tags list
   */
  async listTags(options = {}) {
    return makeRequest('tags', { queryParams: options });
  },

  // ============ HIGHLIGHTS ============

  /**
   * List highlights
   * @param {Object} options - Filter and pagination options
   *   - project_id: string
   *   - note_id: string
   *   - limit: number
   *   - offset: number
   * @returns {Promise<Object>} Highlights list
   */
  async listHighlights(options = {}) {
    return makeRequest('highlights', { queryParams: options });
  },

  /**
   * Get a single highlight by ID
   * @param {string} highlightId - Highlight ID
   * @returns {Promise<Object>} Highlight details
   */
  async getHighlight(highlightId) {
    return makeRequest(`highlights/${highlightId}`);
  },

  // ============ CONTACTS ============

  /**
   * List all contacts
   * @param {Object} options - Filter and pagination options
   *   - limit: number
   *   - offset: number
   * @returns {Promise<Object>} Contacts list
   */
  async listContacts(options = {}) {
    return makeRequest('contacts', { queryParams: options });
  },

  /**
   * Get a single contact by ID
   * @param {string} contactId - Contact ID
   * @returns {Promise<Object>} Contact details
   */
  async getContact(contactId) {
    return makeRequest(`contacts/${contactId}`);
  },

  /**
   * Create a new contact
   * @param {Object} data - Contact data
   *   - name: string (required)
   *   - email: string
   *   - company: string
   * @returns {Promise<Object>} Created contact
   */
  async createContact(data) {
    return makeRequest('contacts', {
      method: 'POST',
      body: data
    });
  },

  /**
   * Update a contact
   * @param {string} contactId - Contact ID
   * @param {Object} data - Updated contact data
   * @returns {Promise<Object>} Updated contact
   */
  async updateContact(contactId, data) {
    return makeRequest(`/contacts/${contactId}`, {
      method: 'PATCH',
      body: data
    });
  },

  /**
   * Delete a contact
   * @param {string} contactId - Contact ID
   * @returns {Promise<void>}
   */
  async deleteContact(contactId) {
    return makeRequest(`/contacts/${contactId}`, {
      method: 'DELETE'
    });
  },

  // ============ CHANNELS ============

  /**
   * Create a channel
   * @param {Object} data - Channel data
   *   - name: string (required)
   *   - project_id: string (required)
   * @returns {Promise<Object>} Created channel
   */
  async createChannel(data) {
    return makeRequest('channels', {
      method: 'POST',
      body: data
    });
  },

  /**
   * Update a channel
   * @param {string} channelId - Channel ID
   * @param {Object} data - Updated channel data
   * @returns {Promise<Object>} Updated channel
   */
  async updateChannel(channelId, data) {
    return makeRequest(`/channels/${channelId}`, {
      method: 'PATCH',
      body: data
    });
  },

  /**
   * Delete a channel
   * @param {string} channelId - Channel ID
   * @returns {Promise<void>}
   */
  async deleteChannel(channelId) {
    return makeRequest(`/channels/${channelId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Add data point to channel
   * @param {string} channelId - Channel ID
   * @param {Object} data - Data point data
   * @returns {Promise<Object>} Result
   */
  async addDataToChannel(channelId, data) {
    return makeRequest(`/channels/${channelId}/data`, {
      method: 'POST',
      body: data
    });
  },

  // ============ DATA ============

  /**
   * Export data
   * @param {Object} options - Export options
   *   - project_id: string
   *   - format: string - Export format
   * @returns {Promise<Object>} Export data
   */
  async exportData(options = {}) {
    return makeRequest('data/export', { queryParams: options });
  },

  /**
   * Import data from file
   * @param {string} projectId - Project ID
   * @param {Object} fileData - File upload data
   * @returns {Promise<Object>} Import result
   */
  async importData(projectId, fileData) {
    return makeRequest(`/projects/${projectId}/data/import`, {
      method: 'POST',
      body: fileData,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // ============ SEARCH & AI ============

  /**
   * Magic Search - AI-powered search across all content
   * @param {Object} data - Search parameters
   *   - query: string (required) - Search query
   *   - project_id: string - Limit to project
   *   - filters: Object - Additional filters
   * @returns {Promise<Object>} Search results
   */
  async search(data) {
    return makeRequest('search', {
      method: 'POST',
      body: data
    });
  },

  /**
   * Magic Summarize - AI-powered summarization
   * @param {Object} data - Summarization parameters
   *   - content: string[] (required) - Content to summarize
   *   - style: string - Summary style
   *   - length: string - 'short', 'medium', 'long'
   * @returns {Promise<Object>} Summary result
   */
  async summarize(data) {
    return makeRequest('summarize', {
      method: 'POST',
      body: data
    });
  },

  // ============ FILES ============

  /**
   * Get file by ID
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File data
   */
  async getFile(fileId) {
    return makeRequest(`files/${fileId}`);
  }
};

module.exports = { dovetail, makeRequest };
