'use strict';

const express = require('express');
const { authMiddleware } = require('../auth');
const { getCharacterProfileForMcp } = require('./characterProfile');
const logger = require('../logger');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = {
  name: 'nookresonance-mcp',
  title: 'NookResonance MCP Server',
  version: '1.0.0',
};

const CHARACTER_PROFILE_TOOL = {
  name: 'get_character_profile',
  title: 'Get Character Profile',
  description: 'Use this tool when the user asks to reference, inspect, summarize, roleplay as, or preserve consistency with a NookResonance character. It returns the authenticated user\'s character personality, speaking tone, and affection information by exact character name. Use it before answering in a character\'s voice, checking character consistency, or explaining a character\'s personality or relationship with the user.',
  inputSchema: {
    type: 'object',
    properties: {
      character_name: {
        type: 'string',
        description: 'Exact character name to look up.',
      },
    },
    required: ['character_name'],
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
      affection: {
        anyOf: [
          {
            type: 'object',
            properties: {
              level: { type: 'integer' },
              label: { type: 'string' },
            },
            required: ['level', 'label'],
          },
          { type: 'null' },
        ],
      },
      updated_at: { type: 'string' },
    },
    required: ['user_id', 'character_id', 'character_name', 'personality', 'tone', 'affection', 'updated_at'],
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
    instructions: 'Use get_character_profile with a Bearer token and character_name to read character personality and speaking tone for the authenticated user.',
  });
}

function handleToolsList(id) {
  return jsonRpcResult(id, {
    tools: [CHARACTER_PROFILE_TOOL],
  });
}

function handleToolsCall(id, params = {}, user) {
  params = params || {};
  const toolName = params.name || '';
  const args = params.arguments || {};
  const characterName = typeof args.character_name === 'string'
    ? args.character_name.trim()
    : (typeof args.characterName === 'string' ? args.characterName.trim() : '');
  const logCharacterName = characterName || '<missing>';

  logger.info(`[MCP] tools/call name=${toolName || '<missing>'} userId=${user?.id ?? '<unknown>'} characterName=${JSON.stringify(logCharacterName)}`);

  if (params.name !== CHARACTER_PROFILE_TOOL.name) {
    logger.warn(`[MCP] tools/call error userId=${user?.id ?? '<unknown>'} name=${toolName || '<missing>'} characterName=${JSON.stringify(logCharacterName)} message=${JSON.stringify(`Unknown tool: ${toolName}`)}`);
    return jsonRpcResult(id, toolErrorResult(`Unknown tool: ${params.name || ''}`));
  }

  try {
    const profile = getCharacterProfileForMcp(user, args);
    const text = JSON.stringify(profile, null, 2);
    logger.info(`[MCP] get_character_profile success userId=${user?.id ?? '<unknown>'} characterId=${profile.character_id} characterName=${JSON.stringify(profile.character_name)}`);
    return jsonRpcResult(id, {
      content: [{ type: 'text', text }],
      structuredContent: profile,
      isError: false,
    });
  } catch (err) {
    logger.warn(`[MCP] get_character_profile error userId=${user?.id ?? '<unknown>'} characterName=${JSON.stringify(logCharacterName)} message=${JSON.stringify(err.message)}`);
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
