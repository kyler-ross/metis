/**
 * Confluence Page Templates
 * 
 * Reusable templates for creating consistent Confluence pages.
 * These templates follow Cloaked PM design standards.
 */

/**
 * Generate a Product Area Hub page
 * 
 * Creates a well-structured hub with:
 * - Info box header with description
 * - Search + tag reference row
 * - Two-column PRD/Experiment sections (Recently Updated | Recently Created)
 * - Three-column Other Documents (Research | Meetings | Process)
 * 
 * @param {Object} options - Hub configuration
 * @param {string} options.name - Hub name (e.g., "Growth & Funnels Hub")
 * @param {string} options.description - Short description
 * @param {string[]} options.tags - Tags to filter content by
 * @param {string} options.searchPlaceholder - Placeholder text for search box
 * @returns {string} Confluence storage format HTML
 * 
 * @example
 * const content = createHubPage({
 *   name: 'Call Guard Hub',
 *   description: 'Spam call filtering and call protection.',
 *   tags: ['call-guard'],
 *   searchPlaceholder: 'Search Call Guard docs...'
 * });
 */
function createHubPage({ name, description, tags, searchPlaceholder }) {
  const tagFilter = tags.map(t => `label = "${t}"`).join(' or ');
  const tagFilterCQL = tags.length > 1 ? `(${tagFilter})` : tagFilter;
  const tagsDisplay = tags.map(t => `<code>${t}</code>`).join(', ');

  return `<ac:layout>
<ac:layout-section ac:type="fixed-width" ac:breakout-mode="default">
<ac:layout-cell>
<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body>
<p><strong>${name}</strong> — ${description}</p>
</ac:rich-text-body></ac:structured-macro>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="two_equal" ac:breakout-mode="wide" ac:breakout-width="760">
<ac:layout-cell>
<ac:structured-macro ac:name="livesearch" ac:schema-version="1">
<ac:parameter ac:name="spaceKey"><ri:space ri:space-key="PM" /></ac:parameter>
<ac:parameter ac:name="additional">page</ac:parameter>
<ac:parameter ac:name="placeholder">${searchPlaceholder}</ac:parameter>
</ac:structured-macro>
</ac:layout-cell>
<ac:layout-cell>
<p><strong>Tags:</strong> ${tagsDisplay}</p>
<p><a href="https://yourcompany.atlassian.net/wiki/search?text=labels%3D${tags[0]}&amp;spaces=PM">View All as Table →</a></p>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="fixed-width" ac:breakout-mode="default">
<ac:layout-cell>
<h2>📋 PRDs</h2>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="two_equal" ac:breakout-mode="wide" ac:breakout-width="760">
<ac:layout-cell>
${createContentByLabel({ title: 'Recently Updated', cql: `label = "prd" and ${tagFilterCQL} and type = "page"`, sort: 'modified', max: 10 })}
</ac:layout-cell>
<ac:layout-cell>
${createContentByLabel({ title: 'Recently Created', cql: `label = "prd" and ${tagFilterCQL} and type = "page"`, sort: 'creation', max: 10 })}
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="fixed-width" ac:breakout-mode="default">
<ac:layout-cell>
<h2>🧪 Experiments</h2>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="two_equal" ac:breakout-mode="wide" ac:breakout-width="760">
<ac:layout-cell>
${createContentByLabel({ title: 'Recently Updated', cql: `label = "experiment" and ${tagFilterCQL} and type = "page"`, sort: 'modified', max: 10 })}
</ac:layout-cell>
<ac:layout-cell>
${createContentByLabel({ title: 'Recently Created', cql: `label = "experiment" and ${tagFilterCQL} and type = "page"`, sort: 'creation', max: 10 })}
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="fixed-width" ac:breakout-mode="default">
<ac:layout-cell>
<h2>📚 Other Documents</h2>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="three_equal" ac:breakout-mode="wide" ac:breakout-width="960">
<ac:layout-cell>
${createContentByLabel({ title: '🔬 Research', cql: `label = "research" and ${tagFilterCQL} and type = "page"`, sort: 'modified', max: 5 })}
</ac:layout-cell>
<ac:layout-cell>
${createContentByLabel({ title: '📝 Meetings', cql: `label = "meeting" and ${tagFilterCQL} and type = "page"`, sort: 'modified', max: 5 })}
</ac:layout-cell>
<ac:layout-cell>
${createContentByLabel({ title: '⚙️ Process', cql: `label = "process" and ${tagFilterCQL} and type = "page"`, sort: 'modified', max: 5 })}
</ac:layout-cell>
</ac:layout-section>
</ac:layout>`;
}

/**
 * Generate a Content By Label macro
 * 
 * @param {Object} options
 * @param {string} options.title - Section title
 * @param {string} options.cql - CQL query
 * @param {string} options.sort - Sort field ('modified', 'creation', 'title')
 * @param {number} options.max - Max results (default: 10)
 * @param {boolean} options.showLabels - Show labels on entries (default: false)
 * @returns {string} Confluence macro XML
 */
function createContentByLabel({ title, cql, sort = 'modified', max = 10, showLabels = false }) {
  return `<ac:structured-macro ac:name="contentbylabel" ac:schema-version="4" data-layout="default">
<ac:parameter ac:name="showLabels">${showLabels}</ac:parameter>
<ac:parameter ac:name="max">${max}</ac:parameter>
<ac:parameter ac:name="showSpace">false</ac:parameter>
<ac:parameter ac:name="sort">${sort}</ac:parameter>
<ac:parameter ac:name="reverse">true</ac:parameter>
<ac:parameter ac:name="title">${title}</ac:parameter>
<ac:parameter ac:name="cql">${cql}</ac:parameter>
</ac:structured-macro>`;
}

/**
 * Generate a Directory page (like PRD Directory or Experiment Directory)
 * 
 * @param {Object} options
 * @param {string} options.name - Directory name
 * @param {string} options.description - Short description
 * @param {string} options.label - Primary label for content (e.g., 'prd', 'experiment')
 * @param {string} options.ancestorId - Page ID for ancestor filter
 * @param {string} options.searchPlaceholder - Search placeholder text
 * @param {Array} options.contributors - Array of {name, accountId} for contributor sections
 * @returns {string} Confluence storage format HTML
 */
function createDirectoryPage({ name, description, label, ancestorId, searchPlaceholder, contributors = [] }) {
  const contributorSections = contributors.map(c => `
<h3><strong>${c.name}</strong></h3>
${createContentByLabel({ 
  title: '', 
  cql: `label = "${label}" and creator.accountid = "${c.accountId}"`,
  sort: 'creation',
  max: 5
})}`).join('\n');

  return `<ac:layout>
<ac:layout-section ac:type="fixed-width" ac:breakout-mode="default">
<ac:layout-cell>
<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body>
<p><strong>${name}</strong> — ${description}</p>
</ac:rich-text-body></ac:structured-macro>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="two_equal" ac:breakout-mode="wide" ac:breakout-width="760">
<ac:layout-cell>
<ac:structured-macro ac:name="livesearch" ac:schema-version="1">
<ac:parameter ac:name="spaceKey"><ri:space ri:space-key="PM" /></ac:parameter>
<ac:parameter ac:name="additional">page</ac:parameter>
<ac:parameter ac:name="placeholder">${searchPlaceholder}</ac:parameter>
</ac:structured-macro>
</ac:layout-cell>
<ac:layout-cell>
<p><a href="https://yourcompany.atlassian.net/wiki/search?text=labels%3D${label}&amp;spaces=PM">View All as Table →</a></p>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="fixed-width" ac:breakout-mode="default">
<ac:layout-cell>
<h2>Recent Updates</h2>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="two_equal" ac:breakout-mode="wide" ac:breakout-width="760">
<ac:layout-cell>
${createContentByLabel({ 
  title: 'Recently Created', 
  cql: `label = "${label}" and ancestor = "${ancestorId}" and type = "page"`,
  sort: 'creation',
  max: 10
})}
</ac:layout-cell>
<ac:layout-cell>
${createContentByLabel({ 
  title: 'Recently Edited', 
  cql: `label = "${label}" and ancestor = "${ancestorId}" and type = "page"`,
  sort: 'modified',
  max: 10
})}
</ac:layout-cell>
</ac:layout-section>

${contributors.length > 0 ? `
<ac:layout-section ac:type="fixed-width" ac:breakout-mode="default">
<ac:layout-cell>
<h2>Contributors</h2>
</ac:layout-cell>
</ac:layout-section>

<ac:layout-section ac:type="two_equal" ac:breakout-mode="wide" ac:breakout-width="760">
<ac:layout-cell>
${contributorSections}
</ac:layout-cell>
</ac:layout-section>` : ''}
</ac:layout>`;
}

/**
 * Generate an info box macro
 * 
 * @param {string} content - HTML content for the info box
 * @param {string} type - Box type: 'info', 'note', 'warning', 'tip'
 * @returns {string} Confluence macro XML
 */
function createInfoBox(content, type = 'info') {
  return `<ac:structured-macro ac:name="${type}" ac:schema-version="1">
<ac:rich-text-body>${content}</ac:rich-text-body>
</ac:structured-macro>`;
}

/**
 * Generate a live search macro
 * 
 * @param {string} spaceKey - Space key to search in
 * @param {string} placeholder - Placeholder text
 * @returns {string} Confluence macro XML
 */
function createLiveSearch(spaceKey, placeholder) {
  return `<ac:structured-macro ac:name="livesearch" ac:schema-version="1">
<ac:parameter ac:name="spaceKey"><ri:space ri:space-key="${spaceKey}" /></ac:parameter>
<ac:parameter ac:name="additional">page</ac:parameter>
<ac:parameter ac:name="placeholder">${placeholder}</ac:parameter>
</ac:structured-macro>`;
}

/**
 * Generate a page link
 * 
 * @param {string} title - Page title to link to
 * @param {string} spaceKey - Space key (default: 'PM')
 * @returns {string} Confluence link XML
 */
function createPageLink(title, spaceKey = 'PM') {
  return `<ac:link><ri:page ri:content-title="${title}" ri:space-key="${spaceKey}" /></ac:link>`;
}

module.exports = {
  createHubPage,
  createDirectoryPage,
  createContentByLabel,
  createInfoBox,
  createLiveSearch,
  createPageLink
};

