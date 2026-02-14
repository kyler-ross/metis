# A/B Evaluation Framework

Reusable framework for comparing Claude Code agent performance across branches.

## Quick Start

```bash
# Run all smoke tests (quick, ~5 tests)
python3 .ai/evals/run_ab_eval.py --smoke

# Run routing tests only
python3 .ai/evals/run_ab_eval.py --routing

# Run quality tests only
python3 .ai/evals/run_ab_eval.py --quality

# Dry run (show what would execute)
python3 .ai/evals/run_ab_eval.py --dry-run
```

## Components

| File | Purpose |
|------|---------|
| `metrics.py` | Data structures for test results, timing, token counting |
| `judge.py` | LLM-as-judge using Gemini for quality scoring |
| `ab_runner.py` | A/B comparison engine - runs tests in both branches |
| `reporters.py` | Markdown and JSON report generation |

## Configuration

Edit `configs/branches.json` to configure which branches to compare:

```json
{
  "default_comparison": {
    "branch_a": { "name": "main", "path": "/path/to/main" },
    "branch_b": { "name": "feature", "path": "/path/to/feature" }
  }
}
```

## Test Cases

- `datasets/routing_cases.json` - Tests for agent routing accuracy
- `datasets/quality_cases.json` - Tests for response quality

## Metrics Captured

| Metric | Description |
|--------|-------------|
| Routing Accuracy | % of queries routed to correct agent |
| Quality Score | LLM-judged quality (1-5 scale) |
| Response Time | Wall clock time per request |
| Token Usage | Input + output tokens |
| Cost Estimate | Estimated API cost |

## Reports

Reports are saved to `results/` (gitignored):
- `ab_eval_TIMESTAMP.md` - Human-readable markdown
- `ab_eval_TIMESTAMP.json` - Machine-readable JSON

## Future: Standalone Package

This framework is designed to be extractable into a standalone `claude-eval` package:
- No PM-specific imports
- Generic test case format
- Works with any Claude Code project
