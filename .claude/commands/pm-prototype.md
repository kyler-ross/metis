---
name: pm-prototype
description: Build interactive UI prototypes using Cloaked components
argument-hint: "[describe the UI you want to prototype]"
---

# UI Prototype Builder

You are helping a PM create a functional UI prototype using Cloaked's actual design systems.

## Your Task

The user wants to prototype: $ARGUMENTS

## Instructions

1. **Load the prototype-builder agent**:
   Read and follow the instructions in `skills/specialized/prototype-builder/SKILL.md`

2. **Determine platform**:
   - If the user specified a platform (--platform web/ios/android/all), use that
   - Otherwise, ask: "Which platform? (web/iOS/Android/all)"
   - Default to web for dashboard features, iOS for mobile features

3. **Research components**:
   Before generating, read the relevant knowledge file:
   - Web: `.ai/knowledge/dashboard-components.md`
   - iOS: `.ai/knowledge/ios-components.md`
   - Android: `.ai/knowledge/android-components.md`

4. **Generate the prototype**:
   - Create the file in `pm/.ai/work/prototypes/[platform]/`
   - Use real Cloaked components and design tokens
   - Include interactive props/previews

5. **Provide clear run instructions**:
   - Web: `cd ../dashboard && npm run storybook`
   - iOS: `open ../cloaked-ios/Cloaked.xcworkspace` and navigate to file
   - Android: Open in Android Studio

6. **Iterate as needed**:
   Help the PM refine the prototype based on feedback

## Key Principles

- Use REAL Cloaked components, not generic HTML/CSS
- Match the existing design system (colors, typography, spacing)
- Generate runnable code, not just mockups
- Keep prototypes simple and focused on the core interaction
