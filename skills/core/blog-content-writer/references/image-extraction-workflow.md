---
name: image-extraction-workflow
description: Resource file for blog-content-writer agent
type: resource
---

# Image URL Extraction Workflow

## CRITICAL: Never Guess Image URLs

**NEVER guess or fabricate image URLs. Always extract real URLs from the source article.**

## Image Specifications

Every article requires comprehensive image specifications:

### Image Specs

**Blog Featured Image:**
- Aspect Ratio: 16:9 (1920x1080px ideal)
- Purpose: Appears at top of blog article
- Detail level: Can be detailed/technical
- Use: Hero image that sets article tone

**Feed Card Image:**
- Aspect Ratio: 2:1 (1200x600px ideal)
- Purpose: Appears in app news feed
- Detail level: Must work at smaller size - bold, simple composition
- Use: Thumbnail that attracts attention in feed
- Can be: Same as blog image OR different variation

**Note:** Aspect ratios are more important than exact pixel dimensions.

## Extraction Process

When transforming an article:

1. **Visit the source URL** using browser navigation or fetch the HTML
2. **Identify all `<img>` tags** in the article content
3. **Extract actual image URLs** - these are often in formats like:
   - `https://www.eff.org/files/2022/05/11/allowappstorequestotrack_0.png`
   - NOT guessed URLs like `ios_allow_apps_to_request_to_track.png`
4. **Verify URLs exist** before including them
5. **If you cannot access the source article**, output:
   ```
   ⚠️ MANUAL IMAGE EXTRACTION NEEDED

   Visit source article and find image URLs for:
   - iPhone tracking permission dialog (after step 1)
   - iPhone Settings > Tracking screen (after step 3)
   - Android Ads settings screen (after step 4)

   Look for <img> tags in the article HTML and copy exact URLs.
   ```

## Examples

**Bad (guessed URL):**
```markdown
![iPhone Settings](https://www.eff.org/files/2022/05/11/ios_tracking_settings.png)
```

**Good (actual URL from source):**
```markdown
![iPhone Settings](https://www.eff.org/files/2022/05/11/allowappstorequestotrack_0.png)
```
