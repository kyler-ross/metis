#!/usr/bin/env node
/**
 * experiment-validator.cjs - Validate and post-process experiment JSON files
 *
 * Modes:
 *   --all              Validate all experiment files
 *   --validate <file>  Validate a single file
 *   --fix              Auto-fix what can be fixed (status, schema version, scaffolding)
 *   --post-process <f> Validate + restructure after analysis pipeline output
 *
 * Usage:
 *   node .ai/scripts/experiment-validator.cjs --all
 *   node .ai/scripts/experiment-validator.cjs --validate .ai/knowledge/experiments/checkout/counter-display.json
 *   node .ai/scripts/experiment-validator.cjs --fix
 *   node .ai/scripts/experiment-validator.cjs --post-process .ai/knowledge/experiments/checkout/new-experiment.json
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { run } = require('./lib/script-runner.cjs');

const EXPERIMENTS_DIR = path.join(__dirname, '..', 'knowledge', 'experiments');

// Standard sibling section keys that must NOT be nested inside deep_analysis
const SIBLING_KEYS = [
  'code_evidence',
  'funnel_analysis',
  'external_research',
  'unexplored_metrics',
  'cohort_analysis',
  'root_cause',
  'recommendations'
];

// Metadata-only keys allowed inside deep_analysis
const DA_METADATA_KEYS = [
  'performed_at', 'performed_by', 'phases_completed',
  'quality_tier', 'schema_version', 'analysis_version',
  'analyzed_date', 'analyzed_by'
];

// Key mappings for non-standard names found in monolithic files
const KEY_MAPPINGS = {
  'external_research_synthesis': 'external_research',
  'external_research_validation': 'external_research',
  'funnel_deep_dive': 'funnel_analysis',
  'root_cause_hypothesis': 'root_cause',
  'root_cause_analysis': 'root_cause',
  'cohort_analysis_recommendations': 'cohort_analysis',
  'sql_queries': 'cohort_analysis',
  'sql_queries_documentation': 'cohort_analysis',
  'sql_query_templates': 'cohort_analysis'
};

const VALID_STATUSES = [
  'concluded_won', 'concluded_lost', 'concluded_inconclusive',
  'stopped_early', 'invalid', 'running', 'code_only',
  'draft', 'archived', 'not_started'
];

const CONCLUDED_STATUSES = [
  'concluded_won', 'concluded_lost', 'concluded_inconclusive', 'stopped_early'
];

// ─── Helpers ──────────────────────────────────────────────

function findExperimentFiles() {
  const files = [];
  const categories = fs.readdirSync(EXPERIMENTS_DIR).filter(d => {
    const fp = path.join(EXPERIMENTS_DIR, d);
    return fs.statSync(fp).isDirectory() && !d.startsWith('_');
  });
  for (const cat of categories) {
    const catDir = path.join(EXPERIMENTS_DIR, cat);
    const jsons = fs.readdirSync(catDir).filter(f => f.endsWith('.json'));
    for (const j of jsons) {
      files.push(path.join(catDir, j));
    }
  }
  return files;
}

function readExperiment(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeExperiment(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function relPath(filePath) {
  return path.relative(process.cwd(), filePath);
}

// ─── Validation ───────────────────────────────────────────

function validateFile(filePath, data) {
  const issues = [];
  const warnings = [];
  const rel = relPath(filePath);

  // Required fields
  if (!data.experiment_id) issues.push(`${rel}: missing required field 'experiment_id'`);
  if (!data.canonical_name) issues.push(`${rel}: missing required field 'canonical_name'`);
  // category can be top-level or in taxonomy.category
  if (!data.category && !data.taxonomy?.category) {
    issues.push(`${rel}: missing required field 'category' (not found at top-level or taxonomy.category)`);
  }
  if (!data.status) issues.push(`${rel}: missing required field 'status'`);

  // Status validation
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    issues.push(`${rel}: invalid status '${data.status}' (valid: ${VALID_STATUSES.join(', ')})`);
  }

  // Primary KPI validation (REQUIRED for all experiments)
  const hasPrimaryKPI = data.metrics?.primary?.length > 0 &&
                        data.metrics.primary[0]?.name;
  if (!hasPrimaryKPI) {
    issues.push(`${rel}: MISSING PRIMARY KPI - metrics.primary[0].name is required`);
  }

  // Baseline validation for concluded experiments (REQUIRED)
  const isConcluded = CONCLUDED_STATUSES.includes(data.status);
  if (isConcluded) {
    const hasBaseline = data.results?.baseline_value !== undefined &&
                        data.results?.baseline_value !== null;
    const hasAlternateBaseline = data.results?.conversion_rates?.control !== undefined ||
                        data.results?.control_conversion_rate !== undefined ||
                        data.results?.variant_results?.control?.conversion_rate !== undefined;
    // Allow null baseline if explicitly flagged as unavailable
    const baselineUnavailableFlags = ['baseline_unavailable_inconclusive', 'baseline_estimated', 'baseline_not_documented'];
    const hasBaselineUnavailableFlag = data.results?.data_quality_flags?.some(f =>
      baselineUnavailableFlags.some(flag => f.includes(flag) || f.includes('unavailable'))
    );
    if (!hasBaseline && !hasAlternateBaseline && !hasBaselineUnavailableFlag) {
      issues.push(`${rel}: MISSING BASELINE - concluded experiment requires results.baseline_value`);
    }
    if (hasBaseline && !data.results?.baseline_unit) {
      warnings.push(`${rel}: has baseline_value but missing baseline_unit (should be "percent", "count", or "rate")`);
    }
  }

  // Running experiments should also have baselines if they have results
  if (data.status === 'running' && data.results?.lift_percentage !== undefined) {
    const hasBaseline = data.results?.baseline_value !== undefined &&
                        data.results?.baseline_value !== null;
    if (!hasBaseline) {
      warnings.push(`${rel}: running experiment with lift_percentage but no baseline_value`);
    }
  }

  // PR links validation
  if (isConcluded && !data.identification?.pr_urls?.length && !data.identification?.commit_shas?.length) {
    warnings.push(`${rel}: concluded experiment missing PR/commit links - run experiment-normalize-baseline.cjs (without --skip-prs)`);
  }

  // Monolithic deep_analysis detection
  if (data.deep_analysis) {
    const daKeys = Object.keys(data.deep_analysis);
    const nestedSiblings = daKeys.filter(k => SIBLING_KEYS.includes(k));
    const mappedSiblings = daKeys.filter(k => KEY_MAPPINGS[k]);

    if (nestedSiblings.length > 0) {
      issues.push(`${rel}: MONOLITHIC - deep_analysis contains sibling keys that should be top-level: [${nestedSiblings.join(', ')}]`);
    }
    if (mappedSiblings.length > 0) {
      issues.push(`${rel}: MONOLITHIC - deep_analysis contains non-standard keys needing extraction: [${mappedSiblings.join(', ')}]`);
    }

    // Check for oversized deep_analysis (>5KB suggests nested content)
    const daSize = JSON.stringify(data.deep_analysis).length;
    if (daSize > 5000 && nestedSiblings.length === 0 && mappedSiblings.length === 0) {
      warnings.push(`${rel}: deep_analysis is ${(daSize / 1024).toFixed(1)}KB - may contain non-standard nested content`);
    }
  }

  // Check sibling sections exist for deep-analyzed files
  if (data.deep_analysis) {
    const missingSiblings = SIBLING_KEYS.filter(k => !data[k]);
    if (missingSiblings.length > 0 && missingSiblings.length < SIBLING_KEYS.length) {
      warnings.push(`${rel}: partial sibling sections - missing: [${missingSiblings.join(', ')}]`);
    }
  }

  // Recommendations should have implemented field
  if (Array.isArray(data.recommendations)) {
    const withoutImpl = data.recommendations.filter(r => typeof r === 'object' && r.implemented === undefined);
    if (withoutImpl.length > 0) {
      warnings.push(`${rel}: ${withoutImpl.length}/${data.recommendations.length} recommendations missing 'implemented' field`);
    }
  }

  // Cohort analysis SQL queries should have executed field
  if (data.cohort_analysis?.sql_queries) {
    for (const q of data.cohort_analysis.sql_queries) {
      if (q.executed === undefined) {
        warnings.push(`${rel}: cohort_analysis SQL query missing 'executed' field: "${q.purpose || 'unnamed'}"`);
      }
    }
  }

  // Conflict validation
  if (data.lineage?.conflicts) {
    for (const conflict of data.lineage.conflicts) {
      if (!conflict.field) {
        issues.push(`${rel}: lineage.conflicts entry missing required 'field' property`);
      }
      if (!conflict.conflict) {
        issues.push(`${rel}: lineage.conflicts entry missing required 'conflict' property`);
      }
      if (!Array.isArray(conflict.sources) || conflict.sources.length < 2) {
        issues.push(`${rel}: lineage.conflicts entry must have at least 2 sources (found ${conflict.sources?.length || 0})`);
      }
      if (Array.isArray(conflict.sources)) {
        for (const src of conflict.sources) {
          if (!src.source) {
            issues.push(`${rel}: lineage.conflicts.sources entry missing 'source' property`);
          }
          if (src.value === undefined) {
            issues.push(`${rel}: lineage.conflicts.sources entry missing 'value' property`);
          }
          if (!src.confidence) {
            issues.push(`${rel}: lineage.conflicts.sources entry missing 'confidence' property`);
          }
          const validConfidence = ['high', 'medium-high', 'medium', 'medium-low', 'low'];
          if (src.confidence && !validConfidence.includes(src.confidence)) {
            warnings.push(`${rel}: lineage.conflicts.sources has invalid confidence '${src.confidence}' (valid: ${validConfidence.join(', ')})`);
          }
        }
      }
    }
  }

  // Check for high-confidence source conflicts
  if (data.lineage?.conflicts) {
    const highConfidenceConflicts = data.lineage.conflicts.filter(c =>
      c.sources?.some(s => s.confidence === 'high') &&
      c.sources?.filter(s => s.confidence === 'high').length >= 2
    );
    if (highConfidenceConflicts.length > 0) {
      warnings.push(`${rel}: ${highConfidenceConflicts.length} conflict(s) between high-confidence sources - requires manual review`);
    }
  }

  // If sources disagree, should have conflicts array
  if (data.sources && data.sources.length >= 2) {
    const hasConflicts = data.lineage?.conflicts && data.lineage.conflicts.length > 0;
    const hasUncertaintyFlags = data.lineage?.uncertainty_flags && data.lineage.uncertainty_flags.length > 0;
    // Only warn if we have results that could conflict
    if (data.results && !hasConflicts && !hasUncertaintyFlags) {
      // Check if results fields have conflicting source lineage
      const resultFields = ['conclusion', 'baseline_value', 'lift_percentage', 'winning_variant'];
      const hasMultipleResultSources = data.sources.some(s =>
        s.fields_from_source?.some(f => resultFields.includes(f))
      );
      if (hasMultipleResultSources && data.sources.filter(s =>
        s.fields_from_source?.some(f => resultFields.includes(f))
      ).length >= 2) {
        warnings.push(`${rel}: multiple sources provided result fields but no conflicts or uncertainty_flags documented`);
      }
    }
  }

  return { issues, warnings };
}

// ─── Fix Mode ─────────────────────────────────────────────

function fixFile(filePath, data) {
  const fixes = [];
  let modified = false;

  // Add implemented field to recommendations
  if (Array.isArray(data.recommendations)) {
    for (const rec of data.recommendations) {
      if (typeof rec === 'object' && rec.implemented === undefined) {
        rec.implemented = false;
        modified = true;
        fixes.push(`Added 'implemented: false' to recommendation: "${(rec.description || '').slice(0, 60)}..."`);
      }
    }
  }

  // Add executed field to cohort SQL queries
  if (data.cohort_analysis?.sql_queries) {
    for (const q of data.cohort_analysis.sql_queries) {
      if (q.executed === undefined) {
        q.executed = false;
        modified = true;
        fixes.push(`Added 'executed: false' to SQL query: "${q.purpose || 'unnamed'}"`);
      }
    }
  }

  // Bump schema version for deep-analyzed files
  if (data.deep_analysis && data.metadata?.schema_version !== '1.1.0') {
    if (!data.metadata) data.metadata = {};
    data.metadata.schema_version = '1.1.0';
    modified = true;
    fixes.push('Bumped metadata.schema_version to 1.1.0');
  }

  if (modified) {
    writeExperiment(filePath, data);
  }

  return fixes;
}

// ─── Post-Process Mode ────────────────────────────────────

function postProcessFile(filePath, data) {
  const actions = [];
  let modified = false;

  // Restructure monolithic deep_analysis
  if (data.deep_analysis) {
    const daKeys = Object.keys(data.deep_analysis);

    for (const key of daKeys) {
      // Direct sibling key match
      if (SIBLING_KEYS.includes(key)) {
        if (!data[key]) {
          data[key] = data.deep_analysis[key];
          actions.push(`Extracted '${key}' from deep_analysis to top-level`);
        } else {
          actions.push(`SKIPPED '${key}' - already exists at top level`);
        }
        delete data.deep_analysis[key];
        modified = true;
      }
      // Mapped key match
      else if (KEY_MAPPINGS[key]) {
        const targetKey = KEY_MAPPINGS[key];
        if (!data[targetKey]) {
          data[targetKey] = data.deep_analysis[key];
          actions.push(`Extracted '${key}' from deep_analysis → top-level '${targetKey}'`);
        } else {
          // Merge into existing if target exists
          actions.push(`SKIPPED mapping '${key}' → '${targetKey}' - target already exists at top level`);
        }
        delete data.deep_analysis[key];
        modified = true;
      }
    }

    // Move non-metadata, non-sibling extra content to deep_analysis.extra
    const remainingKeys = Object.keys(data.deep_analysis).filter(k => !DA_METADATA_KEYS.includes(k));
    if (remainingKeys.length > 0) {
      // Keep extra content inside deep_analysis but documented
      actions.push(`Keeping ${remainingKeys.length} extra keys in deep_analysis: [${remainingKeys.join(', ')}]`);
    }
  }

  // Scaffold missing sibling sections
  if (data.deep_analysis) {
    for (const key of SIBLING_KEYS) {
      if (!data[key]) {
        if (key === 'recommendations') {
          data[key] = [];
        } else if (key === 'cohort_analysis') {
          data[key] = { segments_analyzed: [], sql_queries: [], findings: [], anomalies: [] };
        } else if (key === 'unexplored_metrics') {
          data[key] = { suggested: [], discovered: [], confounding_factors_identified: [] };
        } else if (key === 'external_research') {
          data[key] = { sources: [], key_findings: [], synthesis: '', supports_our_result: null };
        } else if (key === 'funnel_analysis') {
          data[key] = { stages: [], drop_off_point: '', funnel_notes: '' };
        } else if (key === 'code_evidence') {
          data[key] = { commits: [], files_modified: [], implementation_notes: '' };
        } else if (key === 'root_cause') {
          data[key] = { hypothesis: '', confidence: 'low', supporting_evidence: [], contradicting_evidence: [], evidence_weight: {} };
        }
        actions.push(`Scaffolded empty '${key}' section`);
        modified = true;
      }
    }
  }

  // Apply standard fixes (implemented, executed, schema version)
  const fixes = fixFile(filePath, data);
  actions.push(...fixes);

  if (modified) {
    writeExperiment(filePath, data);
  }

  return actions;
}

// ─── CLI ──────────────────────────────────────────────────

run({
  name: 'experiment-validator',
  mode: 'operational',
  services: [],
}, async (ctx) => {
  const args = process.argv.slice(2);
  const mode = args.includes('--all') ? 'all' :
               args.includes('--validate') ? 'validate' :
               args.includes('--fix') ? 'fix' :
               args.includes('--post-process') ? 'post-process' : 'help';

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
experiment-validator.cjs - Validate experiment JSON files

Usage:
  --all                   Validate all experiment files
  --validate <file>       Validate a single file
  --fix                   Auto-fix all files (implemented, executed, schema version)
  --post-process <file>   Restructure + validate after analysis pipeline

Examples:
  node .ai/scripts/experiment-validator.cjs --all
  node .ai/scripts/experiment-validator.cjs --fix
  node .ai/scripts/experiment-validator.cjs --post-process .ai/knowledge/experiments/checkout/new.json
`);
    return;
  }

  if (args.includes('--all') || args.includes('--validate') && !args[args.indexOf('--validate') + 1]) {
    // Validate all files
    const files = findExperimentFiles();
    let totalIssues = 0;
    let totalWarnings = 0;

    console.log(`\nValidating ${files.length} experiment files...\n`);

    for (const f of files) {
      try {
        const data = readExperiment(f);
        const { issues, warnings } = validateFile(f, data);
        totalIssues += issues.length;
        totalWarnings += warnings.length;

        if (issues.length > 0 || warnings.length > 0) {
          for (const i of issues) console.log(`  ERROR: ${i}`);
          for (const w of warnings) console.log(`  WARN:  ${w}`);
        }
      } catch (e) {
        console.log(`  ERROR: ${relPath(f)}: Failed to parse JSON: ${e.message}`);
        totalIssues++;
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Files:    ${files.length}`);
    console.log(`Errors:   ${totalIssues}`);
    console.log(`Warnings: ${totalWarnings}`);

    if (totalIssues > 0) {
      throw new Error(`Validation found ${totalIssues} error(s)`);
    }
    return;
  }

  if (args.includes('--validate')) {
    const fileArg = args[args.indexOf('--validate') + 1];
    if (!fileArg) { throw new Error('Missing file argument for --validate'); }
    const filePath = path.resolve(fileArg);
    const data = readExperiment(filePath);
    const { issues, warnings } = validateFile(filePath, data);
    for (const i of issues) console.log(`  ERROR: ${i}`);
    for (const w of warnings) console.log(`  WARN:  ${w}`);
    console.log(`\nErrors: ${issues.length}, Warnings: ${warnings.length}`);

    if (issues.length > 0) {
      throw new Error(`Validation found ${issues.length} error(s)`);
    }
    return;
  }

  if (args.includes('--fix')) {
    const files = findExperimentFiles();
    let totalFixes = 0;

    console.log(`\nFixing ${files.length} experiment files...\n`);

    for (const f of files) {
      try {
        const data = readExperiment(f);
        const fixes = fixFile(f, data);
        totalFixes += fixes.length;
        if (fixes.length > 0) {
          console.log(`${relPath(f)}: ${fixes.length} fixes`);
          for (const fix of fixes) console.log(`  - ${fix}`);
        }
      } catch (e) {
        console.log(`  ERROR: ${relPath(f)}: ${e.message}`);
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Files processed: ${files.length}`);
    console.log(`Total fixes:     ${totalFixes}`);
    return;
  }

  if (args.includes('--post-process')) {
    const fileArg = args[args.indexOf('--post-process') + 1];
    if (!fileArg) { throw new Error('Missing file argument for --post-process'); }
    const filePath = path.resolve(fileArg);
    const data = readExperiment(filePath);
    const actions = postProcessFile(filePath, data);

    console.log(`\nPost-processing: ${relPath(filePath)}\n`);
    if (actions.length === 0) {
      console.log('  No changes needed - file is well-structured.');
    } else {
      for (const a of actions) console.log(`  - ${a}`);
      console.log(`\n${actions.length} actions applied.`);
    }

    // Re-validate after post-processing
    const reData = readExperiment(filePath);
    const { issues, warnings } = validateFile(filePath, reData);
    if (issues.length > 0) {
      console.log('\nRemaining issues after post-processing:');
      for (const i of issues) console.log(`  ERROR: ${i}`);
      throw new Error(`Post-processing left ${issues.length} remaining issue(s)`);
    } else {
      console.log('\nValidation passed after post-processing.');
    }
    return;
  }
});
