#!/usr/bin/env node
/**
 * Create End of Year Hackathon 2025 Confluence Documentation
 *
 * Creates:
 * - 1 Hub page under Documents
 * - 7 Brief PRD pages as children of hub
 */

const { confluence } = require('./lib/confluence-client');
const { run } = require('./lib/script-runner.cjs');

const DOCUMENTS_PAGE_ID = '801374793';
const SPACE_KEY = 'PM';

// Account IDs for user linking
const USERS = {
  kyler: '63d047eaa197e05f9dad8333',
  rohini: '712020:0f4dd0ac-9d8d-4af9-b152-be40ea8f5b1c'
};

// PRD template generator
function generateBriefPRD({ title, status = 'DRAFT', owner, designer = 'TBD', techLead = 'TBD', executiveSummary, background, kpis, inScope, outOfScope, assumptions, constraints, risks, requirements, openQuestions }) {

  const ownerAccountId = USERS[owner?.toLowerCase()] || USERS.kyler;

  const kpiRows = (kpis || []).map(kpi =>
    `<tr><td><p>${kpi.goal}</p></td><td><p>${kpi.metric}</p></td></tr>`
  ).join('\n');

  const requirementRows = (requirements || []).map(req =>
    `<tr><td><p>${req.requirement}</p></td><td><p>${req.userStory}</p></td><td><p>${req.notes || ''}</p></td></tr>`
  ).join('\n');

  const questionRows = (openQuestions || []).map(q =>
    `<tr><td><p>${q.question}</p></td><td><p>${q.answer || ''}</p></td><td><p>${q.date || ''}</p></td></tr>`
  ).join('\n');

  return `<ac:structured-macro ac:name="details" ac:schema-version="1" data-layout="default" ac:local-id="details-1">
<ac:rich-text-body>
<table data-layout="default"><colgroup><col style="width: 166.0px;" /><col style="width: 560.0px;" /></colgroup>
<tbody>
<tr><th><p><strong>Document status</strong></p></th><td><p><ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="title">${status}</ac:parameter></ac:structured-macro></p></td></tr>
<tr><th><p><strong>Document owner</strong></p></th><td><p><ac:link><ri:user ri:account-id="${ownerAccountId}" /></ac:link></p></td></tr>
<tr><th><p><strong>Designer</strong></p></th><td><p>${designer}</p></td></tr>
<tr><th><p><strong>Tech lead</strong></p></th><td><p>${techLead}</p></td></tr>
<tr><th><p><strong>Created</strong></p></th><td><p>December 11, 2025</p></td></tr>
</tbody>
</table>
</ac:rich-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default"><ac:parameter ac:name="minLevel">1</ac:parameter><ac:parameter ac:name="maxLevel">3</ac:parameter><ac:parameter ac:name="outline">true</ac:parameter></ac:structured-macro>

<ac:structured-macro ac:name="panel" ac:schema-version="1"><ac:parameter ac:name="panelIconId">atlassian-light_bulb_on</ac:parameter><ac:parameter ac:name="panelIcon">:light_bulb_on:</ac:parameter><ac:parameter ac:name="bgColor">#DEEBFF</ac:parameter>
<ac:rich-text-body>
<h2>Executive Summary</h2>
<p>${executiveSummary}</p>
</ac:rich-text-body>
</ac:structured-macro>

<h2>🔍 Background &amp; Problem</h2>
<p>${background}</p>

<h2>📈 KPIs and Goals</h2>
<table data-table-width="760" data-layout="default"><colgroup><col style="width: 380.0px;" /><col style="width: 380.0px;" /></colgroup>
<tbody>
<tr><th data-highlight-colour="#e6fcff"><p><strong>Goal</strong></p></th><th data-highlight-colour="#e6fcff"><p><strong>Metric</strong></p></th></tr>
${kpiRows || '<tr><td><p>TBD</p></td><td><p>TBD</p></td></tr>'}
</tbody>
</table>

<h2>🎯 Proposed Scope</h2>
<p><strong>In Scope:</strong></p>
<ul>
${(inScope || ['TBD']).map(item => `<li><p>${item}</p></li>`).join('\n')}
</ul>
<p><strong>Out of Scope:</strong></p>
<ul>
${(outOfScope || ['TBD']).map(item => `<li><p>${item}</p></li>`).join('\n')}
</ul>

<h2>🤔 Assumptions, Constraints, &amp; Risks</h2>
<p><strong>Assumptions:</strong></p>
<ul>
${(assumptions || ['TBD']).map(item => `<li><p>${item}</p></li>`).join('\n')}
</ul>
<p><strong>Constraints:</strong></p>
<ul>
${(constraints || ['TBD']).map(item => `<li><p>${item}</p></li>`).join('\n')}
</ul>
<p><strong>Risks:</strong></p>
<ul>
${(risks || ['TBD']).map(item => `<li><p>${item}</p></li>`).join('\n')}
</ul>

<h2>🗒️ Requirements</h2>
<table data-table-width="1178" data-layout="default"><colgroup><col style="width: 340.0px;" /><col style="width: 500.0px;" /><col style="width: 338.0px;" /></colgroup>
<tbody>
<tr><th><p><strong>Requirement</strong></p></th><th><p><strong>User Story</strong></p></th><th><p><strong>Notes</strong></p></th></tr>
${requirementRows || '<tr><td><p>TBD</p></td><td><p>TBD</p></td><td><p></p></td></tr>'}
</tbody>
</table>

<h2>🔐 Security Review</h2>
<p>This feature has not yet been reviewed by security.</p>

<h2>🎨 User Interaction and Design</h2>
<p><em>Design mockups and wireframes to be added.</em></p>

<h2>❓ Open Questions</h2>
<table data-table-width="760" data-layout="default"><colgroup><col style="width: 300.0px;" /><col style="width: 300.0px;" /><col style="width: 160.0px;" /></colgroup>
<tbody>
<tr><th data-highlight-colour="#deebff"><p><strong>Question</strong></p></th><th data-highlight-colour="#deebff"><p><strong>Answer</strong></p></th><th data-highlight-colour="#deebff"><p><strong>Date Answered</strong></p></th></tr>
${questionRows || '<tr><td><p>TBD</p></td><td><p></p></td><td><p></p></td></tr>'}
</tbody>
</table>`;
}

// Hub page content
const hubContent = `<ac:structured-macro ac:name="panel" ac:schema-version="1"><ac:parameter ac:name="panelIconId">atlassian-flag</ac:parameter><ac:parameter ac:name="panelIcon">:flag:</ac:parameter><ac:parameter ac:name="bgColor">#FFFAE6</ac:parameter>
<ac:rich-text-body>
<p><strong>End of Year Hackathon</strong> — Dec 15-20, 2025</p>
<p>Focused sprint on top-of-funnel improvements before the holidays. POCs and experiments welcome.</p>
</ac:rich-text-body>
</ac:structured-macro>

<h2>🎯 Theme</h2>
<p><strong>"Make every customer want to bring other customers"</strong></p>
<p>Q1 2026 is focused on network effects and virality. This hackathon is a focused sprint to explore improvements to the scan and checkout experience that drive family adoption and word-of-mouth.</p>

<h2>📅 Timeline</h2>
<table data-layout="default">
<tbody>
<tr><th><p>Week</p></th><th><p>Focus</p></th></tr>
<tr><td><p><strong>Dec 15-20</strong></p></td><td><p>Hackathon sprint — jam on experiments, build POCs, ship what's ready</p></td></tr>
<tr><td><p><strong>Dec 22+</strong></p></td><td><p>Skeleton crew — solo work, refactoring, research, self-development</p></td></tr>
</tbody>
</table>

<h2>👥 Teams &amp; Ownership</h2>
<table data-layout="default">
<tbody>
<tr><th><p>Area</p></th><th><p>Owner</p></th><th><p>Team</p></th></tr>
<tr><td><p><strong>Scan Experience</strong></p></td><td><p><ac:link><ri:user ri:account-id="${USERS.rohini}" /></ac:link></p></td><td><p>Kyle (design), Stuart, Nawab, Guilherme</p></td></tr>
<tr><td><p><strong>Checkout Experience</strong></p></td><td><p><ac:link><ri:user ri:account-id="${USERS.kyler}" /></ac:link></p></td><td><p>TBD</p></td></tr>
</tbody>
</table>

<h2>📋 PRDs by Area</h2>

<h3>Scan Experience</h3>
<p><em>Owner: Rohini</em></p>
<ul>
<li><p>🔴 <strong>Must Ship:</strong> PRD: Scan Accuracy Instrumentation</p></li>
<li><p>🔴 <strong>Must Ship:</strong> PRD: Scan Cross-Pollination</p></li>
<li><p>🟡 <strong>High Priority:</strong> PRD: Identity Theft Countdown</p></li>
<li><p>🟢 <strong>POC:</strong> PRD: Family Connection Visualization</p></li>
<li><p>🟢 <strong>POC:</strong> PRD: Shareable Results</p></li>
</ul>

<h3>Checkout Experience</h3>
<p><em>Owner: Kyler</em></p>
<ul>
<li><p>🟡 <strong>High Priority:</strong> PRD: Step-Based Checkout</p></li>
<li><p>🟡 <strong>High Priority:</strong> PRD: Clarify Value Prop</p></li>
</ul>

<h2>🔗 Related</h2>
<ul>
<li><p><a href="https://docs.google.com/spreadsheets/d/1Ew_eMNtcaMblVNok0-3E4Rt1gmWKyN80ocvW6E3cssQ">December + Q1 Planning Spreadsheet</a></p></li>
<li><p><a href="https://yourcompany.atlassian.net/wiki/spaces/PM/pages/801374793/Documents">PM Documents</a></p></li>
</ul>`;

// PRD definitions
const prds = [
  {
    title: 'PRD: Scan Accuracy Instrumentation',
    owner: 'rohini',
    designer: 'Kyle',
    executiveSummary: 'Add thumbs up/down feedback on scan results to measure accuracy. We don\'t currently know how often scan results are accurate — this instrumentation gives us baseline data before making any changes to the scan experience.',
    background: 'Our scan combines USIS and SpyCloud data to show users their exposed information. However, we have no mechanism to validate whether these results are accurate from the user\'s perspective. Before investing in improvements like cross-pollination or family scanning, we need to understand our current accuracy baseline.',
    kpis: [
      { goal: 'Establish accuracy baseline', metric: '% of scans rated "accurate" by users' },
      { goal: 'High response rate', metric: '>10% of scan viewers provide feedback' }
    ],
    inScope: [
      'Simple thumbs up/down UI on scan results page',
      'Event tracking to PostHog',
      'Basic reporting dashboard'
    ],
    outOfScope: [
      'Detailed feedback collection (why it\'s wrong)',
      'Automated accuracy improvements',
      'A/B testing of different feedback mechanisms'
    ],
    assumptions: ['Users will engage with simple feedback UI', 'Thumbs up/down is sufficient signal for v1'],
    constraints: ['Must not disrupt scan results viewing flow'],
    risks: ['Low response rate may not give statistically significant data'],
    requirements: [
      { requirement: 'Feedback UI', userStory: 'As a user viewing my scan results, I want to indicate if the results look accurate so Cloaked can improve', notes: '' },
      { requirement: 'Event tracking', userStory: 'As a PM, I want to see accuracy ratings in PostHog so I can measure baseline', notes: '' }
    ],
    openQuestions: [
      { question: 'Should we ask for feedback on every scan view or just first?', answer: '', date: '' },
      { question: 'Do we need separate feedback for USIS vs SpyCloud results?', answer: '', date: '' }
    ]
  },
  {
    title: 'PRD: Scan Cross-Pollination',
    owner: 'rohini',
    designer: 'Kyle',
    executiveSummary: 'Use output from USIS scan to enrich SpyCloud scan (and vice versa). Currently these scans run independently — combining them could yield more complete and accurate results, targeting 95%+ accuracy.',
    background: 'We have three scan providers (USIS, SpyCloud, and potentially others) that each find different types of exposed data. Currently, we run them independently with only the user-provided input. By using discovered data from one scan to seed another, we can potentially find more matches and build a more complete picture of the user\'s exposure.',
    kpis: [
      { goal: 'Increase match rate', metric: '+15% more results found per scan' },
      { goal: 'Reduce "no results found"', metric: '-50% scans with zero results' },
      { goal: 'Improve accuracy', metric: '95%+ user-rated accuracy' }
    ],
    inScope: [
      'Use USIS output to run enhanced SpyCloud scan',
      'Use SpyCloud output to run enhanced USIS scan',
      'Measure incremental matches found'
    ],
    outOfScope: [
      'Scanning family members automatically',
      'Third-party scan provider integration',
      'Real-time progressive scan updates'
    ],
    assumptions: ['Additional API calls are acceptable for better results', 'Unit economics support ~2x scan costs'],
    constraints: ['Scan latency should not significantly increase', 'User should not see intermediate results'],
    risks: ['May significantly increase scan costs', 'Could increase scan latency affecting conversion'],
    requirements: [
      { requirement: 'Cross-scan pipeline', userStory: 'As a user, I want the most complete scan results possible so I understand my full exposure', notes: 'Backend work' },
      { requirement: 'Cost tracking', userStory: 'As a PM, I want to track incremental scan costs to validate ROI', notes: '' }
    ],
    openQuestions: [
      { question: 'What is the unit cost increase for running 2x scans?', answer: '', date: '' },
      { question: 'Can we batch/queue the secondary scan to avoid latency?', answer: '', date: '' }
    ]
  },
  {
    title: 'PRD: Identity Theft Countdown',
    owner: 'rohini',
    designer: 'Kyle',
    executiveSummary: 'Show a real-time counter displaying the frequency of identity theft (approximately every 22 seconds). Creates urgency without being manipulative by showing the actual scale of the problem.',
    background: 'Identity theft happens roughly every 22 seconds in the US. This statistic is powerful but abstract. By showing a live countdown and counter on the landing page and scan results, we can make the threat tangible and create legitimate urgency to take action.',
    kpis: [
      { goal: 'Increase checkout conversion', metric: '+10% landing page to checkout' },
      { goal: 'Reduce bounce rate', metric: '-5% landing page bounce' }
    ],
    inScope: [
      'Countdown timer component (22...21...20...)',
      'Running counter of thefts today/this hour',
      'Placement on landing page and scan results',
      'A/B test vs control'
    ],
    outOfScope: [
      'Personalized risk messaging',
      'Location-based statistics',
      'Real-time actual theft data integration'
    ],
    assumptions: ['22-second statistic is accurate and citable', 'Urgency messaging improves conversion without harming brand'],
    constraints: ['Must not feel manipulative or "dark pattern"', 'Must be factually accurate and citable'],
    risks: ['Could feel gimmicky or reduce trust', 'May not resonate with all user segments'],
    requirements: [
      { requirement: 'Countdown component', userStory: 'As a visitor, I want to understand how frequently identity theft happens so I take the threat seriously', notes: 'Animated counter' },
      { requirement: 'Landing page placement', userStory: 'As a PM, I want to test countdown on landing page to measure conversion impact', notes: 'A/B test' }
    ],
    openQuestions: [
      { question: 'What is the exact source for the 22-second statistic?', answer: '', date: '' },
      { question: 'Should we show cumulative daily count or rolling hour?', answer: '', date: '' }
    ]
  },
  {
    title: 'PRD: Family Connection Visualization',
    owner: 'rohini',
    designer: 'Kyle',
    executiveSummary: 'Visual representation of how vulnerabilities compound across a family network. Shows that your data is in their phone, their data is in your phone — one weak link makes everyone vulnerable.',
    background: 'Identity protection is inherently a networked problem. If your spouse\'s email is compromised, attackers can use it to target you. Current scan results show individual exposure but don\'t illustrate the interconnected risk. Visualizing these connections could motivate family plan adoption.',
    kpis: [
      { goal: 'Increase family plan adoption', metric: '+20% family plan selection at checkout' },
      { goal: 'User comprehension', metric: '>70% understand networked risk in user testing' }
    ],
    inScope: [
      'Visual design exploration (social graph, connection lines)',
      'POC with mock data',
      'User testing concept'
    ],
    outOfScope: [
      'Actual family member scanning',
      'Production implementation',
      'Real connection data'
    ],
    assumptions: ['Users will understand and respond to visual network metaphor', 'Family connections are detectable from scan data'],
    constraints: ['Must not require family members\' consent for visualization', 'Must not reveal PII of non-users'],
    risks: ['Visualization may be confusing rather than clarifying', 'May feel invasive showing family members'],
    requirements: [
      { requirement: 'Visual design', userStory: 'As a user, I want to see how my family\'s exposure affects me so I understand why family protection matters', notes: 'Design exploration' },
      { requirement: 'POC prototype', userStory: 'As a PM, I want to test the concept with users before committing to build', notes: 'Figma or clickable proto' }
    ],
    openQuestions: [
      { question: 'Can we infer family connections from scan data alone?', answer: '', date: '' },
      { question: 'What visual metaphor resonates best?', answer: '', date: '' }
    ]
  },
  {
    title: 'PRD: Shareable Results',
    owner: 'rohini',
    designer: 'Kyle',
    executiveSummary: 'Let users share their scan results or removal counts in a Wordle-style format — a visual that\'s interesting to share without revealing sensitive data. Drives word-of-mouth and organic acquisition.',
    background: 'Wordle popularized the concept of sharing progress in a visual, non-revealing format. Users already screenshot and share Cloaked removal counts on social media. By providing a designed shareable format, we can make this behavior easier and more branded, driving K-factor improvement.',
    kpis: [
      { goal: 'Share rate', metric: '>5% of users share their results' },
      { goal: 'Viral coefficient', metric: '>0.1 K-factor from shares' }
    ],
    inScope: [
      'Shareable image/card design',
      'Share button integration',
      'POC implementation'
    ],
    outOfScope: [
      'Deep social media integration',
      'Referral tracking from shares',
      'Customization options'
    ],
    assumptions: ['Users want to share privacy wins', 'Visual format prevents PII exposure'],
    constraints: ['Must not reveal specific exposed data', 'Must work on major social platforms'],
    risks: ['Users may not want to broadcast they needed identity protection', 'Low engagement with share feature'],
    requirements: [
      { requirement: 'Share card design', userStory: 'As a user, I want to share my protection progress in a fun way so I can tell friends about Cloaked', notes: '' },
      { requirement: 'Share button', userStory: 'As a user, I want an easy way to share without screenshots', notes: '' }
    ],
    openQuestions: [
      { question: 'What data is safe to include in shareable card?', answer: '', date: '' },
      { question: 'Should we include referral codes in shared images?', answer: '', date: '' }
    ]
  },
  {
    title: 'PRD: Step-Based Checkout',
    owner: 'kyler',
    executiveSummary: 'Replace "how many seats?" pricing with a guided flow: What do you want to protect? → Who do you want to protect? → Payment. Reframes purchase as protection, not transaction.',
    background: 'Current checkout asks users to select seat count upfront, which is transactional and confusing. By guiding users through what they\'re protecting (identity, calls, etc.) and who they\'re protecting (self, family members from scan), we can increase comprehension, AOV, and family plan adoption.',
    kpis: [
      { goal: 'Increase checkout completion', metric: '+15% checkout conversion' },
      { goal: 'Increase family plan adoption', metric: '+25% family plan selection' },
      { goal: 'Increase AOV', metric: '+$2 average order value' }
    ],
    inScope: [
      'Step 1: What to protect (identity theft, spam calls, etc.)',
      'Step 2: Who to protect (show family from scan results)',
      'Step 3: Payment',
      'A/B test vs current checkout'
    ],
    outOfScope: [
      'New pricing tiers',
      'Dynamic pricing',
      'Subscription management changes'
    ],
    assumptions: ['Users prefer guided flows over direct pricing', 'Showing family members increases plan size'],
    constraints: ['Must maintain current pricing structure', 'Cannot significantly increase checkout time'],
    risks: ['Additional steps may increase abandonment', 'Users may feel manipulated into family plan'],
    requirements: [
      { requirement: 'Protection selector', userStory: 'As a user, I want to choose what protection I need so I get the right plan', notes: '' },
      { requirement: 'Family selector', userStory: 'As a user, I want to see which family members I can protect so I can add them easily', notes: 'Uses scan data' },
      { requirement: 'Progress indicator', userStory: 'As a user, I want to see where I am in checkout so I know what\'s next', notes: '' }
    ],
    openQuestions: [
      { question: 'How do we handle users with no family in scan results?', answer: '', date: '' },
      { question: 'Should protection selection affect pricing display?', answer: '', date: '' }
    ]
  },
  {
    title: 'PRD: Clarify Value Prop',
    owner: 'kyler',
    executiveSummary: 'Make the value proposition clearer throughout the checkout flow. Users often don\'t understand what they\'re getting or why it matters — clearer messaging should improve conversion.',
    background: 'User research and support tickets indicate confusion about what Cloaked does and why it matters. The checkout flow focuses on pricing rather than value. By adding clearer explanations of benefits, social proof, and urgency at key moments, we can reduce confusion and improve conversion.',
    kpis: [
      { goal: 'Reduce checkout abandonment', metric: '-20% cart abandonment' },
      { goal: 'Improve comprehension', metric: '>80% users can explain what they bought in exit survey' }
    ],
    inScope: [
      'Value messaging on checkout pages',
      'Social proof elements (testimonials, stats)',
      'Benefit explanations for each protection type',
      'A/B testing copy variants'
    ],
    outOfScope: [
      'Landing page changes',
      'Pricing changes',
      'New features/benefits'
    ],
    assumptions: ['Confusion is a significant conversion blocker', 'Better messaging can improve conversion without product changes'],
    constraints: ['Must work within current page layouts', 'Must not significantly increase page load time'],
    risks: ['Too much text could hurt conversion', 'May not address fundamental product comprehension issues'],
    requirements: [
      { requirement: 'Benefit explanations', userStory: 'As a user, I want to understand what each protection does so I can decide if I need it', notes: '' },
      { requirement: 'Social proof', userStory: 'As a user, I want to see that others trust Cloaked so I feel confident purchasing', notes: '' },
      { requirement: 'Copy testing', userStory: 'As a PM, I want to test different value messaging to find what converts best', notes: '' }
    ],
    openQuestions: [
      { question: 'What are the top comprehension gaps from user research?', answer: '', date: '' },
      { question: 'Which social proof elements perform best?', answer: '', date: '' }
    ]
  }
];

run({
  name: 'create-hackathon-docs',
  mode: 'operational',
  services: ['google', 'jira'],
}, async (ctx) => {
  console.log('Creating End of Year Hackathon 2025 Documentation...\n');

  const createdPages = [];

  // Step 1: Create hub page
  console.log('📄 Creating hub page...');
  const hubPage = await confluence.createPage(
    SPACE_KEY,
    'End of Year Hackathon 2025',
    hubContent,
    DOCUMENTS_PAGE_ID
  );
  console.log(`   ✅ Hub page created: ${hubPage.id}`);
  console.log(`   URL: https://yourcompany.atlassian.net/wiki/spaces/PM/pages/${hubPage.id}`);
  createdPages.push({ title: hubPage.title, id: hubPage.id, url: `https://yourcompany.atlassian.net/wiki/spaces/PM/pages/${hubPage.id}` });

  // Add labels to hub
  await confluence.addLabels(hubPage.id, ['hackathon', 'q4-2025', 'planning']);
  console.log('   ✅ Labels added\n');

  // Step 2: Create each PRD as child of hub
  for (const prd of prds) {
    console.log(`📄 Creating ${prd.title}...`);
    const content = generateBriefPRD(prd);

    const page = await confluence.createPage(
      SPACE_KEY,
      prd.title,
      content,
      hubPage.id
    );

    console.log(`   ✅ Created: ${page.id}`);
    console.log(`   URL: https://yourcompany.atlassian.net/wiki/spaces/PM/pages/${page.id}`);
    createdPages.push({ title: page.title, id: page.id, url: `https://yourcompany.atlassian.net/wiki/spaces/PM/pages/${page.id}` });

    // Add labels
    const labels = ['prd', 'hackathon', 'q4-2025'];
    if (prd.owner === 'rohini') labels.push('scan-experience');
    if (prd.owner === 'kyler') labels.push('checkout-experience');
    await confluence.addLabels(page.id, labels);
    console.log(`   ✅ Labels added: ${labels.join(', ')}\n`);
  }

  // Summary
  console.log('=' .repeat(60));
  console.log('🎉 All pages created successfully!\n');
  console.log('Created pages:');
  for (const p of createdPages) {
    console.log(`  - ${p.title}`);
    console.log(`    ${p.url}`);
  }
});
