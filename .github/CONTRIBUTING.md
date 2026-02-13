# Contributing to PM AI Starter Kit

Thanks for your interest in contributing. This guide covers how to add skills, scripts, slash commands, and submit changes.

## Getting Started

1. Fork the repository and clone your fork.
2. Run the setup wizard: `node scripts/setup-wizard.cjs` (or follow README.md).
3. Verify your environment: `node scripts/validate-dependencies.cjs`.

## Adding a New Skill

Skills follow the [SKILL.md standard](https://agentskills.io). Each skill lives in its own directory under `skills/<category>/`.

### Steps

1. Create the skill directory:
   ```
   skills/<category>/<skill-name>/
   ```
   Categories: `core`, `experts`, `specialized`, `workflows`, `personas`, `utilities`.

2. Create `SKILL.md` in the skill directory. This is the main instruction file that the agent reads. Include YAML frontmatter with at minimum:
   ```yaml
   ---
   name: skill-name
   description: What the skill does
   category: core
   tags: [relevant, tags]
   tools: [tools-it-uses]
   ---
   ```

3. Create `references/manifest.json` with metadata:
   ```json
   {
     "name": "skill-name",
     "version": "1.0.0",
     "description": "What the skill does",
     "category": "core",
     "triggers": ["slash-command-name"],
     "required_context": []
   }
   ```

4. Regenerate the skills index:
   ```bash
   node scripts/generate-index.cjs
   ```

5. Validate your skill:
   ```bash
   node scripts/validate-skills.cjs
   ```

### Skill Guidelines

- Keep skills focused on a single PM workflow or capability.
- Reference knowledge files rather than duplicating content.
- List all tools the skill depends on in the frontmatter.
- Write clear, direct instructions -- avoid vague language.

## Adding a New Script

Scripts go in the `scripts/` directory and provide CLI access to external services and utilities.

### Steps

1. Create your script in `scripts/` with a `.cjs` extension for Node.js scripts.
2. Add a description and usage instructions to the top of the file as comments.
3. Add the script to the CLI reference table in `README.md`.

### Script Guidelines

- Use `require()` syntax, not ES module `import`. Use the `.cjs` file extension.
- Load environment variables with dotenv using an explicit path:
  ```javascript
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
  ```
- Validate required environment variables at startup and fail fast with a clear error:
  ```javascript
  if (!process.env.MY_API_KEY) {
    console.error('Error: MY_API_KEY required in .env');
    process.exit(1);
  }
  ```
- Never hardcode API keys, tokens, or secrets.
- Include `--help` output that documents all subcommands and flags.
- Write to stdout for data output and stderr for status/error messages.

## Adding a New Slash Command

Slash commands are markdown files that Claude Code loads as custom commands.

### Steps

1. Create a file at `.claude/commands/<command-name>.md`.
2. Write the command instructions in markdown. The file content becomes the prompt that gets injected when a user invokes `/<command-name>`.
3. Document the command in `README.md` under the slash commands table.

### Slash Command Guidelines

- Keep commands focused on a single task or workflow.
- Reference skills by name so the router can find them.
- Include usage examples in the command file.

## Code Style

- **Node.js**: Use `require()` (CommonJS), not `import` (ESM). Use `.cjs` extension.
- **Environment variables**: Always load via `dotenv` with explicit path. Never hardcode secrets.
- **Error handling**: Fail fast with clear error messages. Validate inputs at the top of scripts.
- **Output**: Direct and concise. Bottom-line first. Avoid filler words.
- **No emojis** in code, comments, or documentation.

## Testing

Before submitting a PR, verify your changes work:

1. **Validate dependencies**: `node scripts/validate-dependencies.cjs`
2. **Validate skills** (if you changed skills): `node scripts/validate-skills.cjs`
3. **Regenerate index** (if you added/changed skills): `node scripts/generate-index.cjs`
4. **Test your script/skill manually** by running it end-to-end.

## Submitting a Pull Request

1. Create a feature branch from `main`.
2. Make your changes following the guidelines above.
3. Test locally.
4. Push your branch and open a PR against `main`.
5. Fill out the PR template completely.
6. Ensure no hardcoded credentials or company-specific references are included.
7. Update `README.md` if you added new features, scripts, or commands.

## What Not to Include

- API keys, tokens, or secrets of any kind.
- Company-specific data, internal URLs, or proprietary information.
- Large binary files or media assets.
- Auto-generated files that can be rebuilt from source (except `skills/_index.json`).
