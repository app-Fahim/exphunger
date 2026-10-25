require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'exphunger';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
let db;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a random secret of at least 32 characters.');
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error('Set MONGODB_URI in the deployment environment.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const users = () => db.collection('users');
const products = () => db.collection('products');
const safeUser = u => ({ id: String(u._id), email: u.email, role: u.role || 'user' });
function signToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '12h', issuer: 'exphunger-api', audience: 'exphunger-web' });
}
async function auth(req, res, next) {
  try {
    const value = req.headers.authorization || '';
    const token = value.startsWith('Bearer ') ? value.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Please log in.' });
    const claims = jwt.verify(token, JWT_SECRET, { issuer: 'exphunger-api', audience: 'exphunger-web' });
    const user = await users().findOne({ _id: new ObjectId(claims.sub), active: { $ne: false } });
    if (!user) return res.status(401).json({ error: 'Account not found or disabled.' });
    req.user = user;
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
function normalizeProduct(input, ownerId) {
  const id = String(input && input.id || '').trim();
  if (!id || id.length > 200) throw new Error('Each product needs a valid id.');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Each product needs a product name.');
  const stock = Number(input.stock ?? 0);
  const minStock = Number(input.minStock ?? 0);
  if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(minStock) || minStock < 0) throw new Error('Stock values must be non-negative numbers.');
  return {
    ownerId,
    productId: id,
    name: name.slice(0, 500),
    image_url: String(input.image_url || '').slice(0, 3000),
    barcode: String(input.barcode || '').slice(0, 200),
    sku: String(input.sku || '').slice(0, 200),
    stock,
    minStock,
    expiry: input.expiry ? String(input.expiry).slice(0, 30) : '',
    batch: String(input.batch || '').slice(0, 500),
    notes: String(input.notes || '').slice(0, 12000),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stockHistory: Array.isArray(input.stockHistory) ? input.stockHistory.slice(-100) : []
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'exphunger-mongodb-api' }));

app.post('/api/auth/register', async (req, res) => {
  try {
    if (!ALLOW_SIGNUP) return res.status(403).json({ error: 'Account registration is disabled. Ask the administrator to create your account.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    if (await users().findOne({ email })) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = { email, passwordHash: await bcrypt.hash(password, 12), role: 'user', active: true, createdAt: new Date() };
    const result = await users().insertOne(user);
    user._id = result.insertedId;
    res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await users().findOne({ email, active: { $ne: false } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash || ''))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (_) {
    res.status(500).json({ error: 'Could not log in.' });
  }
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));

app.get('/api/products', auth, async (req, res) => {
  try {
    const rows = await products().find({ ownerId: String(req.user._id) }).sort({ name: 1 }).toArray();
    res.json({ products: rows.map(({ _id, ownerId, productId, ...p }) => ({ ...p, id: productId })) });
  } catch (_) { res.status(500).json({ error: 'Could not load products.' }); }
});

app.post('/api/products/bulk', auth, async (req, res) => {
  const list = req.body && req.body.products;
  if (!Array.isArray(list) || list.length < 1 || list.length > 1000) return res.status(400).json({ error: 'Send between 1 and 1000 products per batch.' });
  try {
    const ownerId = String(req.user._id);
    const ops = list.map(p => {
      const clean = normalizeProduct(p, ownerId);
      return { updateOne: { filter: { ownerId, productId: clean.productId }, update: { $set: clean }, upsert: true } };
    });
    const result = await products().bulkWrite(ops, { ordered: true });
    res.json({ ok: true, received: list.length, upserted: result.upsertedCount, modified: result.modifiedCount });
  } catch (e) { res.status(400).json({ error: e.message || 'Could not save product batch.' }); }
});

app.post('/api/products', auth, async (req, res) => {
  try {
    const clean = normalizeProduct(req.body, String(req.user._id));
    await products().updateOne({ ownerId: clean.ownerId, productId: clean.productId }, { $set: clean }, { upsert: true });
    res.json({ ok: true, product: { ...clean, id: clean.productId } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/products/:id', auth, async (req, res) => {
  try {
    const clean = normalizeProduct({ ...req.body, id: req.params.id }, String(req.user._id));
    const result = await products().updateOne({ ownerId: clean.ownerId, productId: clean.productId }, { $set: clean }, { upsert: true });
    res.json({ ok: true, matched: result.matchedCount > 0, product: { ...clean, id: clean.productId } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    const result = await products().deleteOne({ ownerId: String(req.user._id), productId: String(req.params.id) });
    res.json({ ok: true, deleted: result.deletedCount === 1 });
  } catch (_) { res.status(500).json({ error: 'Could not delete product.' }); }
});

app.delete('/api/products', auth, async (req, res) => {
  try {
    const result = await products().deleteMany({ ownerId: String(req.user._id) });
    res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (_) { res.status(500).json({ error: 'Could not clear this account’s products.' }); }
});

async function start() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(DB_NAME);
  await users().createIndex({ email: 1 }, { unique: true });
  await products().createIndex({ ownerId: 1, productId: 1 }, { unique: true });
  await products().createIndex({ ownerId: 1, name: 1 });
  app.listen(PORT, () => console.log('Exphunger API listening on port ' + PORT));
}
start().catch(err => { console.error('MongoDB startup failed:', err.message); process.exit(1); });
