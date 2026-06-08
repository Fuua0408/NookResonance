'use strict';

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function advancedMiddleware(req, res, next) {
  if (!req.user?.is_admin && !req.user?.is_advanced) {
    return res.status(403).json({ error: 'Advanced or admin required' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, advancedMiddleware };
