// PM AI Starter Kit - context-loader.cjs
#!/usr/bin/env node
/**
 * Context Loader Script
 *
 * Implements progressive context loading for agents based on manifest configuration.
 * Loads context files based on:
 *   - always: Files always loaded for this agent
 *   - conditional: Files loaded when task text matches keyword patterns
 *   - lazy: Files available but not auto-loaded (agent must request)
 *
 * Usage:
 *   node scripts/context-loader.cjs <agent-name> "<task-text>"
 *   node scripts/context-loader.cjs product-coach "help me design a feature"
 *   node scripts/context-loader.cjs --list     # List all agents with context_loading
 *   node scripts/context-loader.cjs --stats    # Show context loading statistics
 *
 * Output:
 *   Prints loaded context to stdout (for piping into agent prompts)
 *   Logs loading decisions to stderr
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'config/agent-manifest.json');
const KNOWLEDGE_PATH = path.join(ROOT, 'knowledge');

// Allowed base directories for file access (security: prevent path traversal)
const ALLOWED_BASES = [
  ROOT,
  KNOWLEDGE_PATH,
  path.join(ROOT, 'config'),
  path.join(ROOT, '.claude'),
];

// Token estimation (4 chars ~ 1 token)
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// Log to stderr (so stdout is clean for piping)
function log(msg) {
  process.stderr.write(`[context-loader] ${msg}\n`);
}

// Validate path is within allowed directories (security: prevent path traversal)
// Uses realpath to resolve symlinks and prevent bypass via symlink chains
function isPathAllowed(fullPath) {
  try {
    const resolved = path.resolve(fullPath);
    // Use realpathSync to resolve symlinks - prevents symlink-based traversal
    const realPath = fs.realpathSync(resolved);

    return ALLOWED_BASES.some(base => {
      try {
        const realBase = fs.realpathSync(base);
        const relative = path.relative(realBase, realPath);
        // Path is allowed if:
        // 1. relative path exists (not empty)
        // 2. doesn't start with '..' (not escaping base)
        // 3. is not absolute (would indicate different root)
        return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
      } catch {
        return false;
      }
    });
  } catch {
    // If realpath fails (file doesn't exist, permission denied), deny access
    return false;
  }
}

// Read file content with error handling and path validation
function readFile(filePath) {
  try {
    const fullPath = filePath.startsWith('/') ? filePath : path.join(ROOT, filePath);
    const resolved = path.resolve(fullPath);

    // Security: Validate path is within allowed directories
    if (!isPathAllowed(resolved)) {
      // Sanitize paths in error messages to prevent information disclosure
      const sanitizedPath = path.basename(filePath);
      log(`Access denied (path traversal blocked): ${sanitizedPath}`);
      return null;
    }

    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      // For directories, concatenate all markdown/json files
      let content = '';
      const files = fs.readdirSync(resolved);

      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.json')) {
          const childPath = path.join(resolved, file);
          // Security: Validate child paths too
          if (!isPathAllowed(childPath)) continue;
          content += `\n\n--- ${file} ---\n\n`;
          content += fs.readFileSync(childPath, 'utf8');
        }
      }
      return content;
    } else {
      return fs.readFileSync(resolved, 'utf8');
    }
  } catch (err) {
    // Log file read failures for debugging (sanitize path for security)
    const sanitizedPath = path.basename(filePath);
    log(`Failed to read file ${sanitizedPath}: ${err.code || 'unknown error'}`);
    return null;
  }
}

// Resolve knowledge file path
function resolveKnowledgePath(ref) {
  if (!ref.startsWith('.') && !ref.startsWith('/')) {
    return path.join(KNOWLEDGE_PATH, ref);
  }
  return path.join(ROOT, ref);
}

// Check if task text matches any keyword pattern
function matchesPattern(taskText, pattern) {
  if (!taskText || !pattern) return false;

  const keywords = pattern.split('|').map(k => k.trim().toLowerCase());
  const lowerTask = taskText.toLowerCase();

  return keywords.some(keyword => lowerTask.includes(keyword));
}

// Load context for an agent based on task
function loadContext(agentName, taskText) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const agent = manifest.agents[agentName];

  if (!agent) {
    log(`Agent not found: ${agentName}`);
    process.exit(1);
  }

  const contextConfig = agent.context_loading;

  // Fallback to legacy required_context if no context_loading
  if (!contextConfig) {
    log(`No context_loading config, falling back to required_context`);
    const requiredContext = agent.required_context || [];
    let totalTokens = 0;
    let content = '';

    for (const ref of requiredContext) {
      const filePath = resolveKnowledgePath(ref);
      const fileContent = readFile(filePath);
      if (fileContent) {
        const tokens = estimateTokens(fileContent);
        totalTokens += tokens;
        content += `\n\n<!-- ${ref} (${tokens} tokens) -->\n\n${fileContent}`;
        log(`Loaded: ${ref} (${tokens} tokens)`);
      }
    }

    log(`Total: ${totalTokens} tokens from ${requiredContext.length} files (legacy mode)`);
    return content;
  }

  // Progressive loading with bounded token budget
  // Validate token_budget is a number before using
  const rawBudget = contextConfig.token_budget;
  const parsedBudget = typeof rawBudget === 'number' && !isNaN(rawBudget) ? rawBudget : 10000;
  const tokenBudget = Math.max(1000, Math.min(100000, parsedBudget)); // Bounds: 1k-100k
  let totalTokens = 0;
  let content = '';
  const loadedFiles = [];
  const skippedFiles = [];

  // 1. Load "always" files
  const alwaysFiles = contextConfig.always || [];
  for (const ref of alwaysFiles) {
    const filePath = resolveKnowledgePath(ref);
    const fileContent = readFile(filePath);
    if (fileContent) {
      const tokens = estimateTokens(fileContent);
      if (totalTokens + tokens <= tokenBudget) {
        totalTokens += tokens;
        content += `\n\n<!-- ALWAYS: ${ref} (${tokens} tokens) -->\n\n${fileContent}`;
        loadedFiles.push({ ref, tokens, type: 'always' });
      } else {
        skippedFiles.push({ ref, tokens, reason: 'budget exceeded' });
      }
    }
  }

  // 2. Load "conditional" files based on task matching
  const conditionalFiles = contextConfig.conditional || {};
  for (const [pattern, refs] of Object.entries(conditionalFiles)) {
    if (matchesPattern(taskText, pattern)) {
      const refList = Array.isArray(refs) ? refs : [refs];
      for (const ref of refList) {
        const filePath = resolveKnowledgePath(ref);
        const fileContent = readFile(filePath);
        if (fileContent) {
          const tokens = estimateTokens(fileContent);
          if (totalTokens + tokens <= tokenBudget) {
            totalTokens += tokens;
            content += `\n\n<!-- CONDITIONAL (${pattern}): ${ref} (${tokens} tokens) -->\n\n${fileContent}`;
            loadedFiles.push({ ref, tokens, type: 'conditional', pattern });
          } else {
            skippedFiles.push({ ref, tokens, reason: 'budget exceeded' });
          }
        }
      }
    }
  }

  // Log summary
  log(`Agent: ${agentName}`);
  log(`Task: "${taskText?.substring(0, 50)}..."`);
  log(`Token budget: ${tokenBudget}`);
  log(`Loaded: ${loadedFiles.length} files, ${totalTokens} tokens`);

  for (const f of loadedFiles) {
    log(`  + ${f.type}: ${f.ref} (${f.tokens} tokens)`);
  }

  if (skippedFiles.length > 0) {
    log(`Skipped (budget): ${skippedFiles.length} files`);
    for (const f of skippedFiles) {
      log(`  - ${f.ref} (${f.tokens} tokens)`);
    }
  }

  // List lazy files (available on demand)
  const lazyFiles = contextConfig.lazy || [];
  if (lazyFiles.length > 0) {
    log(`Available on demand (lazy): ${lazyFiles.join(', ')}`);
  }

  return content;
}

// List all agents with context_loading
function listAgents() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const agents = manifest.agents || {};

  console.log('\n=== Agents with Progressive Context Loading ===\n');

  const withLoading = [];
  const withoutLoading = [];

  for (const [name, config] of Object.entries(agents)) {
    if (config.context_loading) {
      withLoading.push({
        name,
        budget: config.context_loading.token_budget || 10000,
        always: (config.context_loading.always || []).length,
        conditional: Object.keys(config.context_loading.conditional || {}).length,
        lazy: (config.context_loading.lazy || []).length
      });
    } else if (config.required_context && config.required_context.length > 0) {
      withoutLoading.push({
        name,
        files: config.required_context.length
      });
    }
  }

  console.log('Progressive loading enabled:');
  for (const a of withLoading) {
    console.log(`  ${a.name}: budget=${a.budget}, always=${a.always}, conditional=${a.conditional}, lazy=${a.lazy}`);
  }

  console.log(`\nLegacy required_context (${withoutLoading.length} agents):`);
  for (const a of withoutLoading) {
    console.log(`  ${a.name}: ${a.files} files`);
  }
}

// Show statistics
function showStats() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const agents = manifest.agents || {};

  let totalWithProgressive = 0;
  let totalWithLegacy = 0;
  let totalWithoutContext = 0;

  for (const [name, config] of Object.entries(agents)) {
    if (config.context_loading) {
      totalWithProgressive++;
    } else if (config.required_context && config.required_context.length > 0) {
      totalWithLegacy++;
    } else {
      totalWithoutContext++;
    }
  }

  console.log('\n=== Context Loading Statistics ===\n');
  console.log(`Total agents: ${Object.keys(agents).length}`);
  console.log(`Progressive loading: ${totalWithProgressive}`);
  console.log(`Legacy required_context: ${totalWithLegacy}`);
  console.log(`No context config: ${totalWithoutContext}`);
  console.log(`\nMigration progress: ${Math.round(totalWithProgressive / (totalWithProgressive + totalWithLegacy) * 100)}%`);
}

// Main
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    listAgents();
    return;
  }

  if (args.includes('--stats')) {
    showStats();
    return;
  }

  if (args.length < 2) {
    console.log('Usage: node context-loader.cjs <agent-name> "<task-text>"');
    console.log('       node context-loader.cjs --list');
    console.log('       node context-loader.cjs --stats');
    process.exit(1);
  }

  const agentName = args[0];
  const taskText = args[1];

  const content = loadContext(agentName, taskText);
  console.log(content);
}

main();
