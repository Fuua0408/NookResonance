'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getDb } = require('./db');
const authRoutes = require('./routes/auth');
const characterRoutes = require('./routes/characters');
const sessionRoutes = require('./routes/sessions');
const workflowRoutes = require('./routes/workflows');
const settingsRoutes = require('./routes/settings');
const imageRoutes = require('./routes/images');
const llmRoutes   = require('./routes/llm');
const comfyRoutes = require('./routes/comfy');

const app = express();
const PORT = process.env.PORT || 18090;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
// Serve thumbnail cache
app.use('/data/cache', express.static(path.join(__dirname, '..', 'data', 'cache')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/llm',   llmRoutes);
app.use('/api/comfy', comfyRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize DB then start server
getDb();
app.listen(PORT, () => {
  console.log(`NookResonance listening on http://localhost:${PORT}`);
});
