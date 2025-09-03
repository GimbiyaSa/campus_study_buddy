// Mock jwks-rsa to avoid network calls
jest.mock('jwks-rsa', () => {
  return jest.fn(() => ({
    getSigningKey: (kid, cb) => cb(null, { publicKey: 'fake-key' }),
  }));
});

// Mock jsonwebtoken to control verification behavior
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token, getKey, options, cb) => {
    // Simulate different token cases based on token value
    if (token === 'valid') {
      return cb(null, {
        sub: 'user-valid',
        email: 'valid@example.com',
        name: 'Valid User',
        extension_University: 'UniA',
        extension_Course: 'CourseA',
      });
    }

    if (token === 'emails') {
      return cb(null, {
        sub: 'user-emails',
        emails: ['emails@example.com'],
        name: 'Emails User',
      });
    }

    // Any other token -> invalid
    return cb(new Error('invalid token'));
  }),
}));

const { authenticateToken } = require('./authMiddleware');

describe('authMiddleware.authenticateToken', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('returns 401 when no token provided', () => {
    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when token is invalid', () => {
    req.headers.authorization = 'Bearer nope';
    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next and sets req.user when token is valid with email', () => {
    req.headers.authorization = 'Bearer valid';
    authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-valid');
    expect(req.user.email).toBe('valid@example.com');
    expect(req.user.university).toBe('UniA');
  });

  test('uses emails[0] when email not present', () => {
    req.headers.authorization = 'Bearer emails';
    authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.email).toBe('emails@example.com');
  });
});
