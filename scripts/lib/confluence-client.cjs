/**
 * Atlassian/Confluence Client Library
 * 
 * Shared library for reliable Confluence operations.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');



// Configuration from environment
const ATLASSIAN_URL = process.env.ATLASSIAN_URL || 'https://yourcompany.atlassian.net';
const ATLASSIAN_EMAIL = process.env.ATLASSIAN_EMAIL;
const JIRA_API_KEY = process.env.JIRA_API_KEY || process.env.ATLASSIAN_API_TOKEN;

if (!ATLASSIAN_EMAIL || !JIRA_API_KEY) {
  // Don't crash on load, but warn
  // console.warn('Warning: ATLASSIAN_EMAIL and JIRA_API_KEY/ATLASSIAN_API_TOKEN environment variables required for Atlassian client');
}

// Basic Auth header
const authHeader = 'Basic ' + Buffer.from(`${ATLASSIAN_EMAIL}:${JIRA_API_KEY}`).toString('base64');

/**
 * Generic HTTP request handler
 */
async function makeRequest(path, options = {}) {
  const url = new URL(path, ATLASSIAN_URL);
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
    
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * Confluence API
 */
const confluence = {
  /**
   * Get page by ID
   * @param {string} pageId - Page ID
   * @param {Array<string>} expand - Optional expansions (body.storage, version, etc.)
   * @returns {Promise<Object>} Page data
   */
  async getPage(pageId, expand = ['body.storage', 'version']) {
    const expandParam = expand.length > 0 ? `?expand=${expand.join(',')}` : '';
    return makeRequest(`/wiki/rest/api/content/${pageId}${expandParam}`);
  },

  /**
   * Get specific version of a page
   * @param {string} pageId - Page ID
   * @param {number} versionNumber - Version number
   * @returns {Promise<Object>} Page version data
   */
  async getVersion(pageId, versionNumber) {
    return makeRequest(`/wiki/rest/api/content/${pageId}?status=historical&version=${versionNumber}&expand=body.storage,history,version`);
  },

  /**
   * Create a new Confluence page
   * @param {string} spaceKey - Space key (e.g., 'TEAM')
   * @param {string} title - Page title
   * @param {string} content - Page content (HTML or storage format)
   * @param {string} parentId - Optional parent page ID
   * @returns {Promise<Object>} Created page
   */
  async createPage(spaceKey, title, content, parentId = null) {
    const body = {
      type: 'page',
      title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: content,
          representation: 'storage'
        }
      }
    };

    if (parentId) {
      body.ancestors = [{ id: parentId }];
    }

    return makeRequest('/wiki/rest/api/content', {
      method: 'POST',
      body
    });
  },

  /**
   * Update an existing page
   * @param {string} pageId - Page ID
   * @param {string} title - New title
   * @param {string} content - New content
   * @param {number} version - Current version number (required for updates)
   * @returns {Promise<Object>} Updated page
   */
  async updatePage(pageId, title, content, version) {
    const body = {
      version: {
        number: version + 1
      },
      title,
      type: 'page',
      body: {
        storage: {
          value: content,
          representation: 'storage'
        }
      }
    };

    return makeRequest(`/wiki/rest/api/content/${pageId}`, {
      method: 'PUT',
      body
    });
  },

  /**
   * Move a page to a new parent
   * @param {string} pageId - Page ID to move
   * @param {string} newParentId - New parent page ID
   * @param {number} version - Current version number
   * @returns {Promise<Object>} Moved page
   */
  async movePage(pageId, newParentId, version) {
    // First get the current page to preserve title and content
    const page = await this.getPage(pageId);
    
    const body = {
      version: {
        number: version + 1
      },
      type: 'page',
      title: page.title,
      ancestors: [{ id: newParentId }],
      body: {
        storage: {
          value: page.body?.storage?.value || '',
          representation: 'storage'
        }
      }
    };

    return makeRequest(`/wiki/rest/api/content/${pageId}`, {
      method: 'PUT',
      body
    });
  },

  /**
   * Search Confluence using CQL
   * @param {string} cql - CQL query string
   * @param {Object} options - Search options (limit, start, expand)
   * @returns {Promise<Object>} Search results
   */
  async searchCQL(cql, options = {}) {
    const params = new URLSearchParams({
      cql,
      limit: options.limit || 25,
      start: options.start || 0,
      expand: options.expand || 'body.storage,version'
    });

    return makeRequest(`/wiki/rest/api/content/search?${params.toString()}`);
  },

  /**
   * Get all spaces
   * @param {Object} options - Query options (limit, start, type)
   * @returns {Promise<Object>} Spaces list
   */
  async getSpaces(options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 25,
      start: options.start || 0,
      type: options.type || 'global'
    });

    return makeRequest(`/wiki/rest/api/space?${params.toString()}`);
  },

  /**
   * Get space by key
   * @param {string} spaceKey - Space key
   * @returns {Promise<Object>} Space data
   */
  async getSpace(spaceKey) {
    return makeRequest(`/wiki/rest/api/space/${spaceKey}`);
  },

  /**
   * Get pages in a space
   * @param {string} spaceKey - Space key
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Pages list
   */
  async getPagesInSpace(spaceKey, options = {}) {
    const params = new URLSearchParams({
      spaceKey,
      limit: options.limit || 25,
      start: options.start || 0,
      expand: 'body.storage,version'
    });

    return makeRequest(`/wiki/rest/api/content?${params.toString()}`);
  },

  /**
   * Delete a page
   * @param {string} pageId - Page ID
   * @returns {Promise<void>}
   */
  async deletePage(pageId) {
    return makeRequest(`/wiki/rest/api/content/${pageId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Fetch next page of results using cursor URL
   * @param {string} nextUrl - The relative next URL from _links.next
   * @returns {Promise<Object>} Next page of results
   */
  async fetchNextPage(nextUrl) {
    // nextUrl is relative like /rest/api/content/search?cursor=...
    return makeRequest(`/wiki${nextUrl}`);
  },

  /**
   * Add labels to a page
   * @param {string} pageId - Page ID
   * @param {Array<string>} labels - Labels to add
   * @returns {Promise<Object>} Result
   */
  async addLabels(pageId, labels) {
    const body = labels.map(name => ({ prefix: 'global', name }));
    return makeRequest(`/wiki/rest/api/content/${pageId}/label`, {
      method: 'POST',
      body
    });
  },

  /**
   * Remove a label from a page
   * @param {string} pageId - Page ID
   * @param {string} label - Label to remove
   * @returns {Promise<void>}
   */
  async removeLabel(pageId, label) {
    return makeRequest(`/wiki/rest/api/content/${pageId}/label/${encodeURIComponent(label)}`, {
      method: 'DELETE'
    });
  },

  /**
   * Get child pages of a page
   * @param {string} pageId - Parent page ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Child pages
   */
  async getChildren(pageId, options = {}) {
    const params = new URLSearchParams({
      limit: options.limit || 25,
      start: options.start || 0,
      expand: 'body.storage,version'
    });
    return makeRequest(`/wiki/rest/api/content/${pageId}/child/page?${params.toString()}`);
  },

  /**
   * Get all descendants of a page recursively
   * @param {string} pageId - Parent page ID
   * @param {Object} options - Options { expandLabels: true, maxDepth: Infinity }
   * @returns {Promise<Array>} Array of {id, title, labels, version, depth}
   */
  async getAllDescendants(pageId, options = {}) {
    const { expandLabels = true, maxDepth = Infinity } = options;
    const allChildren = [];
    
    const recurse = async (pId, depth = 0) => {
      if (depth > maxDepth) return;
      
      const children = await this.getChildren(pId, { limit: 100 });
      for (const child of (children.results || [])) {
        const expand = expandLabels ? ['metadata.labels', 'version'] : ['version'];
        const page = await this.getPage(child.id, expand);
        const labels = expandLabels 
          ? (page.metadata?.labels?.results || []).map(l => l.name)
          : [];
        
        allChildren.push({
          id: child.id,
          title: child.title,
          labels,
          version: page.version?.number || 1,
          depth
        });
        
        await recurse(child.id, depth + 1);
      }
    };
    
    await recurse(pageId);
    return allChildren;
  },

  /**
   * Search all pages matching CQL (handles pagination automatically)
   * @param {string} cql - CQL query
   * @param {Object} options - Options { expand, maxResults }
   * @returns {Promise<Array>} All matching pages
   */
  async searchAllCQL(cql, options = {}) {
    const { expand = 'body.storage,version', maxResults = 1000 } = options;
    const allResults = [];
    let start = 0;
    const limit = 100;

    while (allResults.length < maxResults) {
      const results = await this.searchCQL(cql, { limit, start, expand });
      allResults.push(...(results.results || []));
      
      if (!results._links?.next || (results.results || []).length < limit) {
        break;
      }
      start += limit;
    }

    return allResults;
  }
};

/**
 * Batch operation utilities
 */
const batchUtils = {
  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Run batch operations with rate limiting and progress reporting
   * @param {Array} items - Items to process
   * @param {Function} operation - Async function(item, index) to run on each
   * @param {Object} options - { delayMs, onProgress, onError, label }
   * @returns {Promise<{success: number, errors: Array}>}
   */
  async runBatch(items, operation, options = {}) {
    const { 
      delayMs = 300, 
      onProgress = null, 
      onError = null,
      label = 'Processing'
    } = options;

    let success = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (onProgress) {
        onProgress(i + 1, items.length, item);
      } else {
        process.stdout.write(`\r   ${label} [${i + 1}/${items.length}]...    `);
      }

      try {
        await operation(item, i);
        success++;
      } catch (error) {
        errors.push({ item, error: error.message });
        if (onError) {
          onError(item, error);
        } else {
          console.log(`\n   ❌ Failed: ${error.message}`);
        }
      }

      if (delayMs > 0 && i < items.length - 1) {
        await this.sleep(delayMs);
      }
    }

    if (!onProgress) {
      console.log(`\n   Done: ✅ ${success}, ❌ ${errors.length}`);
    }

    return { success, errors };
  }
};

// Export
module.exports = { confluence, makeRequest, batchUtils };

