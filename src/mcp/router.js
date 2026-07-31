'use strict';

const express = require('express');
const { authMiddleware } = require('../auth');
const {
  getCharacterProfileForMcp,
  listCharactersForMcp,
  searchCharactersForMcp,
} = require('./characterProfile');
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
  description: 'Use this tool when the user asks to reference, inspect, summarize, roleplay as, or preserve consistency with a NookResonance character. It returns the authenticated user\'s character personality, speaking tone, and affection information by exact character name. If the exact character name is unknown or ambiguous, call list_characters or search_characters first, then use the returned character_name.',
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
              cap: { type: 'integer' },
            },
            required: ['level', 'label', 'cap'],
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
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const LIST_CHARACTERS_TOOL = {
  name: 'list_characters',
  title: 'List Characters',
  description: 'List NookResonance characters owned by the authenticated user. Use this tool when the user did not provide an exact character name, when you need to check available characters, or before calling get_character_profile if the character name is ambiguous.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      characters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            character_id: { type: 'integer' },
            character_name: { type: 'string' },
            affection: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    level: { type: 'integer' },
                    label: { type: 'string' },
                    cap: { type: 'integer' },
                  },
                  required: ['level', 'label', 'cap'],
                },
                { type: 'null' },
              ],
            },
            summary: { type: 'string' },
            updated_at: { type: 'string' },
          },
          required: ['character_id', 'character_name', 'affection', 'summary', 'updated_at'],
        },
      },
    },
    required: ['characters'],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const SEARCH_CHARACTERS_TOOL = {
  name: 'search_characters',
  title: 'Search Characters',
  description: 'Search NookResonance characters owned by the authenticated user by character name, personality, or speaking tone. Use this tool when the user\'s character reference is ambiguous, when the exact character name is unknown, or when searching by traits such as personality or tone. Use the returned character_name with get_character_profile when detailed profile information is needed.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keyword to search character names, personality, or speaking tone.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of matches to return. Defaults to 10 and is capped at 25.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            character_id: { type: 'integer' },
            character_name: { type: 'string' },
            matched_fields: {
              type: 'array',
              items: { type: 'string' },
            },
            preview: { type: 'string' },
            affection: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    level: { type: 'integer' },
                    label: { type: 'string' },
                    cap: { type: 'integer' },
                  },
                  required: ['level', 'label', 'cap'],
                },
                { type: 'null' },
              ],
            },
            updated_at: { type: 'string' },
          },
          required: ['character_id', 'character_name', 'matched_fields', 'preview', 'affection', 'updated_at'],
        },
      },
    },
    required: ['query', 'matches'],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const TOOLS = [
  CHARACTER_PROFILE_TOOL,
  LIST_CHARACTERS_TOOL,
  SEARCH_CHARACTERS_TOOL,
];

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
    instructions: 'Use list_characters to inspect available characters, search_characters when the exact character name is unknown, and get_character_profile with an exact character_name to read personality, speaking tone, and affection for the authenticated user.',
  });
}

function handleToolsList(id) {
  return jsonRpcResult(id, {
    tools: TOOLS,
  });
}

function mcpToolResult(result) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    isError: false,
  };
}

function handleToolsCall(id, params = {}, user) {
  params = params || {};
  const toolName = params.name || '';
  const args = params.arguments || {};
  const characterName = typeof args.character_name === 'string'
    ? args.character_name.trim()
    : (typeof args.characterName === 'string' ? args.characterName.trim() : '');
  const logCharacterName = characterName || '<missing>';
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const limit = args.limit ?? '';

  if (toolName === SEARCH_CHARACTERS_TOOL.name) {
    logger.info(`[MCP] tools/call name=${toolName} userId=${user?.id ?? '<unknown>'} query=${JSON.stringify(query)} limit=${JSON.stringify(limit)}`);
  } else if (toolName === LIST_CHARACTERS_TOOL.name) {
    logger.info(`[MCP] tools/call name=${toolName} userId=${user?.id ?? '<unknown>'}`);
  } else {
    logger.info(`[MCP] tools/call name=${toolName || '<missing>'} userId=${user?.id ?? '<unknown>'} characterName=${JSON.stringify(logCharacterName)}`);
  }

  if (!TOOLS.find(tool => tool.name === params.name)) {
    logger.warn(`[MCP] tools/call error userId=${user?.id ?? '<unknown>'} name=${toolName || '<missing>'} characterName=${JSON.stringify(logCharacterName)} message=${JSON.stringify(`Unknown tool: ${toolName}`)}`);
    return jsonRpcResult(id, toolErrorResult(`Unknown tool: ${params.name || ''}`));
  }

  try {
    if (toolName === LIST_CHARACTERS_TOOL.name) {
      const result = listCharactersForMcp(user);
      logger.info(`[MCP] list_characters success userId=${user?.id ?? '<unknown>'} count=${result.characters.length}`);
      return jsonRpcResult(id, mcpToolResult(result));
    }

    if (toolName === SEARCH_CHARACTERS_TOOL.name) {
      const result = searchCharactersForMcp(user, args);
      logger.info(`[MCP] search_characters success userId=${user?.id ?? '<unknown>'} query=${JSON.stringify(result.query)} count=${result.matches.length}`);
      return jsonRpcResult(id, mcpToolResult(result));
    }

    const profile = getCharacterProfileForMcp(user, args);
    logger.info(`[MCP] get_character_profile success userId=${user?.id ?? '<unknown>'} characterId=${profile.character_id} characterName=${JSON.stringify(profile.character_name)}`);
    return jsonRpcResult(id, mcpToolResult(profile));
  } catch (err) {
    if (toolName === SEARCH_CHARACTERS_TOOL.name) {
      logger.warn(`[MCP] search_characters error userId=${user?.id ?? '<unknown>'} query=${JSON.stringify(query)} message=${JSON.stringify(err.message)}`);
    } else if (toolName === LIST_CHARACTERS_TOOL.name) {
      logger.warn(`[MCP] list_characters error userId=${user?.id ?? '<unknown>'} message=${JSON.stringify(err.message)}`);
    } else {
      logger.warn(`[MCP] get_character_profile error userId=${user?.id ?? '<unknown>'} characterName=${JSON.stringify(logCharacterName)} message=${JSON.stringify(err.message)}`);
    }
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
