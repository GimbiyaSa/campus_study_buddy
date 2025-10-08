---
layout: default
title: Testing Setup Guide
description: Comprehensive guide for setting up API testing environment
---

# Campus Study Buddy - Testing Environment Setup

This guide helps you set up a complete testing environment for the Campus Study Buddy API.

## Required Environment Variables

Before testing, make sure your backend has these environment variables set:

### Essential Variables (Required)
```env
# Google OAuth Configuration (REQUIRED for authentication)
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com

# Database Configuration (REQUIRED - use one of these methods)
# Method 1: Connection String (Recommended)
DATABASE_CONNECTION_STRING=your-azure-sql-connection-string

# Method 2: Individual Database Components (Alternative)
DB_SERVER=your-sql-server.database.windows.net
DB_NAME=study_buddy_db
DB_USER=your-username
DB_PASSWORD=your-password

# Application Configuration
NODE_ENV=development
PORT=5000
```

### Azure Services (Optional but recommended)
```env
# Azure Key Vault (for secure secret management)
KEY_VAULT_NAME=your-keyvault-name

# Azure Storage (for file uploads/downloads)
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_STORAGE_ACCOUNT_KEY=your-storage-key

# Azure Web PubSub (for real-time chat)
WEB_PUBSUB_CONNECTION_STRING=your-webpubsub-connection-string
WEB_PUBSUB_HUB=chat-hub

# Azure Service Bus (for background processing)
SERVICE_BUS_CONNECTION_STRING=your-servicebus-connection-string
```

### Deployment Variables (Production)
```env
# Azure Deployment Identifiers
AZURE_CLIENT_ID=your-managed-identity-client-id
CONTAINER_APP_NAME=your-container-app-name
WEBSITE_SITE_NAME=your-app-service-name
AZURE_FUNCTIONS_ENVIRONMENT=production

# CORS Configuration
FRONTEND_URL=https://your-frontend-domain.com
ALLOWED_ORIGINS=https://domain1.com,https://domain2.com
```

### Default Module Configuration (Optional)
```env
# Default module settings for groups
DEFAULT_MODULE_ID=1
DEFAULT_MODULE_CODE=GEN-DEFAULT
DEFAULT_MODULE_NAME=General
DEFAULT_MODULE_UNIVERSITY=Your University
```

## How to Get Google OAuth Client ID

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create or select a project**
3. **Enable Google+ API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. **Create OAuth 2.0 credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add authorized origins:
     - `http://localhost:3000` (for frontend)
     - `http://localhost:5000` (for backend)
     - `http://127.0.0.1:3000`
   - Add authorized redirect URIs:
     - `http://localhost:3000/auth/callback`

5. **Copy the Client ID** and add it to your .env file

## Testing Methods

### Method 1: HTML Test Page
1. Update `api-testing.html` with your Google Client ID
2. Open the file in a browser
3. Sign in with Google
4. Copy the token for API testing

### Method 2: Using gcloud CLI (For developers)
```bash
# Install gcloud CLI if not already installed
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Get ID token
gcloud auth print-identity-token
```

### Method 3: Postman Collection
1. Import the provided Postman collection
2. Set the `google_id_token` variable with a token from Method 1 or 2
3. Test the endpoints

## API Testing Examples

### With curl:
```bash
# Health check (no auth required)
curl http://localhost:5000/api/v1/health

# User profile (requires auth)
curl -H "Authorization: Bearer YOUR_GOOGLE_ID_TOKEN" \
     http://localhost:5000/api/v1/users/me

# Get modules (requires auth)
curl -H "Authorization: Bearer YOUR_GOOGLE_ID_TOKEN" \
     http://localhost:5000/api/v1/modules?limit=5
```

### With JavaScript:
```javascript
const token = 'YOUR_GOOGLE_ID_TOKEN';

// Test user profile
fetch('http://localhost:5000/api/v1/users/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

## Troubleshooting

### Common Issues:

1. **"Access token required"**:
   - Make sure you're including the Authorization header
   - Verify the token is a valid Google ID token
   - Check that GOOGLE_CLIENT_ID is set in your backend

2. **CORS errors**:
   - Make sure your backend allows requests from your testing domain
   - Check the CORS configuration in your Express app

3. **"Invalid token"**:
   - Google ID tokens expire (usually after 1 hour)
   - Get a fresh token from the test page
   - Verify the token is for the correct Google Client ID

4. **Database connection errors**:
   - Check DATABASE_CONNECTION_STRING is correct
   - Ensure Azure SQL database is accessible
   - Verify firewall rules allow connections

## Security Notes

- **Never commit real tokens to version control**
- **ID tokens expire after ~1 hour** - get fresh ones for testing
- **Use test/development Google projects** for API testing
- **Restrict OAuth client to specific domains** in production

## Quick Links

- **[Interactive Testing Tool](api-testing.html)** - Get tokens and test endpoints
- **[API Documentation](../backend/api/)** - Complete endpoint reference
- **[Swagger UI](../docs/swagger/)** - Interactive API explorer
- **[Postman Collection](../Campus_Study_Buddy_API.postman_collection.json)** - Download collection