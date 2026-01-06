/**
 * WebSocket Server for WSL Bridge connections
 */

const WebSocket = require('ws');

class WSClient {
  constructor(ws) {
    this.ws = ws;
    this.messageHandler = null;
    this.closeHandler = null;
    this.errorHandler = null;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (this.messageHandler) {
          this.messageHandler(message);
        }
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler(new Error(`Failed to parse WebSocket message: ${error.message}`));
        }
      }
    });

    ws.on('close', () => {
      if (this.closeHandler) {
        this.closeHandler();
      }
    });

    ws.on('error', (error) => {
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });
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

  send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(code, reason) {
    this.ws.close(code, reason);
  }
}

class WebSocketServer {
  constructor(port) {
    this.port = port;
    this.wss = null;
    this.connectionHandler = null;
    this.errorHandler = null;
  }

  onConnection(handler) {
    this.connectionHandler = handler;
  }

  onError(handler) {
    this.errorHandler = handler;
  }

  start() {
    this.wss = new WebSocket.Server({
      port: this.port,
      host: '0.0.0.0' // Listen on all interfaces (needed for WSL2 connections)
    });

    this.wss.on('connection', (ws, req) => {
      const client = new WSClient(ws);
      if (this.connectionHandler) {
        this.connectionHandler(client);
      }
    });

    this.wss.on('error', (error) => {
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });
  }

  close() {
    if (this.wss) {
      this.wss.close();
    }
  }
}

module.exports = { WebSocketServer, WSClient };
