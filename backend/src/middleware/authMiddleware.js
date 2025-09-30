// Google-only authentication middleware.
// Verifies Google ID tokens using google-auth-library and attaches a normalized `req.user`.
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Simple in-memory cache for recently-verified ID tokens to reduce calls
// to Google's verification endpoints. Cache key is the raw idToken string.
const tokenCache = new Map(); // token -> { payload, expiresAt }
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 1 minute

function mapPayloadToUser(payload) {
  return {
    id: payload.sub,
    email: payload.email,
    first_name: payload.given_name,
    last_name: payload.family_name,
    name: payload.name,
    university: payload.hd || undefined,
    provider: 'google',
  };
}

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      req.user = mapPayloadToUser(cached.payload);
      return next();
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // Cache the payload to avoid repeated verify calls for the same token
    try {
      tokenCache.set(token, { payload, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    } catch (e) {
      // ignore cache set failures
    }

    req.user = mapPayloadToUser(payload);

    return next();
  } catch (err) {
    console.error('Google token verification error:', err);
    return res.status(403).json({ error: 'Invalid Google token' });
  }
};

module.exports = { authenticateToken };
