"""
Agent Quality Tests
===================
Tests that agents produce high-quality, helpful responses.
Uses LLM-as-judge pattern to evaluate output quality.
"""

import pytest
from conftest import load_agent, judge_response


@pytest.mark.llm_eval
class TestAgentQuality:
    """Test suite for evaluating agent response quality."""

    @pytest.mark.smoke
    def test_product_coach_asks_clarifying_questions(self, gemini_client):
        """
        Product coach should ask clarifying questions before giving advice.

        The product coach uses a Socratic approach - it should ask questions
        to understand context before jumping to recommendations. This is the
        expected behavior for thoughtful product guidance.

        Criteria:
        - Asks clarifying questions to understand context
        - Does NOT immediately give a direct yes/no recommendation
        - Questions are relevant to understanding the decision
        - Response is helpful and guides thinking
        """
        agent = load_agent("skills/core/product-coach/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="Should we add a dark mode toggle to Cloaked?"
        )

        judgment = judge_response(gemini_client, response, [
            "Asks clarifying questions before giving advice",
            "Questions help understand user needs, priorities, or context",
            "Does NOT immediately give a direct yes/no recommendation",
            "Response is helpful and guides the user's thinking"
        ])

        print(f"\n=== Product Coach Evaluation ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")

        # Require pass=true AND score >= 75 for quality tests
        assert judgment["pass"], f"Quality check failed: {judgment['reasoning']}"
        assert judgment["score"] >= 75, f"Score {judgment['score']} < 75: {judgment['reasoning']}"

    @pytest.mark.smoke
    def test_sql_builder_produces_valid_sql(self, gemini_client):
        """
        SQL builder should produce syntactically reasonable SQL.

        Uses LLM-as-judge to evaluate SQL quality, making this more robust
        than simple string matching which can be flaky with LLM outputs.
        """
        agent = load_agent("skills/core/sql-query-builder/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="How many users signed up in the last 7 days?"
        )

        # Use LLM-as-judge for more robust evaluation
        judgment = judge_response(gemini_client, response, [
            "Contains a SQL query with SELECT clause",
            "Contains a FROM clause referencing a table",
            "Query is relevant to counting user signups",
            "SQL syntax appears valid (not truncated or malformed)"
        ])

        print(f"\n=== SQL Builder Output ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")
        print(f"Response preview: {response[:500]}...")

        assert judgment["pass"], f"SQL quality check failed: {judgment['reasoning']}"

    @pytest.mark.full
    def test_sql_builder_uses_correct_tables(self, gemini_client):
        """
        SQL builder should reference appropriate tables from schema.

        Tests that the agent understands the Redshift schema.
        """
        agent = load_agent("skills/core/sql-query-builder/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="What's our weekly retention rate for users who activated data removal?"
        )

        response_lower = response.lower()

        # Should reference some reasonable table names
        reasonable_tables = ["users", "events", "retention", "activation", "removal"]
        has_table_reference = any(table in response_lower for table in reasonable_tables)

        print(f"\n=== SQL Builder Table Usage ===")
        print(f"References reasonable tables: {has_table_reference}")
        print(f"Response: {response[:500]}...")

        assert has_table_reference, "SQL doesn't reference any expected tables"

    @pytest.mark.full
    def test_jira_writer_asks_clarifying_questions(self, gemini_client):
        """
        Jira ticket writer should ask clarifying questions for incomplete input.

        When given a bug report without full details, the agent should:
        - Ask about platform/environment
        - Ask about reproduction steps
        - Ask about expected vs actual behavior
        - NOT produce a ticket without gathering context first
        """
        agent = load_agent("skills/core/jira-ticket-writer/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="Create a ticket for: Users can't reset their password on mobile"
        )

        judgment = judge_response(gemini_client, response, [
            "Asks clarifying questions before creating ticket",
            "Asks about platform, steps to reproduce, or expected behavior",
            "Does NOT immediately produce a full ticket",
            "Response is helpful and professional"
        ])

        print(f"\n=== Jira Writer Evaluation ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")

        assert judgment["pass"], f"Quality check failed: {judgment['reasoning']}"

    @pytest.mark.full
    def test_transcript_organizer_asks_context_questions(self, gemini_client):
        """
        Transcript organizer should ask clarifying questions before processing.

        Given a transcript without context, the agent should:
        - Ask about meeting type
        - Ask about speaker identification
        - Ask about desired output format
        - NOT immediately process without gathering context
        """
        agent = load_agent("skills/specialized/transcript-organizer/SKILL.md")

        # Simulated meeting transcript without context
        fake_transcript = """
        Sarah: We need to decide on the Q1 priorities. I think data removal should be first.
        Mike: Agreed, but we also have the password reset bug that's urgent.
        Sarah: True. Let's prioritize: 1) password reset fix this week, 2) data removal improvements next.
        Mike: I'll own the password reset. Can you handle data removal scope?
        Sarah: Yes, I'll draft the PRD by Friday.
        Mike: Perfect. Let's sync again on Monday.
        """

        response = gemini_client.complete(
            system=agent,
            user=f"Organize this transcript:\n\n{fake_transcript}"
        )

        judgment = judge_response(gemini_client, response, [
            "Asks clarifying questions before fully processing",
            "Asks about meeting type, speakers, or output preferences",
            "Does NOT immediately produce a final organized document",
            "Response is helpful and shows understanding of the task"
        ])

        print(f"\n=== Transcript Organizer Evaluation ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")

        assert judgment["pass"], f"Quality check failed: {judgment['reasoning']}"

    @pytest.mark.full
    def test_weekly_update_writer_asks_for_context(self, gemini_client):
        """
        Weekly update writer should ask clarifying questions to gather context.

        When asked to write an update, the agent should:
        - Ask about update type (team vs manager)
        - Ask about meetings to search for transcripts
        - Gather context before producing the final update
        """
        agent = load_agent("skills/core/weekly-update-writer/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="Write my weekly update"
        )

        judgment = judge_response(gemini_client, response, [
            "Asks clarifying questions before writing",
            "Asks about update type or meetings to reference",
            "Does NOT immediately produce a final update without context",
            "Response is helpful and guides the user"
        ])

        print(f"\n=== Weekly Update Writer Evaluation ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")

        assert judgment["pass"], f"Quality check failed: {judgment['reasoning']}"

    @pytest.mark.full
    def test_daily_chief_of_staff_provides_morning_structure(self, gemini_client):
        """
        Daily chief of staff should provide structured morning briefings.

        When asked for a daily briefing, the agent should:
        - Ask about what sources to check (calendar, email, meetings)
        - Offer structure for the day
        - NOT produce a full briefing without gathering context
        """
        agent = load_agent("skills/core/daily-chief-of-staff/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="Start my morning briefing"
        )

        judgment = judge_response(gemini_client, response, [
            "Asks clarifying questions or requests access to sources",
            "Mentions checking calendar, email, or recent meetings",
            "Does NOT produce a full briefing without context",
            "Response is structured and professional"
        ])

        print(f"\n=== Daily Chief of Staff Evaluation ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")

        assert judgment["pass"], f"Quality check failed: {judgment['reasoning']}"

    @pytest.mark.full
    def test_interview_assistant_provides_structured_prep(self, gemini_client):
        """
        Interview assistant should provide structured interview preparation.

        When asked about interview prep, the agent should:
        - Ask about the role, candidate, or interview type
        - Gather context before producing full prep materials
        - Be helpful and professional
        """
        agent = load_agent("skills/core/interview-assistant/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="Help me prepare for an interview tomorrow"
        )

        judgment = judge_response(gemini_client, response, [
            "Asks clarifying questions about the interview",
            "Asks about role, candidate background, or interview type",
            "Does NOT produce full prep without context",
            "Response is helpful and professional"
        ])

        print(f"\n=== Interview Assistant Evaluation ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")

        assert judgment["pass"], f"Quality check failed: {judgment['reasoning']}"

    @pytest.mark.full
    def test_self_improvement_identifies_issues(self, gemini_client):
        """
        Self-improvement agent should identify system issues thoughtfully.

        When asked to improve the system, the agent should:
        - Ask about what areas to focus on
        - Gather context about current issues or goals
        - Be systematic in its approach
        """
        agent = load_agent("skills/core/self-improvement/SKILL.md")

        response = gemini_client.complete(
            system=agent,
            user="Help me improve the PM AI system"
        )

        judgment = judge_response(gemini_client, response, [
            "Asks clarifying questions about improvement goals",
            "Asks about specific areas, issues, or priorities",
            "Shows systematic thinking about the task",
            "Response is helpful and action-oriented"
        ])

        print(f"\n=== Self-Improvement Agent Evaluation ===")
        print(f"Pass: {judgment['pass']}")
        print(f"Score: {judgment['score']}/100")
        print(f"Reasoning: {judgment['reasoning']}")

        assert judgment["pass"], f"Quality check failed: {judgment['reasoning']}"