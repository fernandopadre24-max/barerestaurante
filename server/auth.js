const crypto = require('crypto');
const { db } = require('./db');

const sessions = new Map();

function createSession(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, usuarioId);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const uid = token ? sessions.get(token) : null;
  if (!uid) return res.status(401).json({ error: 'Não autenticado' });
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(uid);
  if (!user || !user.ativo) {
    destroySession(token);
    return res.status(401).json({ error: 'Usuário inativo ou removido' });
  }
  req.usuario = user;
  req.token = token;
  next();
}

function admin(req, res, next) {
  if (req.usuario.papel !== 'adm') {
    return res.status(403).json({ error: 'Acesso restrito ao ADM' });
  }
  next();
}

module.exports = { createSession, destroySession, auth, admin, sessions };