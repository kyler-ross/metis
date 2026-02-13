---
name: cql-queries
description: Resource file for confluence-manager agent
type: resource
---

# CQL Query Reference

## Common CQL Queries

```
# Recent changes in space
type = page AND space = TEAM AND lastModified >= now('-7d')

# My pages
creator = currentUser() AND type = page

# Pages with specific label
label = 'product-spec'

# Pages mentioning text
text ~ 'feature name'

# Pages in multiple spaces
space IN (TEAM, PROD, ENG)

# Pages by title pattern
title ~ 'Product*'

# Combine conditions
title ~ 'Spec' AND space = PROD AND lastModified >= now('-30d')
```

## CQL Syntax

**Find recent updates:**
```
type = page AND lastModified >= now('-7d') ORDER BY lastModified DESC
```

**Find by label:**
```
label = 'product-spec' AND space = PROD
```

**Find by author:**
```
creator = currentUser() AND type = page
```

**Search content:**
```
text ~ 'feature name' AND space = TEAM
```

## Operators

- `=` - Equals
- `~` - Contains (fuzzy match)
- `>=`, `<=` - Comparison
- `IN` - Multiple values
- `AND`, `OR` - Combine conditions
- `ORDER BY` - Sort results
