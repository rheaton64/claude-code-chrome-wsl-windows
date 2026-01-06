/**
 * WSL Bridge for Claude Chrome Bridge
 *
 * This runs in WSL and bridges:
 * - Windows Native Host (via WebSocket)
 * - Claude Code (via Unix socket)
 */

const os = require('os');
const fs = require('fs');
const { WebSocketClient } = require('./websocket-client');
const { UnixSocketServer } = require('./unix-socket-server');

const WS_PORT = 19222;

// In WSL2, we need to connect to the Windows host IP, not localhost
function getWindowsHostIP() {
  // Check for environment variable override
  if (process.env.WINDOWS_HOST_IP) {
    return process.env.WINDOWS_HOST_IP;
  }

  // Try to get Windows host IP from /etc/resolv.conf (WSL2)
  try {
    const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const match = resolv.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch (e) {
    // Ignore errors
  }

  // Fallback to localhost (works in WSL1 or if port forwarding is set up)
  return '127.0.0.1';
}

const WS_HOST = getWindowsHostIP();

// Get socket path
function getSocketPath() {
  const username = os.userInfo().username;
  return `/tmp/claude-mcp-browser-bridge-${username}`;
}

class WSLBridge {
  constructor() {
    this.socketPath = getSocketPath();
    this.wsClient = new WebSocketClient(`ws://${WS_HOST}:${WS_PORT}`);
    this.unixServer = new UnixSocketServer(this.socketPath);
    this.claudeClient = null;
  }

  start() {
    console.log('[Bridge] Starting WSL Bridge for Claude Chrome...');
    console.log(`[Bridge] WebSocket target: ws://${WS_HOST}:${WS_PORT}`);
    console.log(`[Bridge] Unix socket: ${this.socketPath}`);
    console.log('');

    // Set up WebSocket client handlers
    this.wsClient.onOpen(() => {
      console.log('[Bridge] Connected to Windows host');
    });

    this.wsClient.onMessage((message) => {
      this.forwardToClaudeCode(message);
    });

    this.wsClient.onClose(() => {
      console.log('[Bridge] Disconnected from Windows host');
    });

    this.wsClient.onError((error) => {
      console.error(`[Bridge] WebSocket error: ${error.message}`);
    });

    // Set up Unix socket server handlers
    this.unixServer.onConnection((client) => {
      if (this.claudeClient) {
        console.log('[Bridge] Warning: New Claude Code connection replacing existing one');
        this.claudeClient.close();
      }

      this.claudeClient = client;
      console.log('[Bridge] Claude Code connected');

      client.onMessage((message) => {
        this.forwardToWindows(message);
      });

      client.onClose(() => {
        console.log('[Bridge] Claude Code disconnected');
        this.claudeClient = null;
      });

      client.onError((error) => {
        console.error(`[Bridge] Unix socket client error: ${error.message}`);
      });
    });

    this.unixServer.onError((error) => {
      console.error(`[Bridge] Unix socket server error: ${error.message}`);
    });

    // Start components
    this.wsClient.connect();
    this.unixServer.start();

    console.log('[Bridge] Ready for Claude Code connections...');
    console.log('[Bridge] Press Ctrl+C to stop');
    console.log('');
  }

  forwardToWindows(message) {
    if (!this.wsClient.isConnected()) {
      console.warn('[Bridge] Cannot forward to Windows: not connected');
      return;
    }

    const bridgeMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      direction: 'to-chrome',
      timestamp: Date.now(),
      payload: message
    };

    this.wsClient.send(bridgeMessage);
  }

  forwardToClaudeCode(bridgeMessage) {
    if (!this.claudeClient) {
      console.warn('[Bridge] Cannot forward to Claude Code: not connected');
      return;
    }

    if (bridgeMessage.direction !== 'from-chrome') {
      console.warn(`[Bridge] Received message with unexpected direction: ${bridgeMessage.direction}`);
      return;
    }

    this.claudeClient.send(bridgeMessage.payload);
  }

  shutdown() {
    this.wsClient.close();
    this.unixServer.close();
  }
}

module.exports = { WSLBridge };
