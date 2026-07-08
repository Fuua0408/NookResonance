# NookResonance MCP Documentation

This document describes the MCP endpoint added to NookResonance.

## Overview

NookResonance exposes a JSON-RPC based MCP endpoint that returns character profile information for the authenticated user.

The current MCP server provides one tool:

- `get_character_profile`

This tool receives a user ID and a character name. If authentication succeeds and the character belongs to the authenticated user, it returns the character personality and speaking tone.

## Endpoint

```text
POST http://localhost:18090/mcp
```

Compatibility endpoint:

```text
POST http://localhost:18090/api/mcp
```

Simple server metadata can be checked with:

```text
GET http://localhost:18090/mcp
```

## Authentication

The MCP endpoint uses the same JWT authentication as the normal NookResonance API.

First, log in through `/api/auth/login` and obtain a token.

```powershell
$login = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:18090/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"username":"alice","password":"your-password"}'

$token = $login.token
```

All MCP requests must include:

```text
Authorization: Bearer <token>
```

In the web app, open Settings and use the MCP Integration section to copy:

- Endpoint URL
- Authorization header

The authenticated user is resolved from the Bearer token. The tool does not accept `user_id` as an input, so a user cannot request another user's character profile by changing arguments.

## MCP Lifecycle

### 1. Initialize

```powershell
$headers = @{ Authorization = "Bearer $token" }

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:18090/mcp" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {
        "name": "example-client",
        "version": "1.0.0"
      }
    }
  }'
```

The server returns its protocol version, server information, and tool capability.

### 2. Send Initialized Notification

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:18090/mcp" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }'
```

This notification returns HTTP `202` with no response body.

### 3. List Tools

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:18090/mcp" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

The response includes these tool definitions:

- `get_character_profile`
- `list_characters`
- `search_characters`

## Tool: get_character_profile

### Purpose

Returns the personality, speaking tone, and affection information for a character owned by the authenticated user.

### Input

```json
{
  "character_name": "Character Name"
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| `character_name` | string | yes | Exact character name. |

### Output

```json
{
  "user_id": 1,
  "character_id": 12,
  "character_name": "Character Name",
  "personality": "Character personality text...",
  "tone": "Speaking tone text...",
  "affection": {
    "level": 130,
    "label": "普通"
  },
  "updated_at": "2026-07-08 12:34:56"
}
```

Fields:

| Field | Description |
|---|---|
| `user_id` | Owner user ID. |
| `character_id` | Character database ID. |
| `character_name` | Character name. |
| `personality` | Value stored in the character `personality` field. |
| `tone` | Speaking tone extracted from stored tone fields or personality text. |
| `affection` | Character affection information, or `null` when affection is disabled or invalid. |
| `updated_at` | Last character update timestamp. |

### Call Example

```powershell
$body = @{
  jsonrpc = "2.0"
  id = 3
  method = "tools/call"
  params = @{
    name = "get_character_profile"
    arguments = @{
      character_name = "Character Name"
    }
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:18090/mcp" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Successful response:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"user_id\": 1,\n  \"character_id\": 12,\n  \"character_name\": \"Character Name\",\n  \"personality\": \"...\",\n  \"tone\": \"...\",\n  \"affection\": {\n    \"level\": 130,\n    \"label\": \"普通\"\n  },\n  \"updated_at\": \"2026-07-08 12:34:56\"\n}"
      }
    ],
    "structuredContent": {
      "user_id": 1,
      "character_id": 12,
      "character_name": "Character Name",
      "personality": "...",
      "tone": "...",
      "affection": {
        "level": 130,
        "label": "普通"
      },
      "updated_at": "2026-07-08 12:34:56"
    },
    "isError": false
  }
}
```

## Tool: list_characters

### Purpose

Lists lightweight character information for characters owned by the authenticated user. Use this before `get_character_profile` when the exact character name is unknown or ambiguous.

### Input

```json
{}
```

### Output

```json
{
  "characters": [
    {
      "character_id": 12,
      "character_name": "Character Name",
      "affection": {
        "level": 130,
        "label": "普通"
      },
      "summary": "Short tone/personality preview...",
      "updated_at": "2026-07-08 12:34:56"
    }
  ]
}
```

`list_characters` intentionally returns a lightweight preview and does not return the full `personality` text.

If the authenticated user has no characters, it returns:

```json
{
  "characters": []
}
```

## Tool: search_characters

### Purpose

Searches characters owned by the authenticated user by exact or partial text in character name, personality, and speaking-tone fields. Use this when the user refers to a character by traits, tone, or an uncertain name.

### Input

```json
{
  "query": "soft voice",
  "limit": 10
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| `query` | string | yes | Keyword to search character names, personality, or speaking tone. |
| `limit` | integer | no | Maximum number of matches. Defaults to 10 and is capped at 25. |

### Output

```json
{
  "query": "soft voice",
  "matches": [
    {
      "character_id": 12,
      "character_name": "Character Name",
      "matched_fields": ["tone"],
      "preview": "soft voice / Short personality preview...",
      "affection": {
        "level": 130,
        "label": "普通"
      },
      "updated_at": "2026-07-08 12:34:56"
    }
  ]
}
```

If there are no matches, it returns an empty `matches` array instead of an error.

```json
{
  "query": "unknown keyword",
  "matches": []
}
```

## Tone Extraction

The server checks the following character data fields first:

- `tone`
- `speech_tone`
- `speech_style`
- `speaking_style`
- `talk_style`
- `voice_style`

If none of those fields are present, the server extracts tone-like lines from `personality`.

The extraction looks for lines containing words such as:

- `口調`
- `話し方`
- `喋り方`
- `しゃべり方`
- `語尾`
- `一人称`
- `二人称`
- `呼び方`
- `tone`
- `speech`
- `speaking`

If no tone information is found, `tone` is returned as an empty string.

## Affection

The server reads affection from character data:

- `affection`: numeric affection level.
- `affection_enabled`: when this is `false`, affection is returned as `null`.

If `affection` is not stored, the server follows the existing NookResonance default and returns:

```json
{
  "level": 130,
  "label": "普通"
}
```

If affection is disabled for the character or the stored value is invalid, the response uses:

```json
"affection": null
```

## Logging

The MCP server logs tool calls through the existing server logger. Logs include the MCP method, tool name, authenticated user ID, requested character name, and success or error result.

Examples:

```text
[MCP] tools/call name=get_character_profile userId=1 characterName="Character Name"
[MCP] get_character_profile success userId=1 characterId=12 characterName="Character Name"
[MCP] get_character_profile error userId=1 characterName="Missing Character" message="Character not found"
[MCP] tools/call name=list_characters userId=1
[MCP] list_characters success userId=1 count=3
[MCP] tools/call name=search_characters userId=1 query="soft voice" limit=10
[MCP] search_characters success userId=1 query="soft voice" count=1
[MCP] search_characters error userId=1 query="" message="query is required"
```

Bearer tokens, passwords, JWT values, and Authorization headers are not logged.

## Error Cases

Tool errors are returned as MCP tool results with `isError: true`.

Common messages:

| Message | Meaning |
|---|---|
| `character_name is required` | `character_name` was not provided. |
| `Character not found` | No character with the exact name exists for the authenticated user. |
| `Multiple characters matched the same name` | More than one character has the same name for the user. Rename one character or make names unique. |
| `query is required` | `search_characters` was called without a non-empty query. |
| `limit is invalid` | `search_characters` received a non-integer or non-positive limit. |
| `Unknown tool: ...` | An undefined MCP tool was requested. |

Authentication failures return normal HTTP `401` JSON responses from the shared NookResonance auth middleware.

## Implementation Files

| File | Role |
|---|---|
| `src/mcp/index.js` | Exports the MCP router factory. |
| `src/mcp/router.js` | Handles MCP JSON-RPC methods and tool calls. |
| `src/mcp/characterProfile.js` | Reads character data and builds the profile response. |
| `src/index.js` | Mounts `/mcp` and `/api/mcp`. |
