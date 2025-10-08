---
layout: page
title: Getting Started
permalink: /getting-started/
---

# Getting Started with Study Buddy Campus API

## Authentication

All API requests require authentication using JWT tokens:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://api.studybuddy.com/api/users/me
```

## Quick Start

1. **Get your API credentials** from the developer dashboard
2. **Authenticate** to receive a JWT token
3. **Make your first API call** to get your user profile
4. **Explore the endpoints** using the interactive documentation

## Base URLs

- **Production**: `https://api.studybuddy.com/api`
- **Staging**: `https://staging-api.studybuddy.com/api`
- **Development**: `http://localhost:3000/api`

## SDKs and Libraries

Generate client libraries using the OpenAPI specification:

```bash
# JavaScript/TypeScript
npx @openapitools/openapi-generator-cli generate \
  -i https://USERNAME.github.io/REPO_NAME/api-spec.yaml \
  -g typescript-fetch \
  -o ./client

# Python
openapi-generator generate \
  -i https://USERNAME.github.io/REPO_NAME/api-spec.yaml \
  -g python \
  -o ./client
```
