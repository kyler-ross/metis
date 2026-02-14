/**
 * Enhanced syncTranscripts Implementation
 *
 * This is the replacement for the syncTranscripts() function in experiment-sync.cjs
 *
 * To integrate:
 * 1. Add this line at top of experiment-sync.cjs after other requires:
 *    const transcriptHelpers = require('./transcript-sync-helpers.cjs');
 *
 * 2. Replace the existing syncTranscripts function with the implementation below
 */

function syncTranscripts(dryRun = false) {
  console.log('\n=== Transcripts ===\n');

  if (!config.sources.transcripts?.enabled) {
    console.log('  [DISABLED]');
    return { synced: 0, found: 0 };
  }

  // Import helpers
  const {
    parseSpeakerStatements,
    extractExperimentMentions,
    extractContext,
    detectDiscussionType,
    extractDecisions,
    extractActionItems,
    detectSentiment,
    extractMeetingDate,
    identifyExperiment
  } = require('./transcript-sync-helpers.cjs');

  const basePath = path.resolve(__dirname, '..');
  let totalMentions = 0;
  let filesScanned = 0;
  const allMentions = [];

  for (const relPath of config.sources.transcripts.paths || []) {
    const dirPath = path.resolve(basePath, relPath);

    if (!fs.existsSync(dirPath)) {
      console.log(`  Path not found: ${relPath}`);
      continue;
    }

    // Scan transcript files with deep extraction
    try {
      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
        .sort();

      filesScanned += files.length;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Quick check if file mentions experiments
        if (!/experiment|a\/b test|variant|feature flag/i.test(content)) {
          continue;
        }

        totalMentions++;

        // Parse speaker statements
        const statements = parseSpeakerStatements(content);

        // Extract experiment mentions
        const mentions = extractExperimentMentions(content, file, statements);

        // Extract meeting date
        const meetingDate = extractMeetingDate(file, content);

        // Process each mention
        for (const mention of mentions) {
          const context = extractContext(statements, mention, 3);
          const discussionType = detectDiscussionType(mention, context);
          const decisions = extractDecisions(context);
          const actionItems = extractActionItems(context);
          const sentiment = detectSentiment(context);
          const experimentKey = identifyExperiment(mention, context);

          // Get unique speakers from context
          const contextStatements = statements.filter(s =>
            Math.abs(s.lineNumber - mention.lineNumber) <= 3
          );
          const speakerMap = new Map();

          for (const stmt of contextStatements) {
            if (!speakerMap.has(stmt.speaker)) {
              speakerMap.set(stmt.speaker, []);
            }
            speakerMap.get(stmt.speaker).push(stmt.text);
          }

          const speakers = Array.from(speakerMap.entries()).map(([name, statements]) => ({
            name,
            statements: statements.slice(0, 3) // Limit to 3 statements per speaker
          }));

          allMentions.push({
            file,
            date: meetingDate,
            experiment_key: experimentKey,
            type: discussionType,
            speakers,
            decisions,
            action_items: actionItems,
            context,
            sentiment,
            keywords: mention.keywords,
            timestamp: mention.timestamp
          });
        }
      }
    } catch (e) {
      console.log(`  Error scanning ${relPath}: ${e.message}`);
    }
  }

  console.log(`  Scanned ${filesScanned} files`);
  console.log(`  Found ${totalMentions} files with experiment mentions`);
  console.log(`  Extracted ${allMentions.length} detailed mentions`);

  // Save detailed mentions to _raw/transcript-mentions.json
  if (!dryRun && allMentions.length > 0) {
    const output = {
      generated_at: new Date().toISOString(),
      total_files_scanned: filesScanned,
      files_with_mentions: totalMentions,
      total_mentions_extracted: allMentions.length,
      mentions: allMentions
    };

    saveRaw('transcript-mentions.json', output);
    console.log(`  Saved detailed extraction to _raw/transcript-mentions.json`);

    // Show breakdown by experiment
    const byExperiment = {};
    for (const m of allMentions) {
      byExperiment[m.experiment_key] = (byExperiment[m.experiment_key] || 0) + 1;
    }
    console.log('\n  Mentions by experiment:');
    for (const [key, count] of Object.entries(byExperiment).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${key}: ${count}`);
    }
  }

  if (!dryRun) {
    updateSources('transcripts', {
      items_found: filesScanned,
      experiment_mentions: totalMentions,
      detailed_extractions: allMentions.length,
      status: 'synced',
      notes: `${filesScanned} transcripts scanned; ${totalMentions} contain experiment content; ${allMentions.length} detailed mentions extracted with speaker attribution, context, and decisions`
    });
  }

  return { synced: totalMentions, found: filesScanned, extracted: allMentions.length };
}
