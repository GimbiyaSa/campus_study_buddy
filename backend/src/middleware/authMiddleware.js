// Authentication middleware supporting two strategies:
// 1) App session cookie (httpOnly JWT) set by our /auth/google endpoint
// 2) Fallback: Google ID token in Authorization: Bearer <id_token>
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

const authenticateToken = async (req, res, next) => {
  // 1) Try app session cookie first
  try {
    const cookies = parseCookies(req.headers['cookie']);
    const session = cookies['csb_session'];
    if (session && process.env.JWT_SECRET) {
      const sessionPayload = jwt.verify(session, process.env.JWT_SECRET);
      req.user = {
        id: sessionPayload.sub,
        email: sessionPayload.email,
        name: sessionPayload.name,
        university: sessionPayload.university,
        course: sessionPayload.course,
        provider: 'app',
      };
      return next();
    }
  } catch (err) {
    console.warn('Session cookie verification failed:', err?.message);
  }

  // 2) Fallback: Google ID token in Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
      university: payload.hd || undefined,
      course: undefined,
      provider: 'google',
    };
    return next();
  } catch (err) {
    console.error('Google token verification error:', err);
    return res.status(403).json({ error: 'Invalid Google token' });
  }
};

module.exports = { authenticateToken };
