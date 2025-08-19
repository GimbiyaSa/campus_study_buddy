const jwt = require('jsonwebtoken')
const jwksClient = require('jwks-rsa')

const client = jwksClient({
  jwksUri: 'https://studybuddyb2c.b2clogin.com/studybuddyb2c.onmicrosoft.com/B2C_1_SignUpSignIn/discovery/v2.0/keys'
})

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key.publicKey || key.rsaPublicKey
    callback(null, signingKey)
  })
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  jwt.verify(token, getKey, {
    audience: process.env.AZURE_CLIENT_ID,
    issuer: `https://studybuddyb2c.b2clogin.com/${process.env.AZURE_TENANT_ID}/v2.0/`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' })
    }
    
    req.user = {
      id: decoded.sub,
      email: decoded.email || decoded.emails?.[0],
      name: decoded.name,
      university: decoded.extension_University,
      course: decoded.extension_Course
    }
    next()
  })
}

module.exports = { authenticateToken }