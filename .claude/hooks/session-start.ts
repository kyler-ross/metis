import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, execFileSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectDir = resolve(__dirname, '../..');

interface SessionStartInput {
    session_id: string;
    user_id: string;
}

interface UserProfile {
    name?: string;
    pm_key?: string;
    teams_managed?: string[];
}

interface CredentialHealthResult {
    healthy: boolean;
    warnings: string[];
}

/**
 * Pure-filesystem credential health check via env-guard.cjs.
 * Delegates to the shared module to avoid duplicating parsing logic.
 * Warns only, never blocks session start.
 */
function checkCredentialHealth(): CredentialHealthResult {
    try {
        const envGuardPath = resolve(projectDir, '.ai/scripts/lib/env-guard.cjs');
        if (!existsSync(envGuardPath)) {
            return { healthy: true, warnings: [] };
        }

        const result = execFileSync('node', [
            '-e',
            `const g = require(${JSON.stringify(envGuardPath)}); const h = g.quickHealthCheck(); console.log(JSON.stringify(h));`
        ], { encoding: 'utf-8', timeout: 5000, cwd: projectDir }).trim();

        const health = JSON.parse(result);
        return {
            healthy: health.healthy,
            warnings: (health.issues || []).map((i: string) => `Credential warning: ${i}`),
        };
    } catch {
        // If env-guard fails, fall back silently - don't block session start
        return { healthy: true, warnings: [] };
    }
}

/**
 * Check if the enrichment daemon is alive and restart it if dead.
 * Also triggers a one-time sync if the DB is stale (>30 min).
 */
function ensureDaemonAlive(): void {
    const pidFile = resolve(process.env.HOME || '~', '.pm-ai', 'enrichment-daemon.pid');
    const dbFile = resolve(process.env.HOME || '~', '.pm-ai', 'chats.db');
    let daemonAlive = false;

    // Check PID file
    if (existsSync(pidFile)) {
        try {
            const pid = parseInt(readFileSync(pidFile, 'utf-8').trim());
            process.kill(pid, 0); // Throws if process doesn't exist
            daemonAlive = true;
        } catch {
            // PID file stale - daemon is dead
        }
    }

    // Also check launchd
    if (!daemonAlive) {
        try {
            const output = execSync('launchctl list', { encoding: 'utf-8', timeout: 5000 });
            const line = output.split('\n').find(l => l.includes('com.cloaked.pm-enrichment'));
            if (line && !line.trim().startsWith('-')) {
                daemonAlive = true;
            }
        } catch {
            // launchctl failed, not critical
        }
    }

    // If daemon is dead, try to restart via launchd
    if (!daemonAlive) {
        try {
            execSync('launchctl kickstart -k gui/$(id -u)/com.cloaked.pm-enrichment', {
                timeout: 5000,
                stdio: 'pipe'
            });
        } catch {
            // Kickstart failed - try manual start as fallback
            try {
                const daemonScript = resolve(projectDir, '.ai/scripts/enrichment-daemon.js');
                if (existsSync(daemonScript)) {
                    const child = spawn('node', [daemonScript], {
                        detached: true,
                        stdio: 'ignore',
                    });
                    child.unref();
                }
            } catch {
                // Best effort - don't block session start
            }
        }
    }

    // If DB is stale (>30 min), trigger a one-time sync in background
    if (existsSync(dbFile)) {
        try {
            const syncScript = resolve(projectDir, '.ai/scripts/pm-data.cjs');
            if (existsSync(syncScript)) {
                // Check DB staleness via last imported_at
                const result = execFileSync('sqlite3', [
                    dbFile,
                    'SELECT MAX(imported_at) FROM sessions;',
                ], { encoding: 'utf-8', timeout: 5000 }).trim();

                if (result) {
                    // Only append Z if the timestamp lacks a timezone indicator
                    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(result);
                    const lastImport = new Date(hasTimezone ? result : result + 'Z');
                    const staleMinutes = (Date.now() - lastImport.getTime()) / 60000;

                    if (staleMinutes > 30) {
                        // Fire-and-forget background sync
                        const child = spawn('node', [syncScript, 'sync'], {
                            detached: true,
                            stdio: 'ignore',
                            cwd: projectDir,
                        });
                        child.unref();
                    }
                }
            }
        } catch {
            // Non-critical - daemon will handle sync on its schedule
        }
    }
}

async function main() {
    try {
        // Read JSON from stdin (guard against TTY hang)
        const input = process.stdin.isTTY ? '' : readFileSync(0, 'utf-8');
        const data: SessionStartInput = input ? JSON.parse(input) : { session_id: '', user_id: '' };

        // Ensure enrichment daemon is alive (non-blocking best-effort)
        ensureDaemonAlive();

        // Check credential health (warn only, never block)
        const credHealth = checkCredentialHealth();

        // Check for user profile
        const profilePath = resolve(__dirname, '../../.ai/local/user-profile.json');
        let profile: UserProfile | null = null;

        if (existsSync(profilePath)) {
            profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
        }

        // Build greeting
        let greeting = 'Ready to help with PM work';
        if (profile?.name) {
            greeting += `, ${profile.name}`;
        }
        greeting += '.\n\n';

        // Common operations
        greeting += 'Common operations:\n';

        if (profile?.teams_managed && profile.teams_managed.length > 0) {
            greeting += `- /pm-daily - Morning sync for ${profile.teams_managed.join(', ')}\n`;
        } else {
            greeting += '- /pm-daily - Morning sync and priorities\n';
        }

        greeting += '- /pm-ai [task] - Route to appropriate agent\n';
        greeting += '- /pm-jira [description] - Create or update tickets\n';
        greeting += '- /pm-coach - Product strategy guidance\n';

        // Add credential warnings if any
        if (!credHealth.healthy) {
            greeting += '\n';
            for (const warning of credHealth.warnings) {
                greeting += `${warning}\n`;
            }
        }

        greeting += '\n';
        greeting += 'Type /help for all commands or just tell me what you need.';

        // Output greeting
        console.log(greeting);
        process.exit(0);

    } catch (error) {
        // Silent fail - don't block session start
        process.exit(0);
    }
}

main();
