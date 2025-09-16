// Google-only authentication middleware.
// Verifies Google ID tokens using google-auth-library and attaches a normalized `req.user`.
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const authenticateToken = async (req, res, next) => {
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
      // Google ID tokens won't provide university/course by default.
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
