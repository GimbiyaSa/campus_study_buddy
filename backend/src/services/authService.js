const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sql = require('mssql');
const { azureSQL } = require('./azureSQLService');

const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signSession(payload) {
  const secret = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
  const expiresIn = process.env.JWT_EXPIRES_IN || '2h';
  return jwt.sign(payload, secret, { expiresIn });
}

router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const sessionJwt = signSession({
      sub: payload.sub,
      email: payload.email,
      name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
      university: payload.hd || undefined,
      provider: 'google',
    });

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('csb_session', sessionJwt, {
      httpOnly: true,
      sameSite: isProd ? 'strict' : 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 2, // 2h
      path: '/',
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Auth google exchange failed:', err);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

// Email / password login (non-Google) - demo friendly
// Accepts { identifier, password }
// identifier can be email OR derived username pattern first.last (case-insensitive)
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier and password are required' });
    }

    const pool = await azureSQL.getPool();
    const request = pool.request();
    request.input('email', sql.NVarChar(255), identifier.toLowerCase());
    // We'll fetch a small candidate set (all users) only if needed to match first.last pattern
    // Prefer direct email equality first
    let result = await request.query(`
      SELECT TOP 1 * FROM users WHERE LOWER(email) = @email AND is_active = 1
    `);

    let user = result.recordset[0];

    // Support first.last derived username (e.g., john.doe) mapping to email local-part
    if (!user && identifier.includes('.')) {
      const parts = identifier.toLowerCase().split('@')[0];
      const unameParts = parts.split('.');
      if (unameParts.length >= 2) {
        const unameFirst = unameParts[0];
        const unameLast = unameParts.slice(1).join('.');
        const req2 = pool.request();
        req2.input('first', sql.NVarChar(100), unameFirst);
        req2.input('last', sql.NVarChar(100), unameLast);
        const res2 = await req2.query(`
          SELECT TOP 1 * FROM users
          WHERE LOWER(first_name) = @first AND LOWER(last_name) = @last AND is_active = 1
          ORDER BY user_id ASC
        `);
        user = res2.recordset[0];
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const stored = user.password_hash || '';
    let valid = false;
    if (stored.startsWith('$2')) {
      // bcrypt hash
      valid = await bcrypt.compare(password, stored);
    } else {
      // Development placeholder: accept password123 for any sample user with non-bcrypt placeholder hash
      valid = password === 'password123';
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Issue session cookie (JWT) referencing internal user_id
    const sessionJwt = signSession({
      sub: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`.trim(),
      provider: 'local',
    });

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('csb_session', sessionJwt, {
      httpOnly: true,
      sameSite: isProd ? 'strict' : 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 2,
      path: '/',
    });

    const responseUser = {
      user_id: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      university: user.university,
      course: user.course,
      year_of_study: user.year_of_study,
      profile_image_url: user.profile_image_url,
      is_active: user.is_active,
    };

    return res.json({ user: responseUser });
  } catch (err) {
    console.error('Local login failed:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Registration endpoint
router.post('/register', async (req, res) => {
  try {
    const { 
      first_name, 
      last_name, 
      email, 
      password, 
      university, 
      course, 
      year_of_study, 
      user_type,
      // Organization specific fields
      organization_name,
      admin_name,
      admin_email,
      email_domain,
      location
    } = req.body || {};

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const pool = await azureSQL.getPool();
    
    // Check if user already exists
    const checkRequest = pool.request();
    checkRequest.input('email', sql.NVarChar(255), email.toLowerCase());
    const existing = await checkRequest.query(`
      SELECT user_id FROM users WHERE LOWER(email) = @email
    `);
    
    if (existing.recordset.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user based on user_type
    const insertRequest = pool.request();
    
    if (user_type === 'organization') {
      // Organization registration
      insertRequest.input('email', sql.NVarChar(255), admin_email.toLowerCase());
      insertRequest.input('passwordHash', sql.NVarChar(255), passwordHash);
      insertRequest.input('firstName', sql.NVarChar(100), admin_name.split(' ')[0] || '');
      insertRequest.input('lastName', sql.NVarChar(100), admin_name.split(' ').slice(1).join(' ') || '');
      insertRequest.input('university', sql.NVarChar(255), organization_name);
      insertRequest.input('course', sql.NVarChar(255), 'Administrator');
      insertRequest.input('yearOfStudy', sql.Int, null);
      
      const result = await insertRequest.query(`
        INSERT INTO users (
          email, password_hash, first_name, last_name, university, course, 
          year_of_study, is_active, created_at
        )
        OUTPUT inserted.*
        VALUES (
          @email, @passwordHash, @firstName, @lastName, @university, @course,
          @yearOfStudy, 1, GETUTCDATE()
        )
      `);
      
      const newUser = result.recordset[0];
      
      // Create session
      const sessionJwt = signSession({
        sub: newUser.user_id,
        email: newUser.email,
        name: `${newUser.first_name} ${newUser.last_name}`.trim(),
        provider: 'local',
      });

      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('csb_session', sessionJwt, {
        httpOnly: true,
        sameSite: isProd ? 'strict' : 'lax',
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 2,
        path: '/',
      });

      return res.status(201).json({
        message: 'Organization registered successfully',
        user: {
          id: newUser.user_id,
          email: newUser.email,
          name: `${newUser.first_name} ${newUser.last_name}`.trim(),
          university: newUser.university,
        }
      });
      
    } else {
      // Student registration
      insertRequest.input('email', sql.NVarChar(255), email.toLowerCase());
      insertRequest.input('passwordHash', sql.NVarChar(255), passwordHash);
      insertRequest.input('firstName', sql.NVarChar(100), first_name || '');
      insertRequest.input('lastName', sql.NVarChar(100), last_name || '');
      insertRequest.input('university', sql.NVarChar(255), university || '');
      insertRequest.input('course', sql.NVarChar(255), course || '');
      insertRequest.input('yearOfStudy', sql.Int, year_of_study || null);
      
      const result = await insertRequest.query(`
        INSERT INTO users (
          email, password_hash, first_name, last_name, university, course, 
          year_of_study, is_active, created_at
        )
        OUTPUT inserted.*
        VALUES (
          @email, @passwordHash, @firstName, @lastName, @university, @course,
          @yearOfStudy, 1, GETUTCDATE()
        )
      `);
      
      const newUser = result.recordset[0];
      
      // Create session
      const sessionJwt = signSession({
        sub: newUser.user_id,
        email: newUser.email,
        name: `${newUser.first_name} ${newUser.last_name}`.trim(),
        provider: 'local',
      });

      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('csb_session', sessionJwt, {
        httpOnly: true,
        sameSite: isProd ? 'strict' : 'lax',
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 2,
        path: '/',
      });

      return res.status(201).json({
        message: 'Student registered successfully',
        user: {
          id: newUser.user_id,
          email: newUser.email,
          name: `${newUser.first_name} ${newUser.last_name}`.trim(),
          university: newUser.university,
          course: newUser.course,
          year_of_study: newUser.year_of_study,
        }
      });
    }

  } catch (err) {
    console.error('Registration failed:', err);
    if (err.message.includes('UNIQUE KEY constraint')) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('csb_session', { httpOnly: true, sameSite: isProd ? 'strict' : 'lax', secure: isProd, path: '/' });
  res.json({ ok: true });
});

module.exports = router;
