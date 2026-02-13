/**
 * PM AI Starter Kit - Migration Utilities
 * Shared utilities for skill index generation and validation
 */

const fs = require('fs');
const path = require('path');

/**
 * Get the skills root directory
 * Uses SKILLS_ROOT env var or defaults to ./skills relative to cwd
 */
function getSkillsRoot() {
  return process.env.SKILLS_ROOT || path.join(process.cwd(), 'skills');
}

/**
 * Parse YAML frontmatter from markdown content
 *
 * @param {string} content - The markdown file content
 * @returns {{ name: string, description: string }} Parsed frontmatter
 */
function parseSkillFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { name: '', description: '' };
  }

  const normalizedContent = content.replace(/\r\n/g, '\n');
  const match = normalizedContent.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { name: '', description: '' };
  }

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  const descMatch = frontmatter.match(/description:\s*(.+)/);

  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : ''
  };
}

/**
 * Safely read a file with error handling
 *
 * @param {string} filePath - Path to the file
 * @returns {{ content: string|null, error: string|null }}
 */
function safeReadFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { content: null, error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { content, error: null };
  } catch (e) {
    return { content: null, error: `Failed to read ${filePath}: ${e.message}` };
  }
}

/**
 * Safely write a file with error handling
 *
 * @param {string} filePath - Path to the file
 * @param {string} content - Content to write
 * @returns {{ success: boolean, error: string|null }}
 */
function safeWriteFile(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: `Failed to write ${filePath}: ${e.message}` };
  }
}

/**
 * Safely parse JSON with error handling
 *
 * @param {string} jsonString - JSON string to parse
 * @param {string} context - Context for error messages
 * @returns {{ data: object|null, error: string|null }}
 */
function safeParseJson(jsonString, context = 'JSON') {
  try {
    const data = JSON.parse(jsonString);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: `Invalid JSON in ${context}: ${e.message}` };
  }
}

/**
 * Load manifest.json from a skill directory
 *
 * @param {string} skillDir - Path to the skill directory
 * @returns {{ manifest: object|null, error: string|null }}
 */
function loadManifest(skillDir) {
  const manifestPath = path.join(skillDir, 'references', 'manifest.json');

  const { content, error: readError } = safeReadFile(manifestPath);
  if (readError) {
    return { manifest: null, error: readError };
  }

  const { data, error: parseError } = safeParseJson(content, manifestPath);
  if (parseError) {
    return { manifest: null, error: parseError };
  }

  return { manifest: data, error: null };
}

module.exports = {
  getSkillsRoot,
  parseSkillFrontmatter,
  safeReadFile,
  safeWriteFile,
  safeParseJson,
  loadManifest
};
