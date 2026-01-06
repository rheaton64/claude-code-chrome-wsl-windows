/**
 * Chrome Native Messaging Protocol Handler
 *
 * Chrome native messaging uses a simple protocol:
 * - Messages are framed with a 4-byte little-endian length prefix
 * - Message content is UTF-8 JSON
 * - Communication via stdin (from Chrome) and stdout (to Chrome)
 */

class NativeMessaging {
  constructor() {
    this.messageHandler = null;
    this.closeHandler = null;
    this.errorHandler = null;
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Set handler for incoming messages from Chrome
   */
  onMessage(handler) {
    this.messageHandler = handler;
  }

  /**
   * Set handler for connection close
   */
  onClose(handler) {
    this.closeHandler = handler;
  }

  /**
   * Set handler for errors
   */
  onError(handler) {
    this.errorHandler = handler;
  }

  /**
   * Start listening for messages from Chrome
   */
  start() {
    // Set stdin to binary mode
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    process.stdin.on('data', (chunk) => {
      this.handleData(chunk);
    });

    process.stdin.on('end', () => {
      if (this.closeHandler) {
        this.closeHandler();
      }
    });

    process.stdin.on('error', (error) => {
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });
  }

  /**
   * Handle incoming data from stdin
   */
  handleData(chunk) {
    // Append new data to buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Process all complete messages in buffer
    while (this.buffer.length >= 4) {
      // Read message length (4 bytes, little-endian)
      const messageLength = this.buffer.readUInt32LE(0);

      // Check if we have the complete message
      if (this.buffer.length < 4 + messageLength) {
        // Wait for more data
        break;
      }

      // Extract the message
      const messageBuffer = this.buffer.slice(4, 4 + messageLength);

      // Remove processed data from buffer
      this.buffer = this.buffer.slice(4 + messageLength);

      // Parse and handle the message
      try {
        const message = JSON.parse(messageBuffer.toString('utf8'));
        if (this.messageHandler) {
          this.messageHandler(message);
        }
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler(new Error(`Failed to parse message: ${error.message}`));
        }
      }
    }
  }

  /**
   * Send a message to Chrome via stdout
   */
  send(message) {
    try {
      const json = JSON.stringify(message);
      const buffer = Buffer.from(json, 'utf8');

      // Check message size (Chrome's limit is 1MB)
      if (buffer.length > 1024 * 1024) {
        throw new Error(`Message too large: ${buffer.length} bytes (max 1MB)`);
      }

      // Create length prefix (4 bytes, little-endian)
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(buffer.length, 0);

      // Write length prefix followed by message
      process.stdout.write(lengthBuffer);
      process.stdout.write(buffer);
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    }
  }
}

module.exports = { NativeMessaging };
