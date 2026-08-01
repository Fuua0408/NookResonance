'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getDb } = require('./db');
const logger = require('./logger');
const { syncToolsToDb, disableToolsForDisabledServers } = require('./tools');
const { initMcp, closeMcp, getActiveChildPids } = require('./mcp-client');
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
const mcpAdminRoutes = require('./routes/mcpAdmin');
const mcpKeysRoutes = require('./routes/mcpKeys');

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
app.use('/api/mcp-admin', mcpAdminRoutes);
app.use('/api/mcp-keys', mcpKeysRoutes);

// API fallback must stay JSON; otherwise the SPA fallback returns HTML to fetch().
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 起動順序: DB初期化(migrate+clock seed)→MCP接続+登録(initMcp)→接続成功サーバー集合を使って
// tools台帳へミラー同期(孤児tools無効化はここで判定)→HTTPサーバー起動。
// MCP接続は非同期(tools/list)なので起動処理全体をasync化する。
// 1サーバーの接続失敗は隔離され、起動シーケンス全体は継続する
async function main() {
  const db = getDb();

  const { connected } = await initMcp();
  syncToolsToDb(db, connected);
  disableToolsForDisabledServers(db);

  app.listen(PORT, () => {
    console.log(`NookResonance listening on http://localhost:${PORT}`);
  });
}

// 正常経路(SIGINT/SIGTERM)を問わず、後始末(closeMcp)→終了は一度きりにする多重ガード
let shuttingDown = false;

// MCPクライアントをcloseし、stdio子プロセス(clock等)を終了させてから終了する(孤児プロセス防止)
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`NookResonance: received ${signal}, shutting down`);
  try {
    await closeMcp();
  } catch (e) {
    logger.error('NookResonance: error during mcp shutdown', { error: e.message });
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 非同期closeが間に合わずプロセスが落ちる場合の最終防衛。exitハンドラは同期処理のみ実行できるため、
// 保持しているstdio子プロセスPIDへ同期的にkillを撃つ。対象は自分が起動したPIDに厳密限定
// (Windowsはprocess.kill(pid)がシグナル種別を無視し強制終了として働く)。多重に走ってもtry/catchで無害
process.on('exit', () => {
  for (const pid of getActiveChildPids()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (e) {
      // 既に終了済み等はここで無視してよい(誤爆防止のため対象PID以外には触れない)
    }
  }
});

main().catch((e) => {
  logger.error('NookResonance: fatal startup error', { error: e.message });
  process.exit(1);
});
