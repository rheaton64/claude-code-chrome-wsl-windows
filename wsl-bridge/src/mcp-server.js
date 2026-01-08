#!/usr/bin/env node

/**
 * MCP Server for Claude Chrome Bridge
 *
 * This is a stdio-based MCP server that Claude Code can connect to.
 * It provides browser automation tools by forwarding to the Windows Chrome extension.
 */

const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');

const WS_PORT = 19222;

// Get Windows host IP
function getWindowsHostIP() {
  if (process.env.WINDOWS_HOST_IP) {
    return process.env.WINDOWS_HOST_IP;
  }

  // Try default gateway first (more reliable for WSL2)
  try {
    const { execSync } = require('child_process');
    const route = execSync('ip route | grep default', { encoding: 'utf8' });
    const match = route.match(/via\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch (e) {
    // Ignore
  }

  // Fallback to resolv.conf
  try {
    const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const match = resolv.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch (e) {
    // Ignore
  }

  return '127.0.0.1';
}

const WS_HOST = getWindowsHostIP();
const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

// Logging to stderr (stdout is for MCP protocol)
function log(message) {
  console.error(`[MCP Bridge] ${message}`);
}

// Browser automation tools that we expose
const BROWSER_TOOLS = [
  {
    name: 'computer',
    description: 'Control the browser with mouse and keyboard actions, take screenshots',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['screenshot', 'left_click', 'right_click', 'type', 'key', 'scroll', 'wait', 'double_click', 'triple_click'],
          description: 'The action to perform'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description: 'x, y coordinates for click actions'
        },
        text: {
          type: 'string',
          description: 'Text to type or key to press'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to perform action on'
        }
      },
      required: ['action', 'tabId']
    }
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL in the browser',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        tabId: { type: 'number', description: 'Tab ID to navigate' }
      },
      required: ['url', 'tabId']
    }
  },
  {
    name: 'read_page',
    description: 'Get accessibility tree of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to read' }
      },
      required: ['tabId']
    }
  },
  {
    name: 'tabs_context_mcp',
    description: 'Get information about browser tabs',
    inputSchema: {
      type: 'object',
      properties: {
        createIfEmpty: { type: 'boolean', description: 'Create tab if none exists' }
      }
    }
  },
  {
    name: 'tabs_create_mcp',
    description: 'Create a new browser tab',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'find',
    description: 'Find elements on the page',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to find' },
        tabId: { type: 'number', description: 'Tab ID to search' }
      },
      required: ['query', 'tabId']
    }
  },
  {
    name: 'form_input',
    description: 'Fill form fields',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Element reference' },
        value: { type: 'string', description: 'Value to set' },
        tabId: { type: 'number', description: 'Tab ID' }
      },
      required: ['ref', 'value', 'tabId']
    }
  },
  {
    name: 'get_page_text',
    description: 'Extract text content from page',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' }
      },
      required: ['tabId']
    }
  },
  {
    name: 'javascript_tool',
    description: 'Execute JavaScript in page context',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', const: 'javascript_exec' },
        text: { type: 'string', description: 'JavaScript code' },
        tabId: { type: 'number', description: 'Tab ID' }
      },
      required: ['action', 'text', 'tabId']
    }
  },
  {
    name: 'console_logs',
    description: 'Read browser console output (log, warn, error, info)',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        limit: { type: 'number', description: 'Max entries to return (default 50)' },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['log', 'warn', 'error', 'info'] },
          description: 'Filter by log type (default all)'
        },
        clear: { type: 'boolean', description: 'Clear buffer after reading (default false)' },
        since: { type: 'string', description: 'ISO timestamp - only return logs after this time' }
      },
      required: ['tabId']
    }
  }
];

// MCP Protocol handler
class MCPServer {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.requestId = 0;
  }

  async start() {
    log(`Connecting to Windows host at ${WS_URL}...`);

    try {
      await this.connectWebSocket();
    } catch (e) {
      log(`Warning: Could not connect to Windows host: ${e.message}`);
      log('Will respond to MCP requests but browser tools will fail');
    }

    this.setupStdio();
    log('MCP Server ready');
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        log('Connected to Windows host');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleWebSocketMessage(data);
      });

      this.ws.on('close', () => {
        this.connected = false;
        log('Disconnected from Windows host');
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        if (!this.connected) {
          reject(error);
        }
      });
    });
  }

  setupStdio() {
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    process.stdin.on('end', () => {
      log('stdin closed, shutting down');
      process.exit(0);
    });
  }

  processBuffer() {
    // MCP uses newline-delimited JSON
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMCPMessage(message);
        } catch (e) {
          log(`Failed to parse MCP message: ${e.message}`);
        }
      }
    }
  }

  handleMCPMessage(message) {
    const method = message.method;
    log(`MCP request: ${method} (id: ${message.id})`);

    // Handle MCP protocol messages locally
    switch (method) {
      case 'initialize':
        this.handleInitialize(message);
        break;
      case 'initialized':
        // Notification, no response needed
        log('Client initialized');
        break;
      case 'tools/list':
        this.handleToolsList(message);
        break;
      case 'tools/call':
        this.handleToolCall(message);
        break;
      case 'ping':
        this.sendResponse(message.id, {});
        break;
      default:
        log(`Unknown method: ${method}`);
        this.sendError(message.id, -32601, `Method not found: ${method}`);
    }
  }

  handleInitialize(message) {
    log('Handling initialize request');
    this.sendResponse(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'claude-in-chrome-bridge',
        version: '1.0.0'
      }
    });
  }

  handleToolsList(message) {
    log('Handling tools/list request');
    this.sendResponse(message.id, {
      tools: BROWSER_TOOLS
    });
  }

  async handleToolCall(message) {
    const toolName = message.params?.name;
    const args = message.params?.arguments || {};

    log(`Tool call: ${toolName}`);

    // Try to reconnect if not connected
    if (!this.connected || !this.ws || this.ws.readyState !== 1) {
      log('Not connected, attempting to reconnect...');
      try {
        await this.connectWebSocket();
      } catch (e) {
        log(`Reconnection failed: ${e.message}`);
        this.sendError(message.id, -32000, 'Not connected to Chrome extension. Make sure the Windows host is running (click Claude in Chrome extension).');
        return;
      }
    }

    // Store pending request for response matching
    this.pendingRequests.set(message.id, { originalId: message.id });

    // Forward to Windows host / Chrome extension
    // Use MCP-style JSON-RPC format that Chrome extension expects
    const bridgeMessage = {
      id: String(message.id),
      direction: 'to-chrome',
      timestamp: Date.now(),
      payload: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        },
        id: message.id
      }
    };

    log(`Sending to Windows: ${JSON.stringify(bridgeMessage.payload)}`);
    this.ws.send(JSON.stringify(bridgeMessage));
  }

  handleWebSocketMessage(data) {
    try {
      const bridgeMessage = JSON.parse(data.toString());
      log(`Received from Windows: ${JSON.stringify(bridgeMessage).substring(0, 200)}`);

      if (bridgeMessage.direction === 'from-chrome' && bridgeMessage.payload) {
        const payload = bridgeMessage.payload;

        // Check if this is a response to a pending request
        // Handle both string and number requestId (type coercion)
        const reqId = payload.requestId;
        const numReqId = typeof reqId === 'string' ? parseInt(reqId, 10) : reqId;

        if (reqId && (this.pendingRequests.has(reqId) || this.pendingRequests.has(numReqId))) {
          const actualKey = this.pendingRequests.has(reqId) ? reqId : numReqId;
          this.pendingRequests.delete(actualKey);

          if (payload.error) {
            this.sendError(payload.requestId, -32000, payload.error);
          } else if (payload.result?.type === 'image') {
            // Handle image responses (screenshots) as proper MCP image blocks
            this.sendResponse(payload.requestId, {
              content: [
                {
                  type: 'image',
                  data: payload.result.data,
                  mimeType: payload.result.mediaType
                }
              ]
            });
          } else {
            this.sendResponse(payload.requestId, {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(payload.result || payload)
                }
              ]
            });
          }
        }
      }
    } catch (e) {
      log(`Failed to parse WebSocket message: ${e.message}`);
    }
  }

  sendResponse(id, result) {
    const response = {
      jsonrpc: '2.0',
      id: id,
      result: result
    };
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  }

  sendError(id, code, message) {
    const response = {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: code,
        message: message
      }
    };
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  }
}

// Start the server
const server = new MCPServer();
server.start().catch((error) => {
  log(`Failed to start: ${error.message}`);
  process.exit(1);
});
