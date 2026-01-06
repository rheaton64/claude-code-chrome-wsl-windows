# Architecture & Implementation Details

## Overview

This document describes the technical architecture of the Claude Code WSL-Windows Chrome Bridge.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WINDOWS                                         │
│                                                                              │
│  ┌──────────────┐   stdio/JSON   ┌──────────────────────────────────────┐   │
│  │    Chrome    │◄──────────────►│      Windows Native Host             │   │
│  │  Extension   │                │      (Node.js)                       │   │
│  │ (unmodified) │                │                                      │   │
│  └──────────────┘                │  - Registered with Chrome            │   │
│                                  │  - WebSocket server on localhost:19222│   │
│                                  └──────────────────────────────────────┘   │
│                                                    ▲                         │
│                                                    │ WebSocket               │
└────────────────────────────────────────────────────│─────────────────────────┘
                                                     │
┌────────────────────────────────────────────────────│─────────────────────────┐
│                               WSL                  │                         │
│                                                    ▼                         │
│  ┌─────────────────┐         ┌─────────────────────────────────────────┐    │
│  │   Claude Code   │◄───────►│           WSL Bridge                    │    │
│  │   (unmodified)  │  Unix   │           (Node.js)                     │    │
│  │                 │  Socket │                                         │    │
│  └─────────────────┘         │  - WebSocket client to Windows          │    │
│                              │  - Creates Unix socket at:              │    │
│                              │    /tmp/claude-mcp-browser-bridge-{user}│    │
│                              └─────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Windows Native Host (`windows-host/`)

**Purpose:** Register with Chrome as native messaging host, bridge to WebSocket

**Files:**
- `windows-host/src/index.js` - Main entry point
- `windows-host/src/native-messaging.js` - Chrome native messaging stdio protocol
- `windows-host/src/websocket-server.js` - WebSocket server for WSL connections
- `windows-host/package.json` - Dependencies
- `windows-host/manifest.json` - Chrome native messaging host manifest template

**Key responsibilities:**
1. Read/write Chrome native messaging format (4-byte length prefix + JSON)
2. Start WebSocket server on `localhost:19222`
3. Relay messages bidirectionally: Chrome ↔ WebSocket
4. Handle connection lifecycle (Chrome spawn, WSL connect/disconnect)

**Installation script:** `windows-host/install.ps1`
- Copy files to appropriate location
- Register native messaging host with Chrome
- Create manifest at `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\com.anthropic.claude_code_browser_extension.json`

### 2. WSL Bridge (`wsl-bridge/`)

**Purpose:** Connect to Windows, create Unix socket Claude Code expects

**Files:**
- `wsl-bridge/src/index.js` - Main entry point
- `wsl-bridge/src/websocket-client.js` - Connect to Windows host
- `wsl-bridge/src/unix-socket-server.js` - Create socket for Claude Code
- `wsl-bridge/package.json` - Dependencies

**Key responsibilities:**
1. Connect to Windows WebSocket server at `localhost:19222`
2. Create Unix socket at `/tmp/claude-mcp-browser-bridge-{username}`
3. Relay messages: WebSocket ↔ Unix socket
4. Handle reconnection if Windows host restarts

### 3. Shared Types (`shared/`)

**Purpose:** Common TypeScript types and message definitions

**Files:**
- `shared/src/types.ts` - Shared TypeScript types
- `shared/src/protocol.ts` - Protocol constants

## Message Flow

### Startup Sequence

```
1. User installs Windows Native Host (one-time)
2. User starts WSL Bridge: `claude-chrome-bridge`
3. WSL Bridge connects to Windows via WebSocket
4. User starts Claude Code: `claude` (no --chrome flag needed!)
5. Claude Code connects to Unix socket
6. Ready for browser automation
```

### Message Relay

```
Claude Code → Unix Socket → WSL Bridge → WebSocket → Windows Host → Chrome Extension
Chrome Extension → Windows Host → WebSocket → WSL Bridge → Unix Socket → Claude Code
```

## Protocol Specifications

### Chrome Native Messaging Protocol

Chrome native messaging uses a simple framing protocol:

```
┌──────────────────┬─────────────────────────────────┐
│  4 bytes         │  N bytes                        │
│  (little-endian  │  (UTF-8 JSON message)           │
│   uint32 length) │                                 │
└──────────────────┴─────────────────────────────────┘
```

**Message size limit:** 1 MB per message (Chrome limitation)

**Lifecycle:**
1. Chrome spawns native host process when extension connects
2. Communication via stdin (Chrome→Host) and stdout (Host→Chrome)
3. Process terminates when extension disconnects or Chrome closes

**Implementation:**

```javascript
// Reading from Chrome (stdin)
function readMessage(stdin) {
  const lengthBuffer = stdin.read(4);
  const length = lengthBuffer.readUInt32LE(0);
  const messageBuffer = stdin.read(length);
  return JSON.parse(messageBuffer.toString('utf8'));
}

// Writing to Chrome (stdout)
function writeMessage(stdout, message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(buffer.length, 0);
  stdout.write(lengthBuffer);
  stdout.write(buffer);
}
```

### WebSocket Protocol

Simple JSON envelope over WebSocket:

```typescript
interface BridgeMessage {
  id: string;           // Unique message ID for request/response matching
  direction: 'to-chrome' | 'from-chrome';
  timestamp: number;    // Unix timestamp
  payload: any;         // Original message from Claude Code or Chrome
}
```

**Port:** `19222` (chosen to be similar to Chrome DevTools port 9222)

**Connection flow:**
1. Windows host starts WebSocket server on startup
2. WSL bridge connects when started
3. Single client connection (reject additional clients)
4. Automatic reconnection on disconnect

### Unix Socket Protocol

Match exactly what Claude Code expects:

**Socket path:** `/tmp/claude-mcp-browser-bridge-{username}`

**Message format:** Same JSON messages that would normally flow between Claude Code and the native host - we just relay them transparently.

## Error Handling Strategy

| Error | Handling |
|-------|----------|
| Chrome closes | WebSocket stays open, queue messages, notify WSL |
| WSL bridge disconnects | Windows host keeps running, waits for reconnection |
| Message too large | Reject with error, don't crash |
| Invalid JSON | Log error, skip message, continue |
| Socket already exists | Remove stale socket, create new one |

## Logging

Both components should log to help debugging:

```
[Windows Host] Chrome connected
[Windows Host] WebSocket client connected from WSL
[Windows Host] Relaying message: screenshot (id: abc123)
[WSL Bridge] Connected to Windows host
[WSL Bridge] Claude Code connected
[WSL Bridge] Relaying message: screenshot response (id: abc123)
```

Environment variable `DEBUG=claude-bridge:*` for verbose logging.

## Dependencies

### Windows Host
- `ws` - WebSocket server

### WSL Bridge
- `ws` - WebSocket client

### Shared
- TypeScript types only (no runtime deps)

## Implementation Phases

### Phase 1: Core Protocol
1. Implement Chrome native messaging protocol (4-byte length + JSON)
2. Implement WebSocket server/client
3. Implement Unix socket server
4. Basic message relay without modification

### Phase 2: Windows Native Host
1. Create Node.js native host executable
2. Handle Chrome spawn lifecycle
3. WebSocket server with single client support
4. Installation PowerShell script
5. Native messaging host manifest generation

### Phase 3: WSL Bridge
1. WebSocket client with reconnection
2. Unix socket server
3. Message relay logic
4. CLI entry point with status output

### Phase 4: Testing & Polish
1. End-to-end testing with real Chrome extension
2. Error handling and logging
3. Graceful shutdown handling
4. Documentation and README

## Files Checklist

### Phase 1: Project Setup
- [ ] `package.json` - Monorepo root with workspaces
- [ ] `README.md` - User documentation
- [ ] `.gitignore`
- [ ] `shared/package.json`
- [ ] `shared/src/types.ts` - Shared TypeScript types
- [ ] `shared/src/protocol.ts` - Protocol constants

### Phase 2: Windows Native Host
- [ ] `windows-host/package.json`
- [ ] `windows-host/src/index.js` - Entry point
- [ ] `windows-host/src/native-messaging.js` - Chrome protocol handler
- [ ] `windows-host/src/websocket-server.js` - WebSocket server
- [ ] `windows-host/manifest.template.json` - Native messaging manifest
- [ ] `windows-host/install.ps1` - Installation script

### Phase 3: WSL Bridge
- [ ] `wsl-bridge/package.json`
- [ ] `wsl-bridge/src/index.js` - Entry point
- [ ] `wsl-bridge/src/websocket-client.js` - Connect to Windows
- [ ] `wsl-bridge/src/unix-socket-server.js` - Socket for Claude Code
- [ ] `wsl-bridge/bin/claude-chrome-bridge.js` - CLI entry point

### Phase 4: Testing & Polish
- [ ] End-to-end manual testing
- [ ] Error handling improvements
- [ ] Documentation finalization

## Success Criteria

1. Claude Code in WSL can use all `mcp__claude-in-chrome__*` tools
2. No modification to Claude Code or Chrome extension required
3. Simple installation process for both components
4. Reliable message relay with proper error handling
