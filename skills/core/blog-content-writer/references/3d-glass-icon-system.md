---
name: 3d-glass-icon-system
description: Resource file for blog-content-writer agent
type: resource
---

# 3D Glass Icon System

**Use Cloaked's 3D Glass Iconography system for ALL generated images.**

Avoid photorealistic phone renders - they're inconsistent and look AI-generated.

## 3D Glass Icon Template (Use ChatGPT 5.1)

Paste this JSON into ChatGPT 5.1, then say "Generate the image":

```json
{
  "style": {
    "type": "3D Iconography",
    "inspiration": ["Security", "Privacy Protection", "Modern Acrylic Interfaces", "Digital Safety"],
    "materials": [
      "Translucent clear glass-like acrylic for primary structure",
      "Orange transparent glass for secondary structural elements",
      "Polished chrome accents for functional or decorative components"
    ],
    "lighting": {
      "type": "Neutral tri-point studio setup",
      "effects": [
        "Soft balanced white light emphasizing glossy glass edges",
        "Bright specular highlights along front-facing surfaces",
        "Clean internal refraction through the orange glass material",
        "No atmospheric color tint—pure, neutral white environment"
      ]
    },
    "background": {
      "color": "#FFFFFF",
      "environment": "pure white seamless studio backdrop"
    }
  },
  "geometry": {
    "shape": "[DESCRIBE THE MAIN ICON CONCEPT]",
    "elements": {
      "primary": {
        "form": "[PRIMARY ELEMENT - main structure description]"
      },
      "secondary": {
        "form": "[SECONDARY ELEMENT - accent/feature description]"
      },
      "detail": {
        "form": "[DETAIL ELEMENTS - small accents, highlights]"
      }
    },
    "edges": "[EDGE TREATMENT - e.g., 'Polished clear glass bevels with chrome accent rings']",
    "depth": "[3D DEPTH - e.g., 'Medium extrusion with layered elements, shield floating above surface']",
    "surfaceDetail": "Smooth glossy surfaces defined purely by reflection and refraction—no engraved texture or patterns"
  },
  "colorPalette": {
    "primary": "#FF700C",
    "secondary": "#FF9C4C",
    "accent": "#FFD5B3",
    "chrome": "#D9D9D9",
    "highlight": "#FFFFFF"
  },
  "mood": ["Precise", "Futuristic", "Technical", "Controlled"],
  "usage": {
    "contexts": ["Privacy protection interfaces", "Security features", "Blog imagery"]
  }
}
```

**ONLY modify the "geometry" section** - leave style, lighting, colors unchanged for consistency.

## Example: Ad Tracking Article

**Blog Featured Image (16:9):**
```json
{
  "geometry": {
    "shape": "Smartphone outline with shield blocking tracking signals",
    "elements": {
      "primary": {
        "form": "Large vertical clear glass-like acrylic smartphone silhouette with rounded corners and thick beveled edges, standing upright"
      },
      "secondary": {
        "form": "Orange transparent glass shield positioned centrally on the phone's front surface, with radiating signal-blocking waves emanating outward"
      },
      "detail": {
        "form": "Small polished chrome rings around the shield perimeter, and faint clear-glass signal wave patterns being deflected away from the device"
      }
    },
    "edges": "Smooth beveled clear-glass edges on phone outline, polished chrome edge on shield",
    "depth": "Medium extrusion, with shield element floating 3-5mm above the phone surface plane, creating layered depth",
    "surfaceDetail": "High-gloss transparent surfaces with clean reflections and subtle internal refraction—no screen content or UI elements"
  }
}
```
*Post-process: Use as 16:9 or crop to 2:1 for feed card*

**Feed Card Image (2:1):**
```json
{
  "geometry": {
    "shape": "Simplified phone and shield icon, bolder composition",
    "elements": {
      "primary": {
        "form": "Thick clear glass phone silhouette, simplified rectangular form with rounded corners, centered in frame"
      },
      "secondary": {
        "form": "Large orange glass shield icon, occupying 60% of phone surface, bold and geometric"
      },
      "detail": {
        "form": "Chrome edge ring circling the entire shield, creating strong contrast and definition"
      }
    },
    "edges": "Thick clear glass bevels on phone, bold chrome ring on shield perimeter",
    "depth": "Shallow to medium depth, shield raised prominently from phone surface for maximum visual impact",
    "surfaceDetail": "High contrast between clear and orange glass, strong chrome reflections, minimal subtlety for readability at small sizes"
  }
}
```
*Optimized for 2:1, works at 400px wide*

## Key Differences for Feed vs Blog

- **Blog (16:9):** More detail, can include signal waves or additional elements
- **Feed (2:1):** Bolder, simpler, fewer elements, higher contrast

**NEVER suggest photorealistic iPhone renders** - use abstract 3D glass icons only.
