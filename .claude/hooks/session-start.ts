import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';

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

/**
 * Check if the enrichment daemon is alive and restart it if dead.
 * Also triggers a one-time sync if the DB is stale (>30 min).
 *
 * This function is optional - if you don't use the enrichment daemon,
 * it will silently no-op. Customize the paths to match your setup.
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

    // Also check launchd (macOS only)
    if (!daemonAlive) {
        try {
            const output = execSync('launchctl list', { encoding: 'utf-8', timeout: 5000 });
            // Customize this service name to match your launchd plist
            const line = output.split('\n').find(l => l.includes('com.pm-ai.enrichment'));
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
            execSync('launchctl kickstart -k gui/$(id -u)/com.pm-ai.enrichment', {
                timeout: 5000,
                stdio: 'pipe'
            });
        } catch {
            // Kickstart failed - try manual start as fallback
            try {
                const daemonScript = resolve(projectDir, 'scripts/enrichment-daemon.js');
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
            const syncScript = resolve(projectDir, 'scripts/pm-data.cjs');
            if (existsSync(syncScript)) {
                // Check DB staleness via last imported_at
                const result = execSync(
                    `sqlite3 "${dbFile}" "SELECT MAX(imported_at) FROM sessions;"`,
                    { encoding: 'utf-8', timeout: 5000 }
                ).trim();

                if (result) {
                    const lastImport = new Date(result + 'Z');
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
        // Read JSON from stdin
        const input = readFileSync(0, 'utf-8');
        const data: SessionStartInput = JSON.parse(input);

        // Ensure enrichment daemon is alive (non-blocking best-effort)
        ensureDaemonAlive();

        // Check for user profile
        const profilePath = resolve(__dirname, '../../config/user-profile.json');
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
