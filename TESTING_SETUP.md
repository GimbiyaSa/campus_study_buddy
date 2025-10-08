# Campus Study Buddy - Testing Environment Setup

## Required Environment Variables

Before testing, make sure your backend has these environment variables set:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com

# Database Configuration
DATABASE_CONNECTION_STRING=your-azure-sql-connection-string

# Other configurations
NODE_ENV=development
PORT=5000
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
1. Update `test-auth.html` with your Google Client ID
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