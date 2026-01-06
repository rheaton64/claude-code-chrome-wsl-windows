/**
 * WebSocket Client for connecting to Windows Native Host
 */

const WebSocket = require('ws');

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 50;

class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.shouldReconnect = true;
    this.connected = false;

    this.openHandler = null;
    this.messageHandler = null;
    this.closeHandler = null;
    this.errorHandler = null;
  }

  onOpen(handler) {
    this.openHandler = handler;
  }

  onMessage(handler) {
    this.messageHandler = handler;
  }

  onClose(handler) {
    this.closeHandler = handler;
  }

  onError(handler) {
    this.errorHandler = handler;
  }

  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    console.log(`[Bridge] Connecting to Windows host at ${this.url}...`);

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      if (this.openHandler) {
        this.openHandler();
      }
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (this.messageHandler) {
          this.messageHandler(message);
        }
      } catch (error) {
        console.error(`[Bridge] Failed to parse WebSocket message: ${error.message}`);
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      if (this.closeHandler) {
        this.closeHandler();
      }
      this.attemptReconnect();
    });

    this.ws.on('error', (error) => {
      // Suppress ECONNREFUSED from spamming console during reconnection
      if (error.code !== 'ECONNREFUSED') {
        if (this.errorHandler) {
          this.errorHandler(error);
        }
      }
    });
  }

  attemptReconnect() {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Bridge] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
      console.error('[Bridge] Please ensure the Windows host is running and try again');
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);

    if (this.reconnectAttempts === 1) {
      console.log('[Bridge] Windows host not available, waiting for connection...');
    } else if (this.reconnectAttempts % 5 === 0) {
      console.log(`[Bridge] Still waiting for Windows host... (attempt ${this.reconnectAttempts})`);
    }

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  send(message) {
    if (this.isConnected()) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = { WebSocketClient };
