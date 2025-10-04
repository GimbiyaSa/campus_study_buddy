## Google Authentication Integration

### High-level flow

1. **Frontend (Google Identity Services)**  
   - `GOOGLE_CLIENT_ID` from `.env` is passed to Google Identity Services when rendering the sign-in button.  
   - After a user selects an account, Google returns a JWT credential (ID token) via the callback defined in `google.accounts.id.initialize`.  
   - The frontend stores that token (e.g., `google_id_token`).

2. **Backend verification (`/api/v1/auth/google`)**  
   - Uses the Google Auth Library’s `OAuth2Client` with the same `GOOGLE_CLIENT_ID` to call `verifyIdToken`.  
   - Extracts the payload (Google user ID, email, names, picture).  
   - Checks whether the user already exists; if not, creates a new record.  
   - Issues an authenticated session (HTTP-only cookie plus JSON payload with the user profile) that the frontend stores in context.

3. **Session usage**  
   - Subsequent API calls rely on the session cookie set during login; no Google token is sent again.  
   - Logout (`POST /api/v1/auth/logout`) clears the session and the cached Google token on the client.

### Error handling

- Invalid or expired Google credentials return `401` with an error message so the frontend can show a fallback.  
- Network failures fall back to the guest flow described in `Header.tsx` (showing placeholder notifications).

### Local setup tips

- Ensure `GOOGLE_CLIENT_ID` in `backend/.env` matches the OAuth client configured in Google Cloud Console.  
- For local testing over `http://localhost:5173`, add that URL as an authorized origin in the Google OAuth configuration.  
- If you rotate credentials, restart both backend and frontend so the new environment variable is picked up.

### Why Google:
- **User familiarity:** Most students already have Google accounts, so sign-in is quicker and frictionless.
- **Security posture:** Google Identity Services handles MFA, password recovery, and suspicious login detection so we inherit their security investments.
- **Reduced maintenance:** No need to store or hash passwords, cutting operational overhead and breach risk.
- **Cross-platform readiness:** Tokens are OIDC-compliant, making it easy to reuse the same auth flow for web, mobile, or desktop clients.
- **Ecosystem integration:** Access to Google profile data (name, avatar, email) streamlines onboarding and personalization.
- **Rollout:** After application has been fully developed, can publish and the auth can work for all google accounts instead of just added test accounts.