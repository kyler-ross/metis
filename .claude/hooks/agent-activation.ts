import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface HookInput {
    prompt: string;
    session_id: string;
    user_id: string;
}

interface AgentRule {
    enforcement: 'block' | 'suggest' | 'inform';
    promptTriggers: {
        keywords: string[];
        intentPatterns: string[];
    };
    antiPatterns?: string[];
    confidenceThreshold: number;
    skillPath: string;
    message: string;
}

interface AgentRules {
    agents: Record<string, AgentRule>;
}

function calculateConfidence(
    prompt: string,
    rule: AgentRule
): number {
    let score = 0;
    const lowerPrompt = prompt.toLowerCase();

    // Check anti-patterns (disqualify if matched)
    if (rule.antiPatterns) {
        for (const antiPattern of rule.antiPatterns) {
            if (new RegExp(antiPattern, 'i').test(prompt)) {
                return 0; // Immediate disqualification
            }
        }
    }

    // Check keywords (each match adds to score)
    const keywordMatches = rule.promptTriggers.keywords.filter(kw =>
        lowerPrompt.includes(kw.toLowerCase())
    );
    const keywordScore = keywordMatches.length / rule.promptTriggers.keywords.length;

    // Check intent patterns (regex)
    const intentMatches = rule.promptTriggers.intentPatterns.filter(pattern =>
        new RegExp(pattern, 'i').test(prompt)
    );
    const intentScore = intentMatches.length > 0 ? 0.5 : 0;

    // Calculate weighted confidence
    score = (keywordScore * 0.6) + (intentScore * 0.4);

    // Boost for multiple keyword matches
    if (keywordMatches.length >= 2) {
        score += 0.2;
    }

    // Round to 2 decimal places to avoid floating point precision issues
    return Math.round(Math.min(score, 1.0) * 100) / 100;
}

async function main() {
    try {
        // Read JSON from stdin
        const input = readFileSync(0, 'utf-8');
        const data: HookInput = JSON.parse(input);

        // Load agent rules
        const rulesPath = resolve(__dirname, '../agents/agent-rules.json');
        const rules: AgentRules = JSON.parse(readFileSync(rulesPath, 'utf-8'));

        // Find best matching agent
        let bestMatch: { agent: string; confidence: number; rule: AgentRule } | null = null;

        for (const [agentName, rule] of Object.entries(rules.agents)) {
            const confidence = calculateConfidence(data.prompt, rule);

            if (confidence >= rule.confidenceThreshold) {
                if (!bestMatch || confidence > bestMatch.confidence) {
                    bestMatch = { agent: agentName, confidence, rule };
                }
            }
        }

        // Output based on best match
        if (bestMatch) {
            const { agent, confidence, rule } = bestMatch;

            // Format message based on enforcement mode
            let output = '';

            if (rule.enforcement === 'block') {
                output = `AGENT AUTO-ACTIVATION (${Math.round(confidence * 100)}% confidence)\n\n`;
                output += rule.message + '\n\n';
                output += `Read: ${rule.skillPath}`;
                console.log(output);
                process.exit(2); // Block execution

            } else if (rule.enforcement === 'suggest') {
                output = `Detected ${agent} context (${Math.round(confidence * 100)}% confidence)\n\n`;
                output += rule.message + '\n\n';
                output += `Read: ${rule.skillPath}`;
                console.log(output);
                process.exit(0); // Allow execution, inject suggestion

            } else {
                // 'inform' mode - just read the skill, no message
                output = `Read: ${rule.skillPath}`;
                console.log(output);
                process.exit(0);
            }
        }

        // No match - allow normal processing
        process.exit(0);

    } catch (error) {
        console.error('Hook error:', error);
        process.exit(1);
    }
}

main();
