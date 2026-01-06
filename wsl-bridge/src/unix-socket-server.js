/**
 * Unix Socket Server for Claude Code connections
 *
 * Creates a Unix domain socket that Claude Code connects to,
 * mimicking the socket created by the native Chrome host.
 */

const net = require('net');
const fs = require('fs');

class UnixSocketClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';

    this.messageHandler = null;
    this.closeHandler = null;
    this.errorHandler = null;

    // Handle incoming data
    socket.on('data', (data) => {
      this.handleData(data);
    });

    socket.on('close', () => {
      if (this.closeHandler) {
        this.closeHandler();
      }
    });

    socket.on('error', (error) => {
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });
  }

  handleData(data) {
    // Append new data to buffer
    this.buffer += data.toString();

    // Process complete JSON messages
    // Messages are newline-delimited JSON
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          if (this.messageHandler) {
            this.messageHandler(message);
          }
        } catch (error) {
          console.error(`[Bridge] Failed to parse Unix socket message: ${error.message}`);
        }
      }
    }
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
    const json = JSON.stringify(message);
    this.socket.write(json + '\n');
  }

  close() {
    this.socket.end();
  }
}

class UnixSocketServer {
  constructor(socketPath) {
    this.socketPath = socketPath;
    this.server = null;

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
    // Remove existing socket file if it exists
    if (fs.existsSync(this.socketPath)) {
      console.log(`[Bridge] Removing stale socket: ${this.socketPath}`);
      fs.unlinkSync(this.socketPath);
    }

    this.server = net.createServer((socket) => {
      const client = new UnixSocketClient(socket);
      if (this.connectionHandler) {
        this.connectionHandler(client);
      }
    });

    this.server.on('error', (error) => {
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });

    this.server.listen(this.socketPath, () => {
      console.log(`[Bridge] Unix socket created at ${this.socketPath}`);

      // Make socket accessible
      try {
        fs.chmodSync(this.socketPath, 0o777);
      } catch (e) {
        // Ignore chmod errors
      }
    });
  }

  close() {
    if (this.server) {
      this.server.close();
    }

    // Clean up socket file
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

module.exports = { UnixSocketServer, UnixSocketClient };
