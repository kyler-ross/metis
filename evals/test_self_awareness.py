"""
Self-Awareness Tests
====================
Tests that the PM AI system can answer questions about itself.
"""

import pytest
from pathlib import Path


@pytest.mark.llm_eval
class TestSelfAwareness:
    """Test suite for system self-knowledge."""

    @pytest.fixture
    def system_context(self):
        """Load the main CLAUDE.md system context."""
        return Path("CLAUDE.md").read_text()

    @pytest.mark.smoke
    @pytest.mark.parametrize("question,must_contain_any", [
        (
            "What agents are available in this PM system?",
            [["product-coach", "sql-query-builder"]]  # Must mention at least these two core agents
        ),
        (
            "How do I create a Jira ticket using this system?",
            [["jira"]]  # Just checking it mentions Jira
        ),
        (
            "Where is the knowledge base stored?",
            [[".ai"], ["knowledge"]]  # Must match both
        ),
    ])
    def test_system_knowledge(self, gemini_client, system_context, question, must_contain_any):
        """
        System should be able to answer basic questions about itself.

        Tests that the system context (CLAUDE.md) contains enough information
        for the model to answer common questions about the PM AI system.
        """
        response = gemini_client.complete(
            system=system_context,
            user=question
        )

        response_lower = response.lower()

        # Check how many term groups are matched
        matched_groups = 0
        for term_group in must_contain_any:
            if all(term.lower() in response_lower for term in term_group):
                matched_groups += 1

        print(f"\n=== Self-Awareness Test ===")
        print(f"Question: {question}")
        print(f"Term groups to match: {must_contain_any}")
        print(f"Groups matched: {matched_groups}/{len(must_contain_any)}")
        print(f"Response preview: {response[:300]}...")

        # Require ALL term groups to match for stringent testing
        assert matched_groups == len(must_contain_any), f"Only matched {matched_groups}/{len(must_contain_any)} term groups (need all)"

    @pytest.mark.full
    @pytest.mark.parametrize("question,must_contain", [
        (
            "What slash commands are available?",
            ["/pm-ai", "/pm-coach"]
        ),
        (
            "How do I run the daily sync?",
            ["daily", "/pm-daily"]
        ),
        (
            "What MCP integrations does this system have?",
            ["github", "posthog"]
        ),
        (
            "How do I access meeting transcripts?",
            ["transcript", ".ai"]
        ),
        (
            "What is the product coach agent for?",
            ["product", "strategy"]
        ),
    ])
    def test_detailed_system_knowledge(self, gemini_client, system_context, question, must_contain):
        """
        System should answer detailed questions about its capabilities.
        """
        response = gemini_client.complete(
            system=system_context,
            user=question
        )

        response_lower = response.lower()
        missing = [term for term in must_contain if term.lower() not in response_lower]

        print(f"\n=== Detailed Knowledge Test ===")
        print(f"Question: {question}")
        print(f"Must contain: {must_contain}")
        print(f"Missing: {missing}")

        assert not missing, f"Response missing required terms: {missing}"

    @pytest.mark.smoke
    def test_knows_its_purpose(self, gemini_client, system_context):
        """
        System should understand its overall purpose.
        """
        response = gemini_client.complete(
            system=system_context,
            user="What is the purpose of this PM AI system?"
        )

        response_lower = response.lower()

        # Should mention key concepts
        key_concepts = ["product", "pm", "task", "agent"]
        matches = [c for c in key_concepts if c in response_lower]

        print(f"\n=== Purpose Test ===")
        print(f"Key concepts found: {matches}")
        print(f"Response: {response[:400]}...")

        assert len(matches) >= 2, f"Response doesn't adequately describe purpose. Found: {matches}"

    @pytest.mark.full
    def test_can_explain_architecture(self, gemini_client, system_context):
        """
        System should be able to explain its own architecture.
        """
        response = gemini_client.complete(
            system=system_context,
            user="Explain the architecture of this PM AI system. What are the main components?"
        )

        response_lower = response.lower()

        # Should mention key architectural components
        components = ["agent", "knowledge", "command", "config"]
        matches = [c for c in components if c in response_lower]

        print(f"\n=== Architecture Test ===")
        print(f"Components found: {matches}")
        print(f"Response: {response[:500]}...")

        assert len(matches) >= 2, f"Response doesn't adequately describe architecture. Found: {matches}"
