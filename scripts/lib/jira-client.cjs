/**
 * Jira Client Library
 * 
 * Shared library for reliable Jira operations.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');



// Configuration from environment
const ATLASSIAN_URL = process.env.ATLASSIAN_URL || 'https://yourcompany.atlassian.net';
const JIRA_BROWSE_URL = `${ATLASSIAN_URL}/browse`;
const ATLASSIAN_EMAIL = process.env.ATLASSIAN_EMAIL;
const JIRA_API_KEY = process.env.JIRA_API_KEY || process.env.ATLASSIAN_API_TOKEN;
// Cloud ID is optional - only use cloud API routing if explicitly configured
// Do NOT hardcode a default - require explicit configuration
const ATLASSIAN_CLOUD_ID = process.env.ATLASSIAN_CLOUD_ID;

if (!ATLASSIAN_EMAIL || !JIRA_API_KEY) {
  // console.warn('Warning: ATLASSIAN_EMAIL and JIRA_API_KEY environment variables required for Jira client');
}

/**
 * Categories that require disaster recovery planning.
 * Epics with these labels or components auto-generate DR tickets.
 * All others skip DR unless explicitly requested with --with-dr flag.
 *
 * Categories are loaded from .ai/config/dr-categories.json if available,
 * otherwise falls back to hardcoded defaults.
 */
const DR_CONFIG_PATH = path.join(__dirname, '../../config/dr-categories.json');
let DR_REQUIRED_CATEGORIES;
try {
  DR_REQUIRED_CATEGORIES = JSON.parse(fs.readFileSync(DR_CONFIG_PATH, 'utf8'));
} catch (err) {
  // Fallback to hardcoded defaults if config missing
  DR_REQUIRED_CATEGORIES = {
    labels: [
      'payments', 'payment', 'billing', 'subscription', 'revenue',
      'auth', 'authentication', 'identity', 'login', 'oauth', 'sso',
      'infrastructure', 'infra', 'database', 'migration', 'backend',
      'data', 'data-pipeline', 'etl', 'sync', 'export', 'import',
      'security', 'encryption', 'compliance', 'pii', 'gdpr'
    ],
    components: [
      'Payments', 'Billing', 'Subscriptions',
      'Auth', 'Authentication', 'Identity', 'SSO',
      'Infrastructure', 'Platform', 'Backend', 'Database',
      'Data', 'Analytics', 'Pipeline',
      'Security', 'Compliance'
    ]
  };
}

/**
 * Check if an epic requires a DR ticket based on its labels/components.
 * @param {Object} options - Epic options with labels and components
 * @returns {boolean} True if DR ticket should be auto-created
 */
function epicRequiresDR(options = {}) {
  const labels = (options.labels || []).map(l => l.toLowerCase());
  const components = options.components || [];

  // Check labels (case-insensitive)
  const hasMatchingLabel = labels.some(label =>
    DR_REQUIRED_CATEGORIES.labels.includes(label)
  );

  // Check components (case-sensitive to match Jira)
  const hasMatchingComponent = components.some(comp =>
    DR_REQUIRED_CATEGORIES.components.includes(comp)
  );

  return hasMatchingLabel || hasMatchingComponent;
}

// Basic Auth header
const authHeader = 'Basic ' + Buffer.from(`${ATLASSIAN_EMAIL}:${JIRA_API_KEY}`).toString('base64');

/**
 * Generic HTTP request handler
 */
async function makeRequest(path, options = {}) {
  // For Jira API v3, use api.atlassian.com with cloud ID
  let baseUrl = ATLASSIAN_URL;
  let fullPath = path;
  
  if (ATLASSIAN_CLOUD_ID && path.startsWith('/rest/api/3/')) {
    baseUrl = 'https://api.atlassian.com';
    fullPath = `/ex/jira/${ATLASSIAN_CLOUD_ID}${path}`;
  }
  
  const url = new URL(fullPath, baseUrl);
  const protocol = url.protocol === 'https:' ? https : http;
  
  const requestOptions = {
    method: options.method || 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  return new Promise((resolve, reject) => {
    const req = protocol.request(url, requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
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
      req.destroy(new Error('Jira request timed out'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Parse description into ADF format
 * Handles: ADF object, JSON string (ADF), or plain text
 */
function parseDescriptionToADF(description) {
  // Check if already an ADF object
  if (typeof description === 'object' && description !== null && description.type === 'doc') {
    return description;
  }

  if (typeof description === 'string') {
    // Try to parse as JSON - might be ADF passed as string (common from CLI)
    const trimmed = description.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"type"') && trimmed.includes('"doc"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && parsed.type === 'doc' && parsed.version && parsed.content) {
          return parsed;
        }
      } catch (e) {
        // ADF-looking JSON failed to parse - warn loudly so we don't silently create garbled tickets
        console.error(`WARNING: Description looks like ADF JSON but failed to parse: ${e.message}`);
        console.error('TIP: Use --description-file <path> to pass ADF JSON from a file instead of CLI args');
        // Fall through to plain text
      }
    }

    // Plain text - convert to simple ADF
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: description }]
        }
      ]
    };
  }

  // Fallback for any other type
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: String(description || '') }]
      }
    ]
  };
}

/**
 * Jira API
 */
const jira = {
  /**
   * Create a new Jira issue
   * @param {string} projectKey - Project key (e.g., 'ALL')
   * @param {string} summary - Issue title
   * @param {string|Object} description - Issue description (plain text preferred, auto-converted to ADF)
   * @param {string} issueType - Issue type: 'Task', 'Bug', 'Story', 'Epic'
   * @param {Object} options - Optional fields:
   *   - components: string[] - e.g., ['Platform', 'Mobile'] (NOT objects!)
   *   - labels: string[] - e.g., ['iOS', 'cx_concern']
   *   - priority: string - 'Highest', 'High', 'Medium', 'Low', 'Lowest'
   *   - parent: { key: string } - for subtasks, e.g., { key: 'ALL-123' }
   * @returns {Promise<Object>} Created issue with key
   * 
   * @example
   * // Create a bug with components and labels
   * jira.createIssue('ALL', 'Title', 'Description', 'Bug', {
   *   components: ['Platform', 'Mobile'],  // strings, not { name: ... } objects!
   *   labels: ['iOS', 'cx_concern'],
   *   priority: 'High'
   * });
   */
  async createIssue(projectKey, summary, description, issueType = 'Task', options = {}) {
    const descriptionADF = parseDescriptionToADF(description);

    const fields = {
      project: { key: projectKey },
      summary,
      description: descriptionADF,
      issuetype: { name: issueType }
    };

    // Handle labels - expects array of strings: ['iOS', 'cx_concern']
    if (options.labels && options.labels.length > 0) {
      fields.labels = options.labels;
    }

    // Handle components - expects array of strings: ['Platform', 'Mobile']
    // This method converts strings to { name: ... } format required by API
    // Do NOT pass objects like [{ name: 'Platform' }] - pass strings only!
    if (options.components && options.components.length > 0) {
      fields.components = options.components.map(name => ({ name }));
    }

    // Handle priority (name string: "Highest", "High", "Medium", "Low", "Lowest")
    if (options.priority) {
      fields.priority = { name: options.priority };
    }

    // Spread any additional fields
    const { labels, components, priority, ...otherFields } = options;
    Object.assign(fields, otherFields);

    return makeRequest('/rest/api/3/issue', {
      method: 'POST',
      body: { fields }
    });
  },

  /**
   * Get issue by key
   * @param {string} issueKey - Issue key (e.g., 'ALL-123')
   * @param {Array<string>} fields - Optional fields to retrieve
   * @returns {Promise<Object>} Issue data
   */
  async getIssue(issueKey, fields = []) {
    const queryParams = fields.length > 0 ? `?fields=${fields.join(',')}` : '';
    return makeRequest(`/rest/api/3/issue/${issueKey}${queryParams}`);
  },

  /**
   * Update an existing issue
   * @param {string} issueKey - Issue key
   * @param {Object} fields - Fields to update (description can be plain text, ADF object, or JSON string)
   * @returns {Promise<void>}
   */
  async updateIssue(issueKey, fields) {
    // If description is being updated, parse it to ADF
    const processedFields = { ...fields };
    if (processedFields.description !== undefined) {
      processedFields.description = parseDescriptionToADF(processedFields.description);
    }

    return makeRequest(`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      body: { fields: processedFields }
    });
  },

  /**
   * Search issues using JQL
   * @param {string} jql - JQL query string
   * @param {Object} options - Search options (fields, maxResults, startAt)
   * @returns {Promise<Object>} Search results with issues array
   */
  async searchJQL(jql, options = {}) {
    const params = new URLSearchParams({
      jql,
      maxResults: options.maxResults || 50,
      startAt: options.startAt || 0,
      fields: options.fields ? options.fields.join(',') : 'summary,status,assignee,created,updated,priority,issuetype'
    });

    return makeRequest(`/rest/api/3/search/jql?${params.toString()}`);
  },

  /**
   * Get all projects accessible to the user
   * @returns {Promise<Array>} List of projects
   */
  async getProjects() {
    return makeRequest('/rest/api/3/project');
  },

  /**
   * Get issue types for a project
   * @param {string} projectKey - Project key
   * @returns {Promise<Array>} List of issue types
   */
  async getIssueTypes(projectKey) {
    return makeRequest(`/rest/api/3/project/${projectKey}/statuses`);
  },

  /**
   * Add comment to issue
   * @param {string} issueKey - Issue key
   * @param {string} comment - Comment text
   * @returns {Promise<Object>} Created comment
   */
  async addComment(issueKey, comment) {
    const body = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: comment }]
          }
        ]
      }
    };

    return makeRequest(`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      body
    });
  },

  /**
   * Get all comments for an issue
   * @param {string} issueKey - Issue key
   * @returns {Promise<Object>} Comments object with comments array
   */
  async getComments(issueKey) {
    return makeRequest(`/rest/api/3/issue/${issueKey}/comment`);
  },

  /**
   * Delete a comment
   * @param {string} issueKey - Issue key
   * @param {string} commentId - Comment ID
   * @returns {Promise<void>}
   */
  async deleteComment(issueKey, commentId) {
    return makeRequest(`/rest/api/3/issue/${issueKey}/comment/${commentId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Create epic
   * @param {string} projectKey - Project key
   * @param {string} summary - Epic title
   * @param {string} description - Epic description
   * @returns {Promise<Object>} Created epic
   */
  async createEpic(projectKey, summary, description) {
    return this.createIssue(projectKey, summary, description, 'Epic');
  },

  /**
   * Link issue to epic
   * @param {string} issueKey - Issue to link
   * @param {string} epicKey - Epic key
   * @returns {Promise<void>}
   */
  async linkToEpic(issueKey, epicKey) {
    return this.updateIssue(issueKey, {
      parent: { key: epicKey }
    });
  },

  /**
   * Delete an issue (used for rollback on failed operations)
   * @param {string} issueKey - Issue key to delete
   * @returns {Promise<void>}
   */
  async deleteIssue(issueKey) {
    return makeRequest(`/rest/api/3/issue/${issueKey}`, {
      method: 'DELETE'
    });
  },

  /**
   * Create epic with conditional Disaster Recovery sections
   *
   * For high-risk categories (payments, auth, infrastructure, data, security),
   * DR planning sections are automatically appended to the epic description.
   * Use forceDR option to include DR sections for other epics.
   *
   * @param {string} projectKey - Project key (e.g., 'ALL')
   * @param {string} summary - Epic title
   * @param {string} description - Epic description
   * @param {Object} [options={}] - Optional epic fields
   * @param {string[]} [options.labels] - Labels for the epic (case-insensitive matching)
   * @param {string[]} [options.components] - Components for the epic (case-sensitive matching)
   * @param {string} [options.priority] - Priority level
   * @param {boolean} [options.forceDR=false] - Force DR sections regardless of category
   * @returns {Promise<CreateEpicWithDRResult>} Result object
   *
   * @typedef {Object} CreateEpicWithDRResult
   * @property {string} epic - Epic issue key (e.g., "ALL-1000")
   * @property {boolean} hasDR - Whether DR sections were included
   * @property {string} epicUrl - Full URL to epic in Jira
   * @property {string} drReason - Reason: 'label:<name>', 'component:<name>', 'forced', or 'not_required'
   * @property {string} message - Human-readable summary message
   *
   * @throws {Error} If projectKey or summary is missing/invalid
   * @throws {Error} If epic creation fails
   *
   * @example
   * // Auto-DR based on labels - DR sections included in epic
   * const result = await jira.createEpicWithDR('ALL', 'Payment Retry Logic', 'desc', { labels: ['payments'] });
   * // Returns: { epic: 'ALL-1000', hasDR: true, drReason: 'label:payments', ... }
   *
   * @example
   * // Force DR with flag
   * const result = await jira.createEpicWithDR('ALL', 'UI Polish', 'desc', { forceDR: true });
   * // Returns: { epic: 'ALL-1000', hasDR: true, drReason: 'forced', ... }
   *
   * @example
   * // No DR for low-risk epics
   * const result = await jira.createEpicWithDR('ALL', 'Update Docs', 'desc', {});
   * // Returns: { epic: 'ALL-1000', hasDR: false, drReason: 'not_required', ... }
   */
  async createEpicWithDR(projectKey, summary, description, options = {}) {
    // Input validation
    if (!projectKey || typeof projectKey !== 'string') {
      throw new Error('projectKey is required and must be a string');
    }
    if (!summary || typeof summary !== 'string') {
      throw new Error('summary is required and must be a string');
    }
    if (options.forceDR !== undefined && typeof options.forceDR !== 'boolean') {
      throw new Error('forceDR must be a boolean');
    }

    const { forceDR, ...epicOptions } = options;

    // 1. Determine if DR sections are needed
    const needsDR = forceDR || epicRequiresDR(epicOptions);
    let drReason = 'not_required';

    if (forceDR) {
      drReason = 'forced';
    } else if (needsDR) {
      // Find which category matched
      const labels = (epicOptions.labels || []).map(l => l.toLowerCase());
      const components = epicOptions.components || [];
      const matchedLabel = labels.find(l => DR_REQUIRED_CATEGORIES.labels.includes(l));
      const matchedComponent = components.find(c => DR_REQUIRED_CATEGORIES.components.includes(c));
      drReason = matchedLabel ? `label:${matchedLabel}` : `component:${matchedComponent}`;
    }

    // 2. Build the epic description (with or without DR sections)
    const userDescriptionADF = parseDescriptionToADF(description);
    let finalDescription;

    if (needsDR) {
      // Append DR sections to user's description
      const drSections = [
        { type: 'rule' }, // Horizontal divider
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Disaster Recovery Plan' }]
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Key Question' }]
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'What happens if this fails?', marks: [{ type: 'strong' }] }
              ]
            }
          ]
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Engineers must answer this question with the product manager before implementation begins.' }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Required Sections' }]
        },
        {
          type: 'orderedList',
          attrs: { order: 1 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [
                { type: 'text', text: 'Failure Scenarios', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' - What can go wrong? List all failure modes.' }
              ]}]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [
                { type: 'text', text: 'Impact Assessment', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' - What is the blast radius? Users affected? Revenue impact?' }
              ]}]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [
                { type: 'text', text: 'Recovery Pipelines', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' - What pipelines/processes need to be built to handle failures?' }
              ]}]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [
                { type: 'text', text: 'Failover Strategy', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' - How do we fail over? Manual or automatic? RTO/RPO targets?' }
              ]}]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [
                { type: 'text', text: 'Testing Plan', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' - How will DR be tested before go-live?' }
              ]}]
            }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'DR Acceptance Criteria' }]
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[ ] All failure scenarios documented' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[ ] Recovery pipelines identified and tickets created' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[ ] DR test completed successfully' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[ ] PM sign-off on recovery procedures' }] }] }
          ]
        }
      ];

      finalDescription = {
        type: 'doc',
        version: 1,
        content: [...userDescriptionADF.content, ...drSections]
      };

      // Add DR label if not already present
      epicOptions.labels = epicOptions.labels || [];
      if (!epicOptions.labels.some(l => l.toLowerCase() === 'dr')) {
        epicOptions.labels.push('DR');
      }
    } else {
      finalDescription = userDescriptionADF;
    }

    // 3. Create the epic
    const epic = await this.createIssue(projectKey, summary, finalDescription, 'Epic', epicOptions);
    const epicKey = epic.key;

    return {
      epic: epicKey,
      hasDR: needsDR,
      epicUrl: `${JIRA_BROWSE_URL}/${epicKey}`,
      drReason,
      message: needsDR
        ? `Created epic ${epicKey} with DR sections (reason: ${drReason})`
        : `Created epic ${epicKey} (DR not required - no high-risk labels/components)`
    };
  }
};

module.exports = { jira, makeRequest, epicRequiresDR };

