#!/usr/bin/env node
/**
 * PM AI Starter Kit - Skills Index Generator
 *
 * Scans all skill directories and generates skills/_index.json
 * for routing and discovery.
 *
 * Usage:
 *   node scripts/generate-index.cjs
 *
 * Environment variables:
 *   SKILLS_ROOT - Skills directory (defaults to ./skills relative to cwd)
 */

const fs = require('fs');
const path = require('path');
const {
  getSkillsRoot,
  parseSkillFrontmatter,
  loadManifest,
  safeReadFile,
  safeWriteFile
} = require('./lib/migration-utils.cjs');

const CATEGORIES = ['core', 'experts', 'specialized', 'workflows', 'personas', 'utilities'];

function main() {
  const skillsRoot = getSkillsRoot();

  if (!fs.existsSync(skillsRoot)) {
    console.error(`Skills directory not found: ${skillsRoot}`);
    console.error('Run this from the repo root, or set SKILLS_ROOT env var.');
    process.exit(1);
  }

  const index = {
    version: "1.0",
    updated: new Date().toISOString().split('T')[0],
    description: "PM AI Skills Registry - Central index for routing and discovery",
    schema: {
      skill: {
        path: "Relative path to SKILL.md",
        description: "Brief description from SKILL.md frontmatter",
        category: "core|experts|specialized|workflows|personas|utilities",
        routing_keywords: "Keywords that trigger this skill",
        semantic_tags: "Capability tags for semantic matching",
        mcp_tools: "MCP integrations used",
        estimated_tokens: "Approximate context size"
      }
    },
    skills: {},
    categories: {},
    routing_index: {
      description: "Quick lookup by keyword for fast routing"
    }
  };

  for (const category of CATEGORIES) {
    const categoryDir = path.join(skillsRoot, category);
    const skills = [];

    if (!fs.existsSync(categoryDir)) {
      index.categories[category] = { description: `${category} skills`, skills: [] };
      continue;
    }

    const entries = fs.readdirSync(categoryDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(categoryDir, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');

      const { content, error: readError } = safeReadFile(skillMdPath);
      if (readError) {
        console.warn(`  Skipping ${entry.name}: ${readError}`);
        continue;
      }

      const { name, description } = parseSkillFrontmatter(content);

      const { manifest, error: manifestError } = loadManifest(skillDir);
      if (manifestError) {
        console.warn(`  Warning for ${entry.name}: ${manifestError}`);
      }
      const manifestData = manifest || {};

      const skillName = entry.name;
      skills.push(skillName);

      index.skills[skillName] = {
        path: `${category}/${skillName}/SKILL.md`,
        description: (description || '').substring(0, 200),
        category,
        routing_keywords: manifestData.routing?.keywords?.slice(0, 5) || [],
        semantic_tags: manifestData.routing?.semantic_tags?.slice(0, 5) || [],
        mcp_tools: manifestData.execution?.mcp_tools || [],
        estimated_tokens: manifestData.execution?.estimated_tokens || 2500
      };

      const keywords = manifestData.routing?.keywords || [];
      for (const keyword of keywords.slice(0, 3)) {
        if (!index.routing_index[keyword]) {
          index.routing_index[keyword] = [];
        }
        if (!index.routing_index[keyword].includes(skillName)) {
          index.routing_index[keyword].push(skillName);
        }
      }
    }

    const categoryDescriptions = {
      core: "Core product management skills",
      experts: "Expert personas for multi-perspective analysis",
      specialized: "Specialized tools (PDF, video, OCR, etc.)",
      workflows: "Multi-skill orchestration workflows",
      personas: "Customer personas for user testing",
      utilities: "System utilities and helpers"
    };

    index.categories[category] = {
      description: categoryDescriptions[category] || `${category} skills`,
      skills
    };
  }

  const indexPath = path.join(skillsRoot, '_index.json');
  const { error: writeError } = safeWriteFile(indexPath, JSON.stringify(index, null, 2));
  if (writeError) {
    console.error(`Error writing index: ${writeError}`);
    process.exit(1);
  }

  const totalSkills = Object.keys(index.skills).length;
  console.log(`\n=== INDEX GENERATED ===\n`);
  console.log(`Total skills: ${totalSkills}`);
  for (const [category, data] of Object.entries(index.categories)) {
    console.log(`  ${category}: ${data.skills.length}`);
  }
  console.log(`\nWritten to: ${indexPath}`);
}

main();
