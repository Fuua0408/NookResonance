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
$userId = $login.user.id
```

All MCP requests must include:

```text
Authorization: Bearer <token>
```

In the web app, open Settings and use the MCP Integration section to copy:

- User ID
- Endpoint URL
- Authorization header

The `user_id` passed to the tool must match the authenticated user ID in the JWT. A user cannot read another user's character profile.

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

The response includes the `get_character_profile` tool definition.

## Tool: get_character_profile

### Purpose

Returns the personality and speaking tone for a character owned by the authenticated user.

### Input

```json
{
  "user_id": 1,
  "character_name": "Character Name"
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| `user_id` | integer or string | yes | Authenticated NookResonance user ID. |
| `character_name` | string | yes | Exact character name. |

### Output

```json
{
  "user_id": 1,
  "character_id": 12,
  "character_name": "Character Name",
  "personality": "Character personality text...",
  "tone": "Speaking tone text...",
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
      user_id = $userId
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
        "text": "{\n  \"user_id\": 1,\n  \"character_id\": 12,\n  \"character_name\": \"Character Name\",\n  \"personality\": \"...\",\n  \"tone\": \"...\",\n  \"updated_at\": \"2026-07-08 12:34:56\"\n}"
      }
    ],
    "structuredContent": {
      "user_id": 1,
      "character_id": 12,
      "character_name": "Character Name",
      "personality": "...",
      "tone": "...",
      "updated_at": "2026-07-08 12:34:56"
    },
    "isError": false
  }
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

## Error Cases

Tool errors are returned as MCP tool results with `isError: true`.

Common messages:

| Message | Meaning |
|---|---|
| `user_id is required` | `user_id` was not provided. |
| `character_name is required` | `character_name` was not provided. |
| `Authenticated user does not match user_id` | The JWT user and requested user ID differ. |
| `Character not found` | No character with the exact name exists for the authenticated user. |
| `Multiple characters matched the same name` | More than one character has the same name for the user. Rename one character or make names unique. |
| `Unknown tool: ...` | A tool other than `get_character_profile` was requested. |

Authentication failures return normal HTTP `401` JSON responses from the shared NookResonance auth middleware.

## Implementation Files

| File | Role |
|---|---|
| `src/mcp/index.js` | Exports the MCP router factory. |
| `src/mcp/router.js` | Handles MCP JSON-RPC methods and tool calls. |
| `src/mcp/characterProfile.js` | Reads character data and builds the profile response. |
| `src/index.js` | Mounts `/mcp` and `/api/mcp`. |
