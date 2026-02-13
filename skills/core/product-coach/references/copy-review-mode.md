---
name: copy-review-mode
description: Resource file for product-coach agent
type: resource
---

# Copy Review Mode - Product Coach

This resource provides detailed guidance for reviewing and writing product copy.

## Product Copy Guidance

When helping with user-facing product copy (settings, onboarding, marketing), always start with a pre-flight checklist:

### Product Copy Pre-Flight Checklist

Before writing or reviewing copy, ask:

```
Copy Type & Context:
- [ ] What type of copy is this? (settings explainer, onboarding, marketing, etc.)
- [ ] What's the reading level? (6th grade, general audience, technical users, mixed)
- [ ] Who's the audience? (new users, existing users, power users, etc.)

Clarity:
- [ ] Is it a 6th-grade reading level? (Use Hemingway Editor to check)
- [ ] Does it explain WHAT, not HOW?
- [ ] Any technical jargon that needs a parenthetical definition?
- [ ] Does it answer: What does this do? Why use it? Is my data safe?

Sensitivity:
- [ ] Does it raise unnecessary questions? (especially for biometrics/data)
- [ ] Does it over-explain security mechanisms? (red flag)
- [ ] Is it honest without being scary?

Testing:
- [ ] Can a non-technical user understand it?
- [ ] Would a user with privacy concerns trust this?
- [ ] Have you read it aloud to test flow?
```

**Key principle**: Avoid technical explanation that sounds like you're hiding something. Users need reassurance, not mechanisms.

See `knowledge/product-copy-guidelines.md` for detailed standards and examples.

## Copy Review Process

When reviewing copy:

1. **Understand context first**
   - What screen/flow is this in?
   - What user action triggers this copy?
   - What's the user's mental state at this moment?
   - What decision are they making?

2. **Check clarity**
   - Can a 6th grader understand it?
   - Is it scannable (not a wall of text)?
   - Does it answer the user's likely questions?
   - Any technical jargon that needs explaining?

3. **Check tone**
   - Is it reassuring without being patronizing?
   - Does it match [Your Company]'s voice (direct, honest, empowering)?
   - Any unnecessary fear-mongering or over-explanation?

4. **Check accuracy**
   - Is it technically correct?
   - Does it match actual product behavior?
   - Any promises we can't keep?

5. **Suggest improvements**
   - Show before/after versions
   - Explain why each change helps
   - Offer 2-3 options if appropriate

## Common Copy Pitfalls

### Over-Explaining Security
**Bad**: "We use AES-256 encryption with SHA-256 hashing and store your data in SOC2-compliant data centers with zero-knowledge architecture."

**Good**: "Your data is encrypted and private. We can't see it, and neither can anyone else."

**Why**: Technical details raise suspicion. Users think: "Why are they explaining so much? Are they hiding something?"

### Technical Jargon Without Context
**Bad**: "Enable biometric authentication"

**Good**: "Use Face ID or fingerprint to unlock"

**Why**: "Biometric" is technical. Users know "Face ID" and "fingerprint."

### Explaining HOW Instead of WHAT
**Bad**: "[Your Company] uses a distributed task graph with priority-weighted scheduling to optimize your workflow execution."

**Good**: "[Your Company] automatically organizes your tasks so the important stuff gets done first."

**Why**: Users care about WHAT it does, not HOW it works.

### Creating Unnecessary Anxiety
**Bad**: "Warning: If you lose this recovery code, you'll permanently lose access to your account and all data will be irrecoverable."

**Good**: "Save your recovery code. You'll need it if you lose access to your device."

**Why**: The first version is scary and makes users second-guess signing up.

## Copy Templates

### Settings Explainers
```
[Feature name]

[One sentence: What it does]
[One sentence: Why use it]
[One sentence: Any important limitation or reassurance]

[Optional: Learn more link]
```

### Onboarding Steps
```
[Screen title - clear benefit]

[1-2 sentences: What this step accomplishes]
[Optional: Why this matters for the user]

[Clear CTA button]
[Optional: Skip/Later link with no guilt]
```

### Error Messages
```
[What went wrong - plain language]
[Why it matters - if not obvious]
[What to do next - clear action]

[Optional: Learn more or contact support]
```

### Permission Requests
```
[What we're asking for - plain language]
[Why we need it - specific benefit to user]
[What we won't do with it - reassurance if needed]

[Allow button]
[Not now / Skip button - no guilt]
```

## When to Escalate

If copy involves:
- **Legal/compliance** language → escalate to legal team
- **Security claims** → verify with engineering first
- **Marketing promises** → align with marketing team
- **Pricing/billing** → confirm with ops/finance
- **Privacy policy** → legal review required

## Additional Resources

For more detailed guidelines and examples:
- `knowledge/product-copy-guidelines.md` - Complete style guide
- `knowledge/product-overview.md` - Product context
- [Your Company] brand voice doc (if available)
