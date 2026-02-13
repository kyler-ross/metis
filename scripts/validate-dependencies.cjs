// PM AI Starter Kit - validate-dependencies.cjs
#!/usr/bin/env node
/**
 * Dependency Validator for Agent Manifest
 *
 * Validates that all required_context files referenced in agent-manifest.json
 * actually exist in the knowledge base.
 *
 * Usage:
 *   node scripts/validate-dependencies.cjs [--fix]
 *
 * Options:
 *   --fix    Remove missing files from required_context (updates manifest)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { track, trackComplete, flush } = require('./lib/telemetry.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'config/agent-manifest.json');
const KNOWLEDGE_DIR = path.join(REPO_ROOT, 'knowledge');

function loadManifest() {
  const content = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(content);
}

// Special keywords that aren't actual file paths
const SPECIAL_KEYWORDS = ['all', 'none', 'minimal'];

// Files that live in other directories (not knowledge)
const CONFIG_FILES = {
  'agent-manifest.json': 'config/agent-manifest.json',
  'knowledge-index.json': 'config/knowledge-index.json',
  'team-members.json': 'config/team-members.json'
};

function validateDependencies(manifest, options = {}) {
  const results = {
    total_agents: 0,
    agents_with_deps: 0,
    total_deps: 0,
    valid_deps: 0,
    special_keywords: 0,
    missing_deps: [],
    agents_missing_deps: {}
  };

  const agents = manifest.agents || {};

  for (const [agentName, agentConfig] of Object.entries(agents)) {
    results.total_agents++;

    const requiredContext = agentConfig.required_context || [];
    if (requiredContext.length === 0) continue;

    results.agents_with_deps++;

    for (const dep of requiredContext) {
      results.total_deps++;

      // Handle special keywords
      if (SPECIAL_KEYWORDS.includes(dep.toLowerCase())) {
        results.valid_deps++;
        results.special_keywords++;
        continue;
      }

      // Handle config files
      if (CONFIG_FILES[dep]) {
        const configPath = path.join(REPO_ROOT, CONFIG_FILES[dep]);
        if (fs.existsSync(configPath)) {
          results.valid_deps++;
          continue;
        }
      }

      // Handle both direct filenames and paths
      const depPath = dep.startsWith('.')
        ? path.join(REPO_ROOT, dep)
        : path.join(KNOWLEDGE_DIR, dep);

      if (fs.existsSync(depPath)) {
        results.valid_deps++;
      } else {
        results.missing_deps.push({
          agent: agentName,
          file: dep,
          expected_path: depPath
        });

        if (!results.agents_missing_deps[agentName]) {
          results.agents_missing_deps[agentName] = [];
        }
        results.agents_missing_deps[agentName].push(dep);
      }
    }
  }

  return results;
}

function fixMissingDeps(manifest, missingByAgent) {
  let fixed = 0;

  for (const [agentName, missingFiles] of Object.entries(missingByAgent)) {
    const agent = manifest.agents[agentName];
    if (!agent || !agent.required_context) continue;

    const originalCount = agent.required_context.length;
    agent.required_context = agent.required_context.filter(
      dep => !missingFiles.includes(dep)
    );
    fixed += originalCount - agent.required_context.length;
  }

  return fixed;
}

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  track('pm_ai_validate_dependencies_start', { shouldFix });

  console.log('Validating agent dependencies...\n');

  const manifest = loadManifest();
  const results = validateDependencies(manifest);

  // Summary
  console.log(`Summary:`);
  console.log(`   Total agents: ${results.total_agents}`);
  console.log(`   Agents with dependencies: ${results.agents_with_deps}`);
  console.log(`   Total dependencies: ${results.total_deps}`);
  console.log(`   Valid dependencies: ${results.valid_deps}`);
  console.log(`   Missing dependencies: ${results.missing_deps.length}`);
  console.log('');

  if (results.missing_deps.length === 0) {
    console.log('All dependencies are valid!\n');
    trackComplete('pm_ai_validate_dependencies_complete', startTime, {
      total_agents: results.total_agents,
      total_deps: results.total_deps,
      missing: 0,
      success: true
    });
    await flush();
    process.exit(0);
  }

  // Report missing
  console.log('Missing dependencies:\n');

  const groupedByAgent = {};
  for (const dep of results.missing_deps) {
    if (!groupedByAgent[dep.agent]) {
      groupedByAgent[dep.agent] = [];
    }
    groupedByAgent[dep.agent].push(dep.file);
  }

  for (const [agent, files] of Object.entries(groupedByAgent)) {
    console.log(`   ${agent}:`);
    for (const file of files) {
      console.log(`      - ${file}`);
    }
  }
  console.log('');

  if (shouldFix) {
    console.log('Fixing manifest...\n');
    const fixedCount = fixMissingDeps(manifest, results.agents_missing_deps);

    // Update manifest
    manifest.updated = new Date().toISOString().split('T')[0];
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

    console.log(`Removed ${fixedCount} missing dependencies from manifest`);
    console.log(`   Manifest updated: ${MANIFEST_PATH}\n`);

    trackComplete('pm_ai_validate_dependencies_complete', startTime, {
      total_agents: results.total_agents,
      total_deps: results.total_deps,
      missing: results.missing_deps.length,
      fixed: fixedCount,
      success: true
    });
    await flush();
  } else {
    console.log('Run with --fix to remove missing dependencies from manifest\n');

    trackComplete('pm_ai_validate_dependencies_complete', startTime, {
      total_agents: results.total_agents,
      total_deps: results.total_deps,
      missing: results.missing_deps.length,
      success: false
    });
    await flush();
    process.exit(1);
  }
}

main();
