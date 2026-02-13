// PM AI Starter Kit - jira-client.cjs
// See scripts/README.md for setup
/**
 * Jira Client Library
 *
 * Shared library for reliable Jira operations.
 * Includes rate limiting handling and ADF description parsing.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// Configuration from environment
const ATLASSIAN_URL = process.env.JIRA_BASE_URL || process.env.ATLASSIAN_URL || 'https://yourcompany.atlassian.net';
const JIRA_BROWSE_URL = `${ATLASSIAN_URL}/browse`;
const ATLASSIAN_EMAIL = process.env.ATLASSIAN_EMAIL;
const JIRA_API_KEY = process.env.JIRA_API_KEY || process.env.ATLASSIAN_API_TOKEN;
const ATLASSIAN_CLOUD_ID = process.env.ATLASSIAN_CLOUD_ID;

if (!ATLASSIAN_EMAIL || !JIRA_API_KEY) {
  // console.warn('Warning: ATLASSIAN_EMAIL and JIRA_API_KEY environment variables required for Jira client');
}

/**
 * Categories that require disaster recovery planning.
 * Epics with these labels or components auto-generate DR sections.
 */
const DR_REQUIRED_CATEGORIES = {
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

/**
 * Check if an epic requires a DR ticket based on its labels/components.
 */
function epicRequiresDR(options = {}) {
  const labels = (options.labels || []).map(l => l.toLowerCase());
  const components = options.components || [];

  const hasMatchingLabel = labels.some(label =>
    DR_REQUIRED_CATEGORIES.labels.includes(label)
  );

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
 * Parse description into ADF format
 * Handles: ADF object, JSON string (ADF), or plain text
 */
function parseDescriptionToADF(description) {
  if (typeof description === 'object' && description !== null && description.type === 'doc') {
    return description;
  }

  if (typeof description === 'string') {
    const trimmed = description.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"type"') && trimmed.includes('"doc"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && parsed.type === 'doc' && parsed.version && parsed.content) {
          return parsed;
        }
      } catch (e) {
        console.error(`WARNING: Description looks like ADF JSON but failed to parse: ${e.message}`);
        console.error('TIP: Use --description-file <path> to pass ADF JSON from a file instead of CLI args');
      }
    }

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
  async createIssue(projectKey, summary, description, issueType = 'Task', options = {}) {
    const descriptionADF = parseDescriptionToADF(description);

    const fields = {
      project: { key: projectKey },
      summary,
      description: descriptionADF,
      issuetype: { name: issueType }
    };

    if (options.labels && options.labels.length > 0) {
      fields.labels = options.labels;
    }

    if (options.components && options.components.length > 0) {
      fields.components = options.components.map(name => ({ name }));
    }

    if (options.priority) {
      fields.priority = { name: options.priority };
    }

    const { labels, components, priority, ...otherFields } = options;
    Object.assign(fields, otherFields);

    return makeRequest('/rest/api/3/issue', {
      method: 'POST',
      body: { fields }
    });
  },

  async getIssue(issueKey, fields = []) {
    const queryParams = fields.length > 0 ? `?fields=${fields.join(',')}` : '';
    return makeRequest(`/rest/api/3/issue/${issueKey}${queryParams}`);
  },

  async updateIssue(issueKey, fields) {
    const processedFields = { ...fields };
    if (processedFields.description !== undefined) {
      processedFields.description = parseDescriptionToADF(processedFields.description);
    }

    return makeRequest(`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      body: { fields: processedFields }
    });
  },

  async searchJQL(jql, options = {}) {
    const params = new URLSearchParams({
      jql,
      maxResults: options.maxResults || 50,
      startAt: options.startAt || 0,
      fields: options.fields ? options.fields.join(',') : 'summary,status,assignee,created,updated,priority,issuetype'
    });

    return makeRequest(`/rest/api/3/search/jql?${params.toString()}`);
  },

  async getProjects() {
    return makeRequest('/rest/api/3/project');
  },

  async getIssueTypes(projectKey) {
    return makeRequest(`/rest/api/3/project/${projectKey}/statuses`);
  },

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

  async getComments(issueKey) {
    return makeRequest(`/rest/api/3/issue/${issueKey}/comment`);
  },

  async deleteComment(issueKey, commentId) {
    return makeRequest(`/rest/api/3/issue/${issueKey}/comment/${commentId}`, {
      method: 'DELETE'
    });
  },

  async createEpic(projectKey, summary, description) {
    return this.createIssue(projectKey, summary, description, 'Epic');
  },

  async linkToEpic(issueKey, epicKey) {
    return this.updateIssue(issueKey, {
      parent: { key: epicKey }
    });
  },

  async deleteIssue(issueKey) {
    return makeRequest(`/rest/api/3/issue/${issueKey}`, {
      method: 'DELETE'
    });
  },

  async createEpicWithDR(projectKey, summary, description, options = {}) {
    if (!projectKey || typeof projectKey !== 'string') {
      throw new Error('projectKey is required and must be a string');
    }
    if (!summary || typeof summary !== 'string') {
      throw new Error('summary is required and must be a string');
    }

    const { forceDR, ...epicOptions } = options;

    const needsDR = forceDR || epicRequiresDR(epicOptions);
    let drReason = 'not_required';

    if (forceDR) {
      drReason = 'forced';
    } else if (needsDR) {
      const labels = (epicOptions.labels || []).map(l => l.toLowerCase());
      const components = epicOptions.components || [];
      const matchedLabel = labels.find(l => DR_REQUIRED_CATEGORIES.labels.includes(l));
      const matchedComponent = components.find(c => DR_REQUIRED_CATEGORIES.components.includes(c));
      drReason = matchedLabel ? `label:${matchedLabel}` : `component:${matchedComponent}`;
    }

    const userDescriptionADF = parseDescriptionToADF(description);
    let finalDescription;

    if (needsDR) {
      const drSections = [
        { type: 'rule' },
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
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Failure Scenarios', marks: [{ type: 'strong' }] }, { type: 'text', text: ' - What can go wrong? List all failure modes.' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Impact Assessment', marks: [{ type: 'strong' }] }, { type: 'text', text: ' - What is the blast radius? Users affected? Revenue impact?' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Recovery Pipelines', marks: [{ type: 'strong' }] }, { type: 'text', text: ' - What pipelines/processes need to be built to handle failures?' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Failover Strategy', marks: [{ type: 'strong' }] }, { type: 'text', text: ' - How do we fail over? Manual or automatic? RTO/RPO targets?' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Testing Plan', marks: [{ type: 'strong' }] }, { type: 'text', text: ' - How will DR be tested before go-live?' }] }] }
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

      epicOptions.labels = epicOptions.labels || [];
      if (!epicOptions.labels.some(l => l.toLowerCase() === 'dr')) {
        epicOptions.labels.push('DR');
      }
    } else {
      finalDescription = userDescriptionADF;
    }

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
