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

The MCP endpoint is authenticated with a dedicated **MCP access key**, not the login JWT.
The normal login JWT (`/api/auth/login`) is **not accepted** on `/mcp` — sending it returns `401`.

### Issuing a key

1. Log in to the web app and open **Settings → MCP Integration**.
2. Enter an optional label (e.g. `Claude Desktop`) and click **Issue Key**.
3. The plaintext key is shown **once**, right after issuance. Copy it now — it cannot be
   displayed again. If you lose it, revoke it and issue a new one.

Each key is scoped to the user who issued it. All MCP requests must include:

```text
Authorization: Bearer nrk_...
```

The authenticated user is resolved from the access key. The tool does not accept `user_id` as
an input, so a user cannot request another user's character profile by changing arguments.

### Managing keys

The same Settings section lists your active keys (label, key prefix, last-used time) and lets
you revoke any of them. Revoking a key takes effect immediately — the next request with that
key returns `401`, indistinguishable from an unknown or expired key.

Key management itself (issue / list / revoke) uses the normal login JWT, via:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/mcp-keys` | List your active keys (no key material returned). |
| POST | `/api/mcp-keys` | Issue a new key. Returns the plaintext key once. |
| DELETE | `/api/mcp-keys/:id` | Revoke a key you own. |

### Expiration

Keys issued from Settings never expire. `POST /api/mcp-keys` also accepts an optional
`expires_in_days`, but **the UI does not expose it** — setting an expiring key currently
requires calling the API directly with your login JWT:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:18090/api/mcp-keys" `
  -Headers @{ Authorization = "Bearer $jwtToken" } `
  -ContentType "application/json" `
  -Body '{"label":"temporary-client","expires_in_days":7}'
```

`GET /api/mcp-keys` lists a key until it is revoked, including keys whose `expires_at` has
already passed — the current UI does not display `expires_at`, so an expired-but-not-revoked
key looks identical to a valid one in the list. This is not a security gap: `/mcp` itself
(`mcpAuthMiddleware`) always checks `expires_at` and returns `401` once a key has expired,
regardless of what the list shows. Revoke keys you no longer need instead of relying on
expiration to hide them from the list.

### Migration note

Access keys replace the previous "copy the JWT as a Bearer header" flow. Existing MCP client
configs that used a JWT stop working after this change and must be updated with a newly issued
access key — there is no JWT fallback.

## MCP Lifecycle

### 1. Initialize

```powershell
$headers = @{ Authorization = "Bearer nrk_..." }  # key issued from Settings > MCP Integration

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
    "label": "普通",
    "cap": 255
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
| `affection.level` | Effective affection level, i.e. the stored value clamped to the character's affection cap (`min(affection, affection_cap)`). |
| `affection.cap` | The character's affection cap (`affection_cap`). `255` when not set (no cap). |
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
        "text": "{\n  \"user_id\": 1,\n  \"character_id\": 12,\n  \"character_name\": \"Character Name\",\n  \"personality\": \"...\",\n  \"tone\": \"...\",\n  \"affection\": {\n    \"level\": 130,\n    \"label\": \"普通\",\n    \"cap\": 255\n  },\n  \"updated_at\": \"2026-07-08 12:34:56\"\n}"
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
        "label": "普通",
        "cap": 255
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
        "label": "普通",
        "cap": 255
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
        "label": "普通",
        "cap": 255
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

- `affection`: numeric affection level (the stored/internal value).
- `affection_enabled`: when this is `false`, affection is returned as `null`.
- `affection_cap`: optional per-character affection cap. When unset, it defaults to `255`
  (unlimited). Value range: `0`–`255`.

If `affection` is not stored, the server follows the existing NookResonance default (`130`)
before applying the cap.

`affection.level` in the response is the **effective** value, i.e. the stored value clamped to
the cap: `min(affection, affection_cap)`. Lowering a character's cap below its current stored
affection does not delete or rewrite the stored value — it only lowers the effective value
reported here (and used by the app's UI and LLM prompts) until the stored value is changed again
or the cap is raised.

```json
{
  "level": 130,
  "label": "普通",
  "cap": 255
}
```

Example: a character with a stored `affection` of `200` and `affection_cap` of `145` returns:

```json
{
  "level": 145,
  "label": "普通",
  "cap": 145
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

Authentication failures return normal HTTP `401` JSON responses (`{"error":"Unauthorized"}`) from
the MCP access key middleware. Missing key, unknown key, revoked key, and expired key are all
indistinguishable `401` responses — the reason is never disclosed.

## Implementation Files

| File | Role |
|---|---|
| `src/mcp/index.js` | Exports the MCP router factory. |
| `src/mcp/router.js` | Handles MCP JSON-RPC methods and tool calls. |
| `src/mcp/characterProfile.js` | Reads character data and builds the profile response. |
| `src/mcpKeys.js` | Issues/lists/revokes access keys and provides the `/mcp` auth middleware. |
| `src/routes/mcpKeys.js` | `/api/mcp-keys` key management API (JWT-authenticated). |
| `src/index.js` | Mounts `/mcp`, `/api/mcp`, and `/api/mcp-keys`. |
