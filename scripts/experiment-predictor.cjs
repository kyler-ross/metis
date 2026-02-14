#!/usr/bin/env node
/**
 * Experiment Outcome Predictor
 *
 * Weighted Bayesian Rubric model for predicting A/B test outcomes.
 * Based on 15 concluded Cloaked experiments (5 won, 6 lost, 4 inconclusive).
 *
 * Architecture:
 *   Layer 1: Expert-encoded feature scoring (6 binary features)
 *   Layer 2: Naive Bayes with Laplace-smoothed, shrinkage-adjusted likelihood ratios
 *   Layer 3: Confidence banding with risk flags
 *
 * Usage:
 *   node experiment-predictor.cjs predict <experiment.json>
 *   node experiment-predictor.cjs backtest
 *   node experiment-predictor.cjs calibration
 *   node experiment-predictor.cjs score --interactive
 *
 * References:
 *   - Kohavi et al., "Trustworthy Online Controlled Experiments" (2020)
 *   - Hand & Yu, "Idiot's Bayes -- Not So Stupid After All?" (2001)
 *   - Booking.com, "157 Experiments" (KDD 2017)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { track, trackComplete, trackError, flush } = require('./lib/telemetry.cjs');

// ============================================================================
// TRAINING DATA - Feature vectors from 15 concluded experiments
// ============================================================================

const TRAINING_DATA = [
  // === WON (5) ===
  { id: "counter_display", outcome: "won", lift: 6.3,
    action_framing: 1, trust_preserved: 1, copy_only: 0,
    low_cognitive_load: 1, high_hyp_confidence: 1, targets_dropoff: 1 },
  { id: "poa_agreement", outcome: "won", lift: 11.4,
    action_framing: 1, trust_preserved: 1, copy_only: 1,
    low_cognitive_load: 1, high_hyp_confidence: 1, targets_dropoff: 1 },
  { id: "otp_error_messaging", outcome: "won", lift: 10.9,
    action_framing: 1, trust_preserved: 1, copy_only: 1,
    low_cognitive_load: 1, high_hyp_confidence: 1, targets_dropoff: 1 },
  { id: "feed_health_score", outcome: "won", lift: 50.0,
    action_framing: 1, trust_preserved: 1, copy_only: 0,
    low_cognitive_load: 0, high_hyp_confidence: 1, targets_dropoff: 1 },
  { id: "health_score_cta_copy", outcome: "won", lift: 10.0,
    action_framing: 1, trust_preserved: 1, copy_only: 1,
    low_cognitive_load: 1, high_hyp_confidence: 1, targets_dropoff: 1 },

  // === LOST (6) ===
  { id: "scan_results_feedback", outcome: "lost", lift: -7.4,
    action_framing: 0, trust_preserved: 0, copy_only: 0,
    low_cognitive_load: 0, high_hyp_confidence: 0, targets_dropoff: 0 },
  { id: "network_visualization", outcome: "lost", lift: -15.8,
    action_framing: 0, trust_preserved: 0, copy_only: 0,
    low_cognitive_load: 0, high_hyp_confidence: 0, targets_dropoff: 0 },
  { id: "checkout_light_mode", outcome: "lost", lift: null,
    action_framing: 0, trust_preserved: 0, copy_only: 0,
    low_cognitive_load: 0, high_hyp_confidence: 0, targets_dropoff: 0 },
  { id: "checkout_fixed_cta", outcome: "lost", lift: -29.4,
    action_framing: 0, trust_preserved: 1, copy_only: 0,
    low_cognitive_load: 1, high_hyp_confidence: 0, targets_dropoff: 1 },
  { id: "checkout_reduced_visual_clutter", outcome: "lost", lift: -7.0,
    action_framing: 0, trust_preserved: 0, copy_only: 0,
    low_cognitive_load: 1, high_hyp_confidence: 0, targets_dropoff: 1 },
  { id: "learn_more_fake_door", outcome: "lost", lift: null,
    action_framing: 0, trust_preserved: 1, copy_only: 0,
    low_cognitive_load: 0, high_hyp_confidence: 0, targets_dropoff: 0 },

  // === INCONCLUSIVE (4) - used for backtest validation only ===
  { id: "checkout_trust_badges", outcome: "inconclusive", lift: null,
    action_framing: 0, trust_preserved: 1, copy_only: 0,
    low_cognitive_load: 1, high_hyp_confidence: 0, targets_dropoff: 1 },
  { id: "call_guard_intro", outcome: "inconclusive", lift: null,
    action_framing: 0, trust_preserved: 1, copy_only: 0,
    low_cognitive_load: 0, high_hyp_confidence: 0, targets_dropoff: 0 },
  { id: "call_guard_forwarding", outcome: "inconclusive", lift: -0.78,
    action_framing: 1, trust_preserved: 1, copy_only: 0,
    low_cognitive_load: 1, high_hyp_confidence: 1, targets_dropoff: 0 },
  { id: "copybara_impact", outcome: "inconclusive", lift: null,
    action_framing: 0, trust_preserved: 1, copy_only: 1,
    low_cognitive_load: 1, high_hyp_confidence: 0, targets_dropoff: 0 },
];

const FEATURES = [
  'action_framing',
  'trust_preserved',
  'copy_only',
  'low_cognitive_load',
  'high_hyp_confidence',
  'targets_dropoff',
];

const FEATURE_LABELS = {
  action_framing: 'Action-oriented framing (vs passive/educational)',
  trust_preserved: 'Trust signals preserved (no removal of brand/security elements)',
  copy_only: 'Copy/messaging change only (vs structural/visual)',
  low_cognitive_load: 'Low cognitive load added at decision moment',
  high_hyp_confidence: 'High hypothesis confidence (grounded in evidence/theory)',
  targets_dropoff: 'Targets a measured funnel drop-off point',
};

const REGULARIZATION_K = 3; // Shrinkage constant

// ============================================================================
// MODEL COMPUTATION
// ============================================================================

function computeLikelihoodRatios(trainingData, excludeId = null) {
  const decisive = trainingData.filter(e =>
    (e.outcome === 'won' || e.outcome === 'lost') && e.id !== excludeId
  );
  const wins = decisive.filter(e => e.outcome === 'won');
  const losses = decisive.filter(e => e.outcome === 'lost');
  const nWins = wins.length;
  const nLosses = losses.length;

  const ratios = {};

  for (const f of FEATURES) {
    // Count feature=1 occurrences in wins and losses
    const winsWithFeature = wins.filter(e => e[f] === 1).length;
    const lossesWithFeature = losses.filter(e => e[f] === 1).length;

    // Laplace smoothing (add 0.5 to every cell)
    const pFeatureGivenWin = (winsWithFeature + 0.5) / (nWins + 1);
    const pFeatureGivenLoss = (lossesWithFeature + 0.5) / (nLosses + 1);

    // Also compute LR for feature=0
    const pNoFeatureGivenWin = (nWins - winsWithFeature + 0.5) / (nWins + 1);
    const pNoFeatureGivenLoss = (nLosses - lossesWithFeature + 0.5) / (nLosses + 1);

    // Raw likelihood ratios
    const lrPresent = pFeatureGivenWin / pFeatureGivenLoss;
    const lrAbsent = pNoFeatureGivenWin / pNoFeatureGivenLoss;

    // Shrinkage: LR_adjusted = LR^(n / (n + k))
    // n = minimum count informing the ratio
    const nInforming = Math.min(winsWithFeature + (nWins - winsWithFeature),
                                 lossesWithFeature + (nLosses - lossesWithFeature));
    const shrinkage = nInforming / (nInforming + REGULARIZATION_K);

    const lrPresentAdj = Math.pow(lrPresent, shrinkage);
    const lrAbsentAdj = Math.pow(lrAbsent, shrinkage);

    ratios[f] = {
      lr_present: lrPresent,
      lr_absent: lrAbsent,
      lr_present_adj: lrPresentAdj,
      lr_absent_adj: lrAbsentAdj,
      wins_with: winsWithFeature,
      losses_with: lossesWithFeature,
      shrinkage,
    };
  }

  // Base rate (prior odds)
  const priorWinRate = nWins / (nWins + nLosses);
  const priorOdds = nWins / nLosses;

  return { ratios, priorOdds, priorWinRate, nWins, nLosses };
}

function predict(features, model = null) {
  if (!model) model = computeLikelihoodRatios(TRAINING_DATA);

  let posteriorOdds = model.priorOdds;
  const featureContributions = [];

  for (const f of FEATURES) {
    const r = model.ratios[f];
    const featureValue = features[f];
    const lr = featureValue === 1 ? r.lr_present_adj : r.lr_absent_adj;

    posteriorOdds *= lr;

    featureContributions.push({
      feature: f,
      label: FEATURE_LABELS[f],
      value: featureValue,
      lr_raw: featureValue === 1 ? r.lr_present : r.lr_absent,
      lr_adjusted: lr,
      direction: lr > 1 ? 'toward_win' : lr < 1 ? 'toward_loss' : 'neutral',
      strength: Math.abs(Math.log2(lr)),
    });
  }

  const winProbability = posteriorOdds / (1 + posteriorOdds);

  // Category assignment
  let category;
  if (winProbability > 0.65) category = 'LIKELY WIN';
  else if (winProbability < 0.35) category = 'LIKELY LOSE';
  else category = 'TOSS-UP';

  // Risk flags
  const riskFlags = [];

  if (features.trust_preserved === 0) {
    riskFlags.push({ level: 'HARD_VETO', message: 'Trust signal removed - historically 100% lose rate when trust signals are compromised' });
  }
  if (features.low_cognitive_load === 0 && features.action_framing === 0) {
    riskFlags.push({ level: 'HIGH_RISK', message: 'Adds cognitive load without action framing - passive complexity kills conversion' });
  }
  if (features.copy_only === 0 && features.action_framing === 0) {
    riskFlags.push({ level: 'CAUTION', message: 'Structural/visual change without action framing - higher variance outcome' });
  }
  if (features.targets_dropoff === 0) {
    riskFlags.push({ level: 'CAUTION', message: 'Does not target a measured funnel drop-off point - may solve wrong problem' });
  }
  if (features.high_hyp_confidence === 0) {
    riskFlags.push({ level: 'CAUTION', message: 'Low hypothesis confidence - consider more research before launch' });
  }
  if (features.action_framing === 1 && features.trust_preserved === 1 && features.targets_dropoff === 1) {
    riskFlags.push({ level: 'POSITIVE', message: 'Matches winning pattern: action framing + trust preserved + targets drop-off' });
  }
  if (features.copy_only === 1 && features.action_framing === 1) {
    riskFlags.push({ level: 'POSITIVE', message: 'Copy-only with action framing - highest win-rate combination in historical data' });
  }

  // Historical lift context
  const wonLifts = TRAINING_DATA.filter(e => e.outcome === 'won' && e.lift != null).map(e => e.lift);
  const liftContext = {
    min: Math.min(...wonLifts),
    max: Math.max(...wonLifts),
    median: wonLifts.sort((a,b) => a - b)[Math.floor(wonLifts.length / 2)],
    note: 'Historical winners saw 6-50% lift (median 10.9%)',
  };

  // Sort contributions by strength
  featureContributions.sort((a, b) => b.strength - a.strength);

  return {
    win_probability: winProbability,
    category,
    prior_win_rate: model.priorWinRate,
    posterior_odds: posteriorOdds,
    risk_flags: riskFlags,
    feature_contributions: featureContributions,
    lift_context: liftContext,
    model_info: {
      training_size: model.nWins + model.nLosses,
      n_wins: model.nWins,
      n_losses: model.nLosses,
      regularization_k: REGULARIZATION_K,
    },
  };
}

// ============================================================================
// BACKTEST (Leave-One-Out Cross-Validation)
// ============================================================================

function backtest() {
  const results = [];
  let brierSum = 0;
  let baselineBrierSum = 0;
  let correct = 0;
  let total = 0;

  for (const exp of TRAINING_DATA) {
    // Compute model WITHOUT this experiment
    const model = computeLikelihoodRatios(TRAINING_DATA, exp.id);

    // Predict this experiment
    const prediction = predict(exp, model);
    const actual = exp.outcome === 'won' ? 1 : (exp.outcome === 'lost' ? 0 : null);

    // For decisive outcomes, compute Brier score
    if (actual !== null) {
      const brier = Math.pow(prediction.win_probability - actual, 2);
      brierSum += brier;

      // Baseline: always predict base rate
      const baselineBrier = Math.pow(model.priorWinRate - actual, 2);
      baselineBrierSum += baselineBrier;

      const predictedOutcome = prediction.win_probability > 0.5 ? 'won' : 'lost';
      if (predictedOutcome === exp.outcome) correct++;
      total++;
    }

    results.push({
      id: exp.id,
      actual: exp.outcome,
      predicted_prob: prediction.win_probability,
      predicted_category: prediction.category,
      correct: actual !== null ? (prediction.win_probability > 0.5 ? 'won' : 'lost') === exp.outcome : 'n/a',
      risk_flags: prediction.risk_flags.map(f => f.level).join(', '),
    });
  }

  const brierScore = brierSum / total;
  const baselineBrier = baselineBrierSum / total;
  const accuracy = correct / total;
  const brierSkillScore = 1 - (brierScore / baselineBrier);

  return {
    experiments: results,
    summary: {
      accuracy: `${correct}/${total} (${(accuracy * 100).toFixed(1)}%)`,
      brier_score: brierScore.toFixed(4),
      baseline_brier: baselineBrier.toFixed(4),
      brier_skill_score: brierSkillScore.toFixed(4),
      interpretation: brierSkillScore > 0
        ? `Model beats base-rate by ${(brierSkillScore * 100).toFixed(1)}% (Brier Skill Score)`
        : 'Model does not beat base-rate prediction',
    },
  };
}

// ============================================================================
// CALIBRATION REPORT
// ============================================================================

function calibrationReport() {
  const model = computeLikelihoodRatios(TRAINING_DATA);

  const report = {
    base_rate: {
      win_rate: `${model.nWins}/${model.nWins + model.nLosses} = ${(model.priorWinRate * 100).toFixed(1)}%`,
      prior_odds: model.priorOdds.toFixed(3),
      note: 'Among decisive outcomes (won or lost), excluding inconclusive',
    },
    likelihood_ratios: {},
    feature_discriminative_power: [],
  };

  for (const f of FEATURES) {
    const r = model.ratios[f];
    report.likelihood_ratios[f] = {
      label: FEATURE_LABELS[f],
      present: { raw: r.lr_present.toFixed(3), adjusted: r.lr_present_adj.toFixed(3) },
      absent: { raw: r.lr_absent.toFixed(3), adjusted: r.lr_absent_adj.toFixed(3) },
      wins_with_feature: `${r.wins_with}/${model.nWins}`,
      losses_with_feature: `${r.losses_with}/${model.nLosses}`,
      shrinkage_factor: r.shrinkage.toFixed(3),
    };

    // Discriminative power = log2(LR_present / LR_absent)
    const power = Math.log2(r.lr_present_adj / r.lr_absent_adj);
    report.feature_discriminative_power.push({
      feature: f,
      label: FEATURE_LABELS[f],
      power: power.toFixed(3),
    });
  }

  // Sort by discriminative power
  report.feature_discriminative_power.sort((a, b) => parseFloat(b.power) - parseFloat(a.power));

  return report;
}

// ============================================================================
// PREDICT FROM EXPERIMENT JSON
// ============================================================================

function predictFromExperimentJson(expPath) {
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf-8'));

  console.log(`\n--- Predicting: ${exp.canonical_name || exp.experiment_id || path.basename(expPath)} ---\n`);
  console.log('NOTE: Feature scoring requires human judgment. Review each feature below.\n');
  console.log('The following features were auto-detected where possible:\n');

  // Attempt auto-detection from experiment JSON
  const features = {};
  const autoNotes = {};

  // Hypothesis confidence
  const hypConf = exp?.hypothesis?.confidence_level;
  if (hypConf === 'high') { features.high_hyp_confidence = 1; autoNotes.high_hyp_confidence = `Auto: hypothesis.confidence_level = "${hypConf}"`; }
  else if (hypConf) { features.high_hyp_confidence = 0; autoNotes.high_hyp_confidence = `Auto: hypothesis.confidence_level = "${hypConf}"`; }

  // Taxonomy hints
  const subcat = exp?.taxonomy?.subcategory || '';
  const tags = (exp?.taxonomy?.tags || []).join(' ');

  if (subcat.includes('copy') || subcat.includes('messaging') || tags.includes('copy') || tags.includes('ux-copy')) {
    features.copy_only = 1;
    autoNotes.copy_only = `Auto: taxonomy suggests copy change (${subcat})`;
  }

  // Funnel stage
  const stage = exp?.taxonomy?.funnel_stage;
  if (stage === 'conversion' || stage === 'activation') {
    features.targets_dropoff = 1;
    autoNotes.targets_dropoff = `Auto: funnel_stage="${stage}" typically targets known drop-offs (verify)`;
  }

  // Output what we know and what needs human input
  for (const f of FEATURES) {
    const val = features[f];
    const note = autoNotes[f] || '';
    if (val !== undefined) {
      console.log(`  [AUTO] ${FEATURE_LABELS[f]}: ${val === 1 ? 'YES' : 'NO'} ${note}`);
    } else {
      console.log(`  [NEED] ${FEATURE_LABELS[f]}: ? (requires human judgment)`);
    }
  }

  return { features, autoNotes, experiment: exp };
}

// ============================================================================
// INTERACTIVE SCORING
// ============================================================================

async function interactiveScore() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('\n=== Experiment Outcome Predictor ===');
  console.log('Answer each question about your planned experiment.\n');

  const name = await ask('Experiment name: ');
  console.log('');

  const features = {};
  const questions = [
    { key: 'action_framing', q: 'Does the variant use action-oriented framing?\n  (urgency, permission, progress, social proof -- NOT passive, educational, informational)\n  [y/n]: ' },
    { key: 'trust_preserved', q: 'Are all trust signals preserved?\n  (brand logos, security badges, consistent visual identity -- nothing removed)\n  [y/n]: ' },
    { key: 'copy_only', q: 'Is this a copy/messaging-only change?\n  (no structural, layout, or visual design changes)\n  [y/n]: ' },
    { key: 'low_cognitive_load', q: 'Does the variant maintain or reduce cognitive load?\n  (no new decisions, evaluations, or interpretations required at the decision moment)\n  [y/n]: ' },
    { key: 'high_hyp_confidence', q: 'Is the hypothesis grounded in evidence?\n  (established UX principles, user research, industry data, or prior experiment learnings)\n  [y/n]: ' },
    { key: 'targets_dropoff', q: 'Does this target a measured funnel drop-off point?\n  (you have data showing users drop at this exact step)\n  [y/n]: ' },
  ];

  for (const { key, q } of questions) {
    const answer = await ask(q);
    features[key] = answer.toLowerCase().startsWith('y') ? 1 : 0;
    console.log('');
  }

  rl.close();

  const result = predict(features);
  printPrediction(name, features, result);
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function printPrediction(name, features, result) {
  console.log('\n' + '='.repeat(70));
  console.log(`PREDICTION: ${name}`);
  console.log('='.repeat(70));

  // Category with visual emphasis
  const categoryEmoji = result.category === 'LIKELY WIN' ? '[+]' :
                         result.category === 'LIKELY LOSE' ? '[-]' : '[~]';
  console.log(`\n  ${categoryEmoji} ${result.category} -- Win probability: ${(result.win_probability * 100).toFixed(1)}%`);
  console.log(`      (Base rate: ${(result.prior_win_rate * 100).toFixed(1)}% | Training: ${result.model_info.training_size} decisive experiments)`);

  // Risk flags
  if (result.risk_flags.length > 0) {
    console.log('\n  RISK FLAGS:');
    for (const flag of result.risk_flags) {
      const icon = flag.level === 'HARD_VETO' ? '!!!' :
                   flag.level === 'HIGH_RISK' ? ' !!' :
                   flag.level === 'CAUTION' ? '  !' :
                   '  +';
      console.log(`    ${icon} [${flag.level}] ${flag.message}`);
    }
  }

  // Feature contributions (sorted by influence)
  console.log('\n  FEATURE ANALYSIS (sorted by influence):');
  for (const fc of result.feature_contributions) {
    const arrow = fc.direction === 'toward_win' ? '>>' :
                  fc.direction === 'toward_loss' ? '<<' : '--';
    const valStr = fc.value === 1 ? 'YES' : 'NO ';
    console.log(`    ${arrow} ${valStr} ${fc.label}`);
    console.log(`         LR: ${fc.lr_adjusted.toFixed(3)} (${fc.direction}, strength: ${fc.strength.toFixed(2)})`);
  }

  // Lift context
  console.log(`\n  HISTORICAL CONTEXT: ${result.lift_context.note}`);

  // Confidence caveat
  console.log('\n  NOTE: Model trained on 11 decisive experiments. Treat as directional');
  console.log('  signal, not a guarantee. Prediction improves as more experiments conclude.');
  console.log('='.repeat(70));
}

function printBacktest(bt) {
  console.log('\n' + '='.repeat(70));
  console.log('BACKTEST: Leave-One-Out Cross-Validation');
  console.log('='.repeat(70));

  console.log(`\n  Accuracy:           ${bt.summary.accuracy}`);
  console.log(`  Brier Score:        ${bt.summary.brier_score} (lower = better)`);
  console.log(`  Baseline Brier:     ${bt.summary.baseline_brier} (always predict base rate)`);
  console.log(`  Brier Skill Score:  ${bt.summary.brier_skill_score}`);
  console.log(`  Interpretation:     ${bt.summary.interpretation}`);

  console.log('\n  Per-Experiment Results:');
  console.log('  ' + '-'.repeat(66));
  console.log(`  ${'Experiment'.padEnd(30)} ${'Actual'.padEnd(14)} ${'P(win)'.padEnd(10)} ${'Category'.padEnd(14)} OK?`);
  console.log('  ' + '-'.repeat(66));

  for (const e of bt.experiments) {
    const ok = e.correct === true ? 'Y' : e.correct === false ? 'N' : '-';
    console.log(`  ${e.id.padEnd(30)} ${e.actual.padEnd(14)} ${(e.predicted_prob * 100).toFixed(1).padStart(5)}%    ${e.predicted_category.padEnd(14)} ${ok}`);
  }
  console.log('  ' + '-'.repeat(66));
}

function printCalibration(cal) {
  console.log('\n' + '='.repeat(70));
  console.log('CALIBRATION REPORT');
  console.log('='.repeat(70));

  console.log(`\n  Base Rate: ${cal.base_rate.win_rate}`);
  console.log(`  Prior Odds: ${cal.base_rate.prior_odds}`);
  console.log(`  ${cal.base_rate.note}`);

  console.log('\n  FEATURE DISCRIMINATIVE POWER (sorted by predictive value):');
  console.log('  ' + '-'.repeat(66));
  for (const fp of cal.feature_discriminative_power) {
    const bar = '#'.repeat(Math.round(Math.abs(parseFloat(fp.power)) * 3));
    console.log(`  ${parseFloat(fp.power).toFixed(2).padStart(6)} ${bar.padEnd(15)} ${fp.label}`);
  }

  console.log('\n  LIKELIHOOD RATIOS:');
  console.log('  ' + '-'.repeat(66));
  for (const f of FEATURES) {
    const r = cal.likelihood_ratios[f];
    console.log(`\n  ${r.label}`);
    console.log(`    Present: LR=${r.present.adjusted} (raw ${r.present.raw}) | Won: ${r.wins_with_feature}, Lost: ${r.losses_with_feature}`);
    console.log(`    Absent:  LR=${r.absent.adjusted} (raw ${r.absent.raw}) | Shrinkage: ${r.shrinkage_factor}`);
  }
  console.log('\n' + '='.repeat(70));
}

// ============================================================================
// JSON OUTPUT (for programmatic use)
// ============================================================================

function predictJson(features, name = 'unnamed') {
  const result = predict(features);
  return {
    experiment: name,
    input_features: features,
    prediction: {
      category: result.category,
      win_probability: parseFloat(result.win_probability.toFixed(4)),
      prior_win_rate: parseFloat(result.prior_win_rate.toFixed(4)),
    },
    risk_flags: result.risk_flags,
    feature_contributions: result.feature_contributions.map(fc => ({
      feature: fc.feature,
      value: fc.value,
      lr_adjusted: parseFloat(fc.lr_adjusted.toFixed(4)),
      direction: fc.direction,
      strength: parseFloat(fc.strength.toFixed(4)),
    })),
    lift_context: result.lift_context,
    model_info: result.model_info,
  };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const startTime = Date.now();

  track('pm_ai_experiment_predictor_start', { command });

  try {
  if (command === 'backtest') {
    const bt = backtest();
    if (args.includes('--json')) {
      console.log(JSON.stringify(bt, null, 2));
    } else {
      printBacktest(bt);
    }
  } else if (command === 'calibration') {
    const cal = calibrationReport();
    if (args.includes('--json')) {
      console.log(JSON.stringify(cal, null, 2));
    } else {
      printCalibration(cal);
    }
  } else if (command === 'score' && args.includes('--interactive')) {
    await interactiveScore();
  } else if (command === 'predict' && args[1]) {
    const result = predictFromExperimentJson(args[1]);
    console.log('\nTo complete prediction, provide missing features as JSON:');
    console.log(`  node experiment-predictor.cjs predict-features '${JSON.stringify(result.features)}'`);
  } else if (command === 'predict-features') {
    const features = JSON.parse(args[1]);
    const name = args[2] || 'experiment';
    const result = predict(features);
    if (args.includes('--json')) {
      console.log(JSON.stringify(predictJson(features, name), null, 2));
    } else {
      printPrediction(name, features, result);
    }
  } else {
    console.log(`
Experiment Outcome Predictor
Usage:
  node experiment-predictor.cjs backtest              Run LOO cross-validation
  node experiment-predictor.cjs backtest --json       ... as JSON
  node experiment-predictor.cjs calibration           Show model calibration & feature power
  node experiment-predictor.cjs calibration --json    ... as JSON
  node experiment-predictor.cjs score --interactive   Score a new experiment interactively
  node experiment-predictor.cjs predict <file.json>   Auto-detect features from experiment JSON
  node experiment-predictor.cjs predict-features '{"action_framing":1,...}' [name] [--json]
    `);
  }

    trackComplete('pm_ai_experiment_predictor_complete', startTime, { command, success: true });
    await flush();
  } catch (err) {
    trackError('pm_ai_experiment_predictor_error', err, { command });
    await flush();
    throw err;
  }
}

main().catch(console.error);
