---
layout: default
title: API Testing
description: Tools for testing the Campus Study Buddy API with Google authentication
---

# 🔐 API Testing & Authentication

This page provides tools to help you test the Campus Study Buddy API endpoints. Since our API uses Google OAuth authentication, you'll need to get a valid token first.

## Quick Start

1. **[Open the Testing Tool](api-testing.html)** - Interactive page to get Google tokens and test endpoints
2. **Get your Google ID token** - Sign in with your Google account
3. **Test endpoints** - Use the token to make authenticated requests
4. **Copy for external tools** - Use the token in Postman, curl, or your applications

## Testing Options

### 🌐 Interactive Testing Page
**[→ Open API Testing Tool](api-testing.html)**

Our interactive testing page allows you to:
- Sign in with Google to get ID tokens
- Test endpoints directly in the browser
- Copy tokens for use in external tools
- View real-time API responses

### 📮 Postman Collection
We've prepared a Postman collection with pre-configured requests:

1. **[Download Collection](../Campus_Study_Buddy_API.postman_collection.json)**
2. Import into Postman
3. Set your `bearerToken` variable with a token from the testing page
4. Start testing endpoints

### 📋 Manual Testing
For manual testing with curl or other tools, you'll need to include the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     https://your-api-domain.com/api/v1/users/me
```

## Authentication Flow

Our API uses **Google ID tokens** for authentication:

1. **User signs in** with Google on the frontend
2. **Google returns an ID token** (JWT)
3. **Client sends token** in Authorization header: `Bearer YOUR_TOKEN`
4. **API validates token** with Google's servers
5. **API returns requested data** if token is valid

### Token Format
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2NzAyN...
```

## Available Endpoints

### Public Endpoints (No Authentication)
- `GET /api/v1/health` - System health check

### Protected Endpoints (Authentication Required)
- `GET /api/v1/users/me` - Current user profile
- `GET /api/v1/modules` - Available modules
- `GET /api/v1/groups` - Study groups
- `GET /api/v1/sessions` - Study sessions
- And many more...

**[📖 View Full API Documentation](../backend/api/)**

## Troubleshooting

### "Access token required" Error
This means you need to include a valid Google ID token in your request:
- Make sure you're signed in on the testing page
- Copy the full token (it's very long!)
- Include it in the Authorization header

### Token Expired Error
Google ID tokens expire after about 1 hour:
- Sign in again on the testing page to get a fresh token
- For production apps, implement token refresh

### CORS Issues
If testing from a different domain:
- Use the testing page on this domain
- Or configure CORS on your API server

## Setup for Developers

If you're setting up your own testing environment, you'll need:

1. **Google OAuth Client ID** - Register your app at [Google Cloud Console](https://console.cloud.google.com/)
2. **Database Connection** - Azure SQL Database connection string or individual DB credentials
3. **Environment Variables** - Complete list of required and optional variables
4. **Azure Services** (Optional) - Key Vault, Storage, Web PubSub for full functionality

**[📖 Complete Environment Variables List](setup.md#required-environment-variables)**

### Quick Start Variables
At minimum, you need these for basic testing:
```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
DATABASE_CONNECTION_STRING=your-azure-sql-connection-string
NODE_ENV=development
PORT=5000
```

**[📖 Detailed Setup Guide](setup.md)** - Complete configuration instructions

## Security Notes

⚠️ **Important Security Reminders:**
- Never commit tokens to version control
- Tokens expire after ~1 hour
- Only use tokens for testing
- Don't share tokens with others
- Use HTTPS in production

---

## Related Documentation
- **[Backend API Reference](../backend/api/)** - Complete endpoint documentation
- **[Swagger UI](../docs/swagger/)** - Interactive API explorer
- **[Authentication Guide](../backend/services/#authentication)** - How authentication works
- **[Setup Guide](setup.md)** - Detailed testing setup instructions
- **[Environment Variables Reference](environment-variables.md)** - Complete variable documentation