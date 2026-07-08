'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getDb } = require('./db');
const { authMiddleware } = require('./auth');
const authRoutes = require('./routes/auth');
const characterRoutes = require('./routes/characters');
const usersRouter = require('./routes/users');
const sessionRoutes = require('./routes/sessions');
const workflowRoutes = require('./routes/workflows');
const settingsRoutes = require('./routes/settings');
const imageRoutes = require('./routes/images');
const llmRoutes   = require('./routes/llm');
const comfyRoutes   = require('./routes/comfy');
const uploadsRoutes = require('./routes/uploads');
const mcpRoutes = require('./mcp');

const app = express();
const PORT = process.env.PORT || 18090;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/characters', characterRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/llm',   llmRoutes);
app.use('/api/comfy',   comfyRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/mcp', mcpRoutes());
app.use('/api/mcp', mcpRoutes());

// API fallback must stay JSON; otherwise the SPA fallback returns HTML to fetch().
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize DB then start server
getDb();
app.listen(PORT, () => {
  console.log(`NookResonance listening on http://localhost:${PORT}`);
});
