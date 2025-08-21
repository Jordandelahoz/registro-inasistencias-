import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);
const DB_PATH = path.join(__dirname, 'data.sqlite');

// DB init
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('alumno','profesor')),
    nombre TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS inasistencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_nombre TEXT NOT NULL,
    grado TEXT NOT NULL,
    fecha TEXT NOT NULL,
    motivo TEXT NOT NULL,
    observacion TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Seed de usuarios demo (si no existen)
  const seedUsers = [
    { email: 'profe@fhr.edu', pass: '1234', role: 'profesor', nombre: 'Profe Demo' },
    { email: 'alumno@fhr.edu', pass: 'abcd', role: 'alumno',  nombre: 'Alumno Demo' }
  ];

  seedUsers.forEach(u => {
    db.get('SELECT id FROM users WHERE email = ?', [u.email], (err, row) => {
      if (err) return console.error(err);
      if (!row) {
        const hash = bcrypt.hashSync(u.pass, 10);
        db.run('INSERT INTO users (email, password_hash, role, nombre) VALUES (?,?,?,?)',
          [u.email, hash, u.role, u.nombre]);
      }
    });
  });
});

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'super-secreto-cambia-esto',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8h
  }
}));

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helpers de auth
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'No autenticado' });
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session?.user?.role === role) return next();
    return res.status(403).json({ error: 'No autorizado' });
  };
}

// ===== Rutas de AUTH =====
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    req.session.user = { id: user.id, email: user.email, role: user.role, nombre: user.nombre };
    res.json({ message: 'Login ok', user: req.session.user });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout ok' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(200).json({ user: null });
  res.json({ user: req.session.user });
});

// ===== Rutas de INASISTENCIAS =====
// Crear (alumno)
app.post('/api/inasistencias', requireAuth, (req, res) => {
  const { alumno_nombre, grado, fecha, motivo, observacion } = req.body;
  if (!alumno_nombre || !grado || !fecha || !motivo || !observacion) {
    return res.status(400).json({ error: 'Campos incompletos' });
  }
  const userId = req.session.user.id;
  db.run(
    `INSERT INTO inasistencias (alumno_nombre, grado, fecha, motivo, observacion, user_id)
     VALUES (?,?,?,?,?,?)`,
    [alumno_nombre, grado, fecha, motivo, observacion, userId],
    function(err){
      if (err) return res.status(500).json({ error: 'DB error' });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Listar todas (profesor)
app.get('/api/inasistencias', requireAuth, requireRole('profesor'), (req, res) => {
  db.all(`SELECT i.*, u.email as creado_por
          FROM inasistencias i
          JOIN users u ON u.id = i.user_id
          ORDER BY datetime(i.created_at) DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

// Listar sólo mías (alumno)
app.get('/api/inasistencias/mias', requireAuth, requireRole('alumno'), (req, res) => {
  db.all(`SELECT * FROM inasistencias WHERE user_id = ? ORDER BY datetime(created_at) DESC`,
    [req.session.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(rows);
    });
});

// Eliminar una (profesor)
app.delete('/api/inasistencias/:id', requireAuth, requireRole('profesor'), (req, res) => {
  db.run('DELETE FROM inasistencias WHERE id = ?', [req.params.id], function(err){
    if (err) return res.status(500).json({ error: 'DB error' });
    if (this.changes === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true });
  });
});

// Eliminar todas (profesor)
app.delete('/api/inasistencias', requireAuth, requireRole('profesor'), (req, res) => {
  db.run('DELETE FROM inasistencias', [], function(err){
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ ok: true, eliminadas: this.changes });
  });
});

// Fallback SPA (opcional):
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor escuchando en http://localhost:${PORT}`));
