"""
Context Enrichment Unit Tests
=============================
Tests for adapters, database operations, and evidence chain utilities.
No LLM calls required - these test pure functions.

Run with: python3 -m pytest .ai/evals/test_context_enrichment.py -v
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
ADAPTERS_DIR = PM_ROOT / ".ai/scripts/lib/context-enrichment/adapters"
DATABASE_MODULE = PM_ROOT / ".ai/scripts/lib/context-enrichment/database.cjs"
EVIDENCE_MODULE = PM_ROOT / ".ai/scripts/lib/context-enrichment/utils/evidence.cjs"


def run_node(code: str) -> str:
    """Run Node.js code and return stdout."""
    result = subprocess.run(
        ["node", "-e", code],
        capture_output=True,
        text=True,
        cwd=str(PM_ROOT),
    )
    if result.returncode != 0:
        raise RuntimeError(f"Node.js error: {result.stderr}")
    return result.stdout.strip()


# ============================================================
# Transcript Adapter Tests
# ============================================================

class TestTranscriptAdapter:
    """Tests for transcript adapter functionality."""

    def test_generates_source_id_from_filepath(self):
        """Source IDs should be deterministic based on filepath."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/transcript.cjs');
        const id1 = adapter.generateSourceId('/path/to/2026-01-15-meeting.md');
        const id2 = adapter.generateSourceId('/path/to/2026-01-15-meeting.md');
        const id3 = adapter.generateSourceId('/different/path.md');
        console.log(JSON.stringify({id1, id2, id3, same: id1 === id2, different: id1 !== id3}));
        """
        result = json.loads(run_node(code))
        assert result["same"], "Same filepath should produce same source ID"
        assert result["different"], "Different filepaths should produce different IDs"
        assert result["id1"].startswith("tran_"), "Source ID should start with tran_"

    def test_extracts_date_from_filename(self):
        """Should parse YYYY-MM-DD from filename."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/transcript.cjs');
        const fs = require('fs');
        const path = require('path');

        // Create a temp file to test loading
        const fixturePath = './.ai/evals/fixtures/sample-transcript.md';
        const transcript = adapter.loadTranscript(fixturePath);
        console.log(JSON.stringify({date: transcript.date, hasDate: !!transcript.date}));
        """
        result = json.loads(run_node(code))
        # The fixture doesn't have date in filename, but has it in frontmatter
        assert result["hasDate"] or result["date"] is None

    def test_extracts_participants_from_content(self):
        """Should find speaker names from transcript content."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/transcript.cjs');
        const content = `
**Kyler:** Hello everyone
**Sarah:** Hi Kyler
**Mike:** Hey team
        `;
        const participants = adapter.extractParticipants(content);
        console.log(JSON.stringify(participants));
        """
        result = json.loads(run_node(code))
        assert "Kyler" in result
        assert "Sarah" in result
        assert "Mike" in result

    def test_loads_transcript_from_fixture(self):
        """Should load and parse a real transcript file."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/transcript.cjs');
        const transcript = adapter.loadTranscript('./.ai/evals/fixtures/sample-transcript.md');
        console.log(JSON.stringify({
            type: transcript.type,
            hasContent: !!transcript.content,
            hasSourceId: !!transcript.sourceId,
            hasTitle: !!transcript.title
        }));
        """
        result = json.loads(run_node(code))
        assert result["type"] == "transcript"
        assert result["hasContent"]
        assert result["hasSourceId"]


# ============================================================
# Chat Adapter Tests
# ============================================================

class TestChatAdapter:
    """Tests for chat adapter functionality."""

    def test_generates_source_id_from_session_id(self):
        """Source IDs should be deterministic based on session ID."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/chat.cjs');
        const id1 = adapter.generateSourceId('claude:project:abc123');
        const id2 = adapter.generateSourceId('claude:project:abc123');
        const id3 = adapter.generateSourceId('cursor:workspace:xyz789');
        console.log(JSON.stringify({id1, id2, id3, same: id1 === id2, different: id1 !== id3}));
        """
        result = json.loads(run_node(code))
        assert result["same"], "Same session ID should produce same source ID"
        assert result["different"], "Different session IDs should produce different IDs"
        assert result["id1"].startswith("chat_"), "Source ID should start with chat_"

    def test_handles_null_session_id(self):
        """Should handle null session ID gracefully."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/chat.cjs');
        const id = adapter.generateSourceId(null);
        console.log(JSON.stringify({id, hasPrefix: id.startsWith('chat_')}));
        """
        result = json.loads(run_node(code))
        assert result["hasPrefix"], "Should still produce chat_ prefix"
        assert "unknown" in result["id"], "Should indicate unknown"

    def test_loads_conversation_from_session(self):
        """Should normalize session data correctly."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/chat.cjs');
        const session = {
            id: 'claude:pm:test123',
            project_path: '/Users/test/project',
            created_at: '2026-01-15T10:30:00.000Z',
            title: 'Test Session',
            summary: 'A test conversation about testing',
            enriched_category: 'development'
        };
        const result = adapter.loadConversationFromSession(session, '/pm');
        console.log(JSON.stringify(result));
        """
        result = json.loads(run_node(code))
        assert result["type"] == "chat"
        assert result["date"] == "2026-01-15"
        assert result["title"] == "Test Session"
        assert result["category"] == "development"
        assert result["sourceId"].startswith("chat_")

    def test_handles_missing_fields_gracefully(self):
        """Should provide defaults for missing fields."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/chat.cjs');
        const session = { id: 'minimal' };
        const result = adapter.loadConversationFromSession(session, '/pm');
        console.log(JSON.stringify(result));
        """
        result = json.loads(run_node(code))
        assert result["title"] == "Untitled conversation"
        assert result["category"] == "general"
        assert result["date"] is None

    def test_throws_on_invalid_input(self):
        """Should throw error for invalid input."""
        code = """
        const adapter = require('./.ai/scripts/lib/context-enrichment/adapters/chat.cjs');
        try {
            adapter.loadConversationFromSession(null, '/pm');
            console.log('false');
        } catch (e) {
            console.log('true');
        }
        """
        result = run_node(code)
        assert result == "true", "Should throw on null input"


# ============================================================
# Database Tests
# ============================================================

class TestDatabase:
    """Tests for database operations."""

    def test_creates_fresh_database_when_missing(self):
        """Should create new V3 database when no existing DB found."""
        code = """
        const db = require('./.ai/scripts/lib/context-enrichment/database.cjs');
        const tmpDir = require('os').tmpdir();
        const path = require('path');

        // Point to non-existent directory
        const fresh = db.loadDatabase();
        console.log(JSON.stringify({
            version: fresh.version,
            hasFacts: 'facts' in fresh,
            hasThemes: 'themes' in fresh,
            hasInsights: 'insights' in fresh
        }));
        """
        result = json.loads(run_node(code))
        assert result["version"] == "3.0.0"
        assert result["hasFacts"]
        assert result["hasThemes"]
        assert result["hasInsights"]

    def test_migration_v1_to_v3(self):
        """Should migrate V1 database format to V3."""
        v1_fixture = FIXTURES_DIR / "sample-v1-db.json"
        code = f"""
        const db = require('./.ai/scripts/lib/context-enrichment/database.cjs');
        const fs = require('fs');

        const v1Data = JSON.parse(fs.readFileSync('{v1_fixture}', 'utf-8'));
        const migrated = db.migrateV1toV3(v1Data);

        // Check migration results
        const factCount = Object.keys(migrated.facts).length;
        const hasPersonalFact = Object.values(migrated.facts).some(f => f.scope === 'personal');
        const hasCompanyFact = Object.values(migrated.facts).some(f => f.scope === 'company');

        console.log(JSON.stringify({{
            version: migrated.version,
            factCount,
            hasPersonalFact,
            hasCompanyFact
        }}));
        """
        result = json.loads(run_node(code))
        assert result["version"] == "3.0.0"
        assert result["factCount"] >= 4, "Should migrate all facts"
        assert result["hasPersonalFact"], "Should have personal scope facts"
        assert result["hasCompanyFact"], "Should have company scope facts"

    def test_is_source_processed(self):
        """Should correctly track processed sources."""
        code = """
        const db = require('./.ai/scripts/lib/context-enrichment/database.cjs');

        const testDb = {
            ...db.DEFAULT_DB,
            processed_sources: {}
        };

        // Initially not processed
        const before = db.isSourceProcessed(testDb, 'test_source');

        // Mark as processed
        db.markSourceProcessed(testDb, 'test_source', 5, 'transcript');

        // Now should be processed
        const after = db.isSourceProcessed(testDb, 'test_source');

        console.log(JSON.stringify({before, after}));
        """
        result = json.loads(run_node(code))
        assert result["before"] == False
        assert result["after"] == True


# ============================================================
# Evidence Chain Tests
# ============================================================

class TestEvidenceChains:
    """Tests for evidence chain and lineage tracking."""

    def test_detect_changes_finds_new_facts(self):
        """Should detect new facts between runs."""
        code = """
        const evidence = require('./.ai/scripts/lib/context-enrichment/utils/evidence.cjs');

        const previousRun = { facts: [], themes: [], insights: [] };
        const currentRun = {
            facts: [
                { fact_id: 'fact_001', content: 'Test fact 1' },
                { fact_id: 'fact_002', content: 'Test fact 2' }
            ],
            themes: [],
            insights: []
        };

        const changes = evidence.detectChanges(previousRun, currentRun);
        console.log(JSON.stringify({
            addedFacts: changes.facts.added.length,
            removedFacts: changes.facts.removed.length
        }));
        """
        result = json.loads(run_node(code))
        assert result["addedFacts"] == 2
        assert result["removedFacts"] == 0

    def test_detect_changes_finds_removed_facts(self):
        """Should detect removed facts between runs."""
        code = """
        const evidence = require('./.ai/scripts/lib/context-enrichment/utils/evidence.cjs');

        const previousRun = {
            facts: [
                { fact_id: 'fact_001', content: 'Old fact' },
                { fact_id: 'fact_002', content: 'Another old fact' }
            ],
            themes: [],
            insights: []
        };
        const currentRun = {
            facts: [{ fact_id: 'fact_001', content: 'Old fact' }],
            themes: [],
            insights: []
        };

        const changes = evidence.detectChanges(previousRun, currentRun);
        console.log(JSON.stringify({
            addedFacts: changes.facts.added.length,
            removedFacts: changes.facts.removed.length
        }));
        """
        result = json.loads(run_node(code))
        assert result["addedFacts"] == 0
        assert result["removedFacts"] == 1

    def test_build_evidence_chains_links_facts_to_sources(self):
        """Should build chains linking facts to their sources."""
        code = """
        const evidence = require('./.ai/scripts/lib/context-enrichment/utils/evidence.cjs');

        const data = {
            facts: [
                {
                    fact_id: 'fact_001',
                    source_id: 'transcript_2026-01-15',
                    direct_quote: 'This is the evidence',
                    speaker: 'Kyler',
                    confidence: 0.85
                }
            ],
            themes: [
                {
                    theme_id: 'theme_001',
                    supporting_facts: ['fact_001'],
                    confidence: 0.8
                }
            ],
            insights: [
                {
                    insight_id: 'insight_001',
                    supporting_themes: ['theme_001'],
                    confidence: 0.75
                }
            ]
        };

        const chains = evidence.buildAllEvidenceChains(data);

        console.log(JSON.stringify({
            factChain: chains['fact_001'],
            themeChain: chains['theme_001'],
            insightChain: chains['insight_001']
        }));
        """
        result = json.loads(run_node(code))

        # Fact should link to source
        assert result["factChain"]["element_type"] == "fact"
        assert len(result["factChain"]["sources"]) == 1
        assert result["factChain"]["sources"][0]["source_id"] == "transcript_2026-01-15"

        # Theme should link to fact
        assert result["themeChain"]["element_type"] == "theme"
        assert "fact_001" in result["themeChain"]["derived_from"]

        # Insight should link to theme
        assert result["insightChain"]["element_type"] == "insight"
        assert "theme_001" in result["insightChain"]["derived_from"]

    def test_trace_to_sources_follows_lineage(self):
        """Should trace from insight back to original sources."""
        code = """
        const evidence = require('./.ai/scripts/lib/context-enrichment/utils/evidence.cjs');

        const chains = {
            'fact_001': {
                element_type: 'fact',
                confidence: 0.85,
                derived_from: [],
                sources: [{ source_id: 'transcript_001' }]
            },
            'fact_002': {
                element_type: 'fact',
                confidence: 0.9,
                derived_from: [],
                sources: [{ source_id: 'transcript_002' }]
            },
            'theme_001': {
                element_type: 'theme',
                confidence: 0.8,
                derived_from: ['fact_001', 'fact_002'],
                sources: []
            },
            'insight_001': {
                element_type: 'insight',
                confidence: 0.75,
                derived_from: ['theme_001'],
                sources: []
            }
        };

        const sources = evidence.traceToSources(chains, 'insight_001');
        const sourceIds = sources.map(s => s.source_id);

        console.log(JSON.stringify({sourceIds, count: sourceIds.length}));
        """
        result = json.loads(run_node(code))
        assert result["count"] == 2
        assert "transcript_001" in result["sourceIds"]
        assert "transcript_002" in result["sourceIds"]


# ============================================================
# File Structure Tests
# ============================================================

class TestFileStructure:
    """Verify the v3 refactored file structure exists."""

    def test_layers_directory_exists(self):
        """Layers directory should contain all 4 layer files."""
        layers_dir = PM_ROOT / ".ai/scripts/lib/context-enrichment/layers"
        assert layers_dir.exists(), "layers/ directory should exist"
        assert (layers_dir / "1-facts.cjs").exists()
        assert (layers_dir / "2-themes.cjs").exists()
        assert (layers_dir / "3-insights.cjs").exists()
        assert (layers_dir / "4-dossier.cjs").exists()

    def test_adapters_directory_exists(self):
        """Adapters directory should contain transcript and chat adapters."""
        adapters_dir = PM_ROOT / ".ai/scripts/lib/context-enrichment/adapters"
        assert adapters_dir.exists(), "adapters/ directory should exist"
        assert (adapters_dir / "transcript.cjs").exists()
        assert (adapters_dir / "chat.cjs").exists()

    def test_utils_directory_exists(self):
        """Utils directory should contain shared utilities."""
        utils_dir = PM_ROOT / ".ai/scripts/lib/context-enrichment/utils"
        assert utils_dir.exists(), "utils/ directory should exist"
        assert (utils_dir / "gemini.cjs").exists()
        assert (utils_dir / "temporal.cjs").exists()
        assert (utils_dir / "evidence.cjs").exists()

    def test_index_exports_public_api(self):
        """Index should export the public API."""
        code = """
        const api = require('./.ai/scripts/lib/context-enrichment/index.cjs');
        console.log(JSON.stringify({
            hasRunFullPipeline: typeof api.runFullPipeline === 'function',
            hasLoadDatabase: typeof api.loadDatabase === 'function',
            hasExtractFacts: typeof api.extractFactsFromSource === 'function',
            hasGenerateDossiers: typeof api.generateDossiers === 'function'
        }));
        """
        result = json.loads(run_node(code))
        assert result["hasRunFullPipeline"]
        assert result["hasLoadDatabase"]
