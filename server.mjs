import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import initSqlJs from 'sql.js';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'fuzzaholic.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const SQL = await initSqlJs({
  locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
});

const db = fs.existsSync(dbPath)
  ? new SQL.Database(fs.readFileSync(dbPath))
  : new SQL.Database();

db.run(`
  CREATE TABLE IF NOT EXISTS shaders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    tags TEXT NOT NULL,
    thumbnail TEXT,
    parentId TEXT,
    generation INTEGER DEFAULT 0,
    rating INTEGER DEFAULT 0,
    metadata TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS taste_samples (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    mode TEXT NOT NULL,
    code TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`);

function persist() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function rows(statement) {
  const result = db.exec(statement);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(valueRow => Object.fromEntries(columns.map((column, i) => [column, valueRow[i]])));
}

function shaderFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    timestamp: Number(row.timestamp),
    tags: JSON.parse(row.tags || '[]'),
    thumbnail: row.thumbnail || undefined,
    parentId: row.parentId || undefined,
    generation: Number(row.generation || 0),
    rating: Number(row.rating || 0),
    metadata: JSON.parse(row.metadata || '{}'),
  };
}

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath });
});

app.get('/api/shaders', (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const tag = typeof req.query.tag === 'string' ? req.query.tag : '';
  const all = rows(`SELECT * FROM shaders ORDER BY timestamp DESC LIMIT ${limit}`).map(shaderFromRow);
  res.json(tag ? all.filter(shader => shader.tags.includes(tag)) : all);
});

app.post('/api/shaders', (req, res) => {
  const body = req.body || {};
  const shader = {
    id: body.id || `shader_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: String(body.name || `Shader ${new Date().toLocaleString()}`),
    code: String(body.code || ''),
    timestamp: Number(body.timestamp || Date.now()),
    tags: Array.isArray(body.tags) ? body.tags : [],
    thumbnail: body.thumbnail || null,
    parentId: body.parentId || null,
    generation: Number(body.generation || 0),
    rating: Number(body.rating || 0),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };

  if (!shader.code.trim()) {
    res.status(400).json({ error: 'Shader code is required' });
    return;
  }

  db.run(
    `INSERT OR REPLACE INTO shaders
      (id, name, code, timestamp, tags, thumbnail, parentId, generation, rating, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      shader.id,
      shader.name,
      shader.code,
      shader.timestamp,
      JSON.stringify(shader.tags),
      shader.thumbnail,
      shader.parentId,
      shader.generation,
      shader.rating,
      JSON.stringify(shader.metadata),
    ]
  );
  persist();
  res.json(shader);
});

app.patch('/api/shaders/:id', (req, res) => {
  const id = req.params.id;
  const rating = Number(req.body?.rating ?? 0);
  db.run('UPDATE shaders SET rating = ? WHERE id = ?', [rating, id]);
  persist();
  res.json({ ok: true });
});

app.delete('/api/shaders/:id', (req, res) => {
  db.run('DELETE FROM shaders WHERE id = ?', [req.params.id]);
  persist();
  res.json({ ok: true });
});

app.get('/api/shader-stats', (_req, res) => {
  const shaders = rows('SELECT * FROM shaders').map(shaderFromRow);
  const rated = shaders.filter(shader => shader.rating > 0);
  const tagCounts = new Map();
  for (const shader of shaders) {
    for (const tag of shader.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  res.json({
    totalCount: shaders.length,
    ratedCount: rated.length,
    averageRating: rated.length ? rated.reduce((sum, shader) => sum + shader.rating, 0) / rated.length : 0,
    topTags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    generationDistribution: shaders.reduce((acc, shader) => {
      acc[shader.generation] = (acc[shader.generation] || 0) + 1;
      return acc;
    }, {}),
  });
});

app.get('/api/taste', (_req, res) => {
  res.json(rows('SELECT label, mode, code, timestamp FROM taste_samples ORDER BY timestamp DESC LIMIT 120'));
});

app.post('/api/taste', (req, res) => {
  const sample = {
    id: `taste_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    label: String(req.body?.label || ''),
    mode: String(req.body?.mode || 'fragment'),
    code: String(req.body?.code || ''),
    timestamp: Number(req.body?.timestamp || Date.now()),
  };
  if (!['liked', 'disliked', 'tooSimilar'].includes(sample.label) || !sample.code.trim()) {
    res.status(400).json({ error: 'Invalid taste sample' });
    return;
  }
  db.run('INSERT INTO taste_samples (id, label, mode, code, timestamp) VALUES (?, ?, ?, ?, ?)', [
    sample.id,
    sample.label,
    sample.mode,
    sample.code,
    sample.timestamp,
  ]);
  persist();
  res.json(sample);
});

const port = Number(process.env.PORT || 3000);
const hmrPort = Number(process.env.HMR_PORT || (port + 10000));

const vite = await createViteServer({
  server: {
    middlewareMode: true,
    hmr: { port: hmrPort },
  },
  appType: 'spa',
});

app.use(vite.middlewares);

app.listen(port, '0.0.0.0', () => {
  console.log(`Fuzzaholic running at http://127.0.0.1:${port}/`);
  console.log(`SQLite database: ${dbPath}`);
  console.log(`Vite HMR websocket: ws://127.0.0.1:${hmrPort}/`);
});
