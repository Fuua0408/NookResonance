'use strict';

const express = require('express');
const { authMiddleware } = require('../auth');
const { getCharacterProfileForMcp } = require('./characterProfile');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = {
  name: 'nookresonance-mcp',
  title: 'NookResonance MCP Server',
  version: '1.0.0',
};

const CHARACTER_PROFILE_TOOL = {
  name: 'get_character_profile',
  title: 'Get Character Profile',
  description: 'Return the personality and speaking tone for a character owned by the authenticated user.',
  inputSchema: {
    type: 'object',
    properties: {
      user_id: {
        type: ['integer', 'string'],
        description: 'Authenticated NookResonance user ID.',
      },
      character_name: {
        type: 'string',
        description: 'Exact character name to look up.',
      },
    },
    required: ['user_id', 'character_name'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      user_id: { type: 'integer' },
      character_id: { type: 'integer' },
      character_name: { type: 'string' },
      personality: { type: 'string' },
      tone: { type: 'string' },
      updated_at: { type: 'string' },
    },
    required: ['user_id', 'character_id', 'character_name', 'personality', 'tone', 'updated_at'],
  },
  annotations: {
    readOnlyHint: true,
  },
};

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function errorCodeFor(err) {
  if (err.code === 'BAD_REQUEST') return -32602;
  if (err.code === 'NOT_FOUND') return -32004;
  if (err.code === 'FORBIDDEN') return -32003;
  if (err.code === 'CONFLICT') return -32009;
  return -32603;
}

function toolErrorResult(message) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function handleInitialize(id, params = {}) {
  const requestedVersion = params.protocolVersion || PROTOCOL_VERSION;
  return jsonRpcResult(id, {
    protocolVersion: requestedVersion === PROTOCOL_VERSION ? requestedVersion : PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
    instructions: 'Use get_character_profile with a Bearer token, user_id, and character_name to read character personality and speaking tone.',
  });
}

function handleToolsList(id) {
  return jsonRpcResult(id, {
    tools: [CHARACTER_PROFILE_TOOL],
  });
}

function handleToolsCall(id, params = {}, user) {
  if (params.name !== CHARACTER_PROFILE_TOOL.name) {
    return jsonRpcResult(id, toolErrorResult(`Unknown tool: ${params.name || ''}`));
  }

  try {
    const profile = getCharacterProfileForMcp(user, params.arguments || {});
    const text = JSON.stringify(profile, null, 2);
    return jsonRpcResult(id, {
      content: [{ type: 'text', text }],
      structuredContent: profile,
      isError: false,
    });
  } catch (err) {
    return jsonRpcResult(id, toolErrorResult(err.message));
  }
}

function handleRpcMessage(message, user) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return jsonRpcError(message?.id, -32600, 'Invalid Request');
  }

  const id = message.id;
  if (message.method === 'notifications/initialized') return null;
  if (message.method === 'ping') return jsonRpcResult(id, {});
  if (message.method === 'initialize') return handleInitialize(id, message.params);
  if (message.method === 'tools/list') return handleToolsList(id);
  if (message.method === 'tools/call') return handleToolsCall(id, message.params, user);

  return jsonRpcError(id, -32601, `Method not found: ${message.method}`);
}

function createMcpRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      name: SERVER_INFO.name,
      protocolVersion: PROTOCOL_VERSION,
      transport: 'streamable-http-json-rpc',
      endpoint: '/mcp',
      authentication: 'Bearer JWT from /api/auth/login',
    });
  });

  router.post('/', authMiddleware, (req, res) => {
    const body = req.body;
    const messages = Array.isArray(body) ? body : [body];
    const responses = [];

    for (const message of messages) {
      try {
        const response = handleRpcMessage(message, req.user);
        if (response) responses.push(response);
      } catch (err) {
        responses.push(jsonRpcError(message?.id, errorCodeFor(err), err.message));
      }
    }

    if (!responses.length) return res.status(202).end();
    res.json(Array.isArray(body) ? responses : responses[0]);
  });

  return router;
}

module.exports = createMcpRouter;
