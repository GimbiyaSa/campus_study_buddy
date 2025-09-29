// Mock google-auth-library to avoid network calls
jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: jest.fn().mockImplementation(({ idToken }) => {
        // Simulate different token cases based on token value
        if (idToken === 'valid') {
          return Promise.resolve({
            getPayload: () => ({
              sub: 'user-valid',
              email: 'valid@example.com',
              name: 'Valid User',
              hd: 'UniA',
            }),
          });
        }

        if (idToken === 'emails') {
          return Promise.resolve({
            getPayload: () => ({
              sub: 'user-emails',
              email: 'emails@example.com',
              name: 'Emails User',
            }),
          });
        }

        // Any other token -> invalid
        return Promise.reject(new Error('Invalid token'));
      }),
    })),
  };
});

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

  test('returns 403 when token is invalid', async () => {
    req.headers.authorization = 'Bearer nope';
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Google token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next and sets req.user when token is valid with email', async () => {
    req.headers.authorization = 'Bearer valid';
    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-valid');
    expect(req.user.email).toBe('valid@example.com');
    expect(req.user.university).toBe('UniA');
  });

  test('uses email when email is present', async () => {
    req.headers.authorization = 'Bearer emails';
    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.email).toBe('emails@example.com');
  });
});
