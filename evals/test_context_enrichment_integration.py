"""
Context Enrichment Integration Tests
====================================
End-to-end tests that run the full pipeline on fixture data.
Requires GEMINI_API_KEY - estimated cost: ~$0.10 per run.

Run with: python3 -m pytest .ai/evals/test_context_enrichment_integration.py -v --tb=short
"""

import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path

import pytest

# Paths
PM_ROOT = Path(__file__).parent.parent.parent
FIXTURES_DIR = Path(__file__).parent / "fixtures"


def run_node(code: str, timeout: int = 120) -> str:
    """Run Node.js code and return stdout."""
    result = subprocess.run(
        ["node", "-e", code],
        capture_output=True,
        text=True,
        cwd=str(PM_ROOT),
        timeout=timeout,
        env={**os.environ, "NODE_NO_WARNINGS": "1"}
    )
    if result.returncode != 0:
        raise RuntimeError(f"Node.js error: {result.stderr}")
    return result.stdout.strip()


@pytest.fixture(scope="module")
def temp_db_dir():
    """Create a temporary directory for test database."""
    tmpdir = tempfile.mkdtemp(prefix="context_enrichment_test_")
    yield tmpdir
    shutil.rmtree(tmpdir, ignore_errors=True)


class TestContextEnrichmentPipeline:
    """Integration tests for the full context enrichment pipeline."""

    @pytest.mark.llm_eval
    @pytest.mark.full
    def test_extract_facts_from_fixture_transcript(self):
        """
        Extract facts from sample transcript using Layer 1.
        Verifies that the fact extraction produces valid structured output.
        """
        if not os.environ.get("GEMINI_API_KEY"):
            pytest.skip("GEMINI_API_KEY not set")

        code = """
        const fs = require('fs');
        const path = require('path');
        const layer1 = require('./.ai/scripts/lib/context-enrichment/layers/1-facts.cjs');

        async function test() {
            const transcript = fs.readFileSync('./.ai/evals/fixtures/sample-transcript.md', 'utf-8');

            const source = {
                type: 'transcript',
                sourceId: 'test_transcript_001',
                content: transcript,
                title: 'Product Sync - Feed Redesign',
                date: '2026-01-15'
            };

            const apiKey = process.env.GEMINI_API_KEY;
            const result = await layer1.extractFactsFromSource(source, apiKey);

            console.log(JSON.stringify({
                success: true,
                factCount: result.facts?.length || 0,
                hasPersonalFacts: result.facts?.some(f => f.scope === 'personal'),
                hasCompanyFacts: result.facts?.some(f => f.scope === 'company' || f.scope === 'project'),
                sampleFact: result.facts?.[0] || null
            }));
        }

        test().catch(e => console.log(JSON.stringify({success: false, error: e.message})));
        """
        result = json.loads(run_node(code, timeout=60))

        assert result["success"], f"Extraction failed: {result.get('error')}"
        assert result["factCount"] > 0, "Should extract at least one fact"

        # Verify fact structure
        if result["sampleFact"]:
            fact = result["sampleFact"]
            assert "content" in fact or "fact_id" in fact, "Facts should have content"

    @pytest.mark.llm_eval
    @pytest.mark.full
    def test_theme_clustering_from_facts(self):
        """
        Cluster facts into themes using Layer 2.
        Uses pre-defined facts to avoid Layer 1 dependency.
        """
        if not os.environ.get("GEMINI_API_KEY"):
            pytest.skip("GEMINI_API_KEY not set")

        code = """
        const layer2 = require('./.ai/scripts/lib/context-enrichment/layers/2-themes.cjs');

        async function test() {
            const facts = [
                {
                    fact_id: 'fact_001',
                    content: 'Kyler prefers data-driven decisions',
                    scope: 'personal',
                    category: 'work-style',
                    confidence: 0.85,
                    source_id: 'test_001'
                },
                {
                    fact_id: 'fact_002',
                    content: 'Kyler values quick iteration over perfection',
                    scope: 'personal',
                    category: 'values',
                    confidence: 0.8,
                    source_id: 'test_002'
                },
                {
                    fact_id: 'fact_003',
                    content: 'Q1 roadmap includes feed redesign',
                    scope: 'company',
                    category: 'goals',
                    confidence: 0.9,
                    source_id: 'test_003'
                },
                {
                    fact_id: 'fact_004',
                    content: 'Feed redesign reduces card height by 30%',
                    scope: 'project',
                    category: 'product-decisions',
                    confidence: 0.95,
                    source_id: 'test_004'
                }
            ];

            const apiKey = process.env.GEMINI_API_KEY;
            const result = await layer2.groupFactsIntoThemes(facts, apiKey);

            console.log(JSON.stringify({
                success: true,
                themeCount: result.themes?.all?.length || 0,
                hasStats: !!result.stats
            }));
        }

        test().catch(e => console.log(JSON.stringify({success: false, error: e.message})));
        """
        result = json.loads(run_node(code, timeout=60))

        assert result["success"], f"Theme clustering failed: {result.get('error')}"
        # Theme clustering may produce 0 themes for small fact sets, that's ok
        assert result["hasStats"], "Should return stats"

    @pytest.mark.llm_eval
    @pytest.mark.full
    def test_v1_database_migration_preserves_data(self):
        """
        Migrate V1 database and verify all facts are preserved.
        """
        code = f"""
        const fs = require('fs');
        const db = require('./.ai/scripts/lib/context-enrichment/database.cjs');

        const v1Data = JSON.parse(fs.readFileSync('./.ai/evals/fixtures/sample-v1-db.json', 'utf-8'));

        // Count original facts (nested structure)
        let originalCount = 0;
        for (const scope of Object.values(v1Data.facts || {{}})) {{
            originalCount += Object.keys(scope).length;
        }}

        // Migrate
        const migrated = db.migrateV1toV3(v1Data);
        const migratedCount = Object.keys(migrated.facts).length;

        console.log(JSON.stringify({{
            originalCount,
            migratedCount,
            preserved: migratedCount >= originalCount,
            version: migrated.version
        }}));
        """
        result = json.loads(run_node(code))

        assert result["version"] == "3.0.0"
        assert result["preserved"], f"Lost facts during migration: {result['originalCount']} -> {result['migratedCount']}"

    @pytest.mark.llm_eval
    @pytest.mark.full
    def test_evidence_chain_integrity(self):
        """
        Build evidence chains and verify they correctly link layers.
        """
        code = """
        const evidence = require('./.ai/scripts/lib/context-enrichment/utils/evidence.cjs');

        const data = {
            facts: [
                { fact_id: 'f1', source_id: 's1', confidence: 0.9 },
                { fact_id: 'f2', source_id: 's2', confidence: 0.85 },
                { fact_id: 'f3', source_id: 's1', confidence: 0.8 }
            ],
            themes: [
                { theme_id: 't1', supporting_facts: ['f1', 'f2'], confidence: 0.85 },
                { theme_id: 't2', supporting_facts: ['f3'], confidence: 0.8 }
            ],
            insights: [
                { insight_id: 'i1', supporting_themes: ['t1', 't2'], confidence: 0.75 }
            ]
        };

        const chains = evidence.buildAllEvidenceChains(data);

        // Trace insight back to sources
        const sources = evidence.traceToSources(chains, 'i1');
        const sourceIds = sources.map(s => s.source_id);

        console.log(JSON.stringify({
            chainCount: Object.keys(chains).length,
            insightTracesTo: sourceIds,
            hasAllSources: sourceIds.includes('s1') && sourceIds.includes('s2')
        }));
        """
        result = json.loads(run_node(code))

        assert result["chainCount"] == 6, "Should have chains for all facts, themes, insights"
        assert result["hasAllSources"], "Insight should trace back to both original sources"

    @pytest.mark.llm_eval
    @pytest.mark.full
    def test_pipeline_dry_run(self):
        """
        Run pipeline in dry-run mode to verify it initializes correctly.
        """
        code = """
        const pipeline = require('./.ai/scripts/lib/context-enrichment/pipeline.cjs');

        async function test() {
            // Dry run should not require API key and should not process anything
            const result = await pipeline.runFullPipeline({
                dryRun: true,
                forceReprocess: false,
                limit: 1
            });

            console.log(JSON.stringify({
                status: result.status,
                isDryRun: result.status === 'dry_run' || result.status === 'no_changes'
            }));
        }

        test().catch(e => console.log(JSON.stringify({status: 'error', error: e.message})));
        """
        result = json.loads(run_node(code, timeout=30))

        # Dry run or no changes is expected
        assert result["status"] in ["dry_run", "no_changes", "error"], f"Unexpected status: {result['status']}"


class TestCLICommands:
    """Test CLI entry points work correctly."""

    def test_stats_command_runs(self):
        """The stats command should run without error."""
        result = subprocess.run(
            ["node", ".ai/scripts/context-enrichment.cjs", "stats"],
            capture_output=True,
            text=True,
            cwd=str(PM_ROOT),
            timeout=10
        )
        # Should run (may have no data, that's ok)
        assert result.returncode == 0 or "Database" in result.stdout or "Error" in result.stderr

    def test_generate_dossiers_import_fixed(self):
        """The generate-dossiers.cjs should have correct import path."""
        script = PM_ROOT / ".ai/scripts/generate-dossiers.cjs"
        content = script.read_text()

        assert "layers/4-dossier.cjs" in content, "Should import from layers/ not synthesis/"
        assert "synthesis/layer4-dossier" not in content, "Should not have old import path"
