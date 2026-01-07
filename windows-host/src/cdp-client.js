/**
 * Chrome DevTools Protocol (CDP) Client
 * Connects to Chrome's remote debugging port and executes browser commands
 */

const WebSocket = require('ws');
const http = require('http');

class CDPClient {
  constructor(port = 9222) {
    this.port = port;
    this.ws = null;
    this.messageId = 0;
    this.pendingCommands = new Map();
    this.targetId = null;
    this.sessionId = null;
  }

  // Get list of available targets (tabs) from Chrome
  async getTargets() {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${this.port}/json/list`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse targets: ${e.message}`));
          }
        });
      });
      req.on('error', (e) => reject(new Error(`Failed to connect to Chrome: ${e.message}. Is Chrome running with --remote-debugging-port=${this.port}?`)));
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  // Connect to a specific target (tab)
  async connectToTarget(targetId) {
    const targets = await this.getTargets();
    const target = targetId
      ? targets.find(t => t.id === targetId)
      : targets.find(t => t.type === 'page');

    if (!target) {
      throw new Error('No suitable target found');
    }

    this.targetId = target.id;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(target.webSocketDebuggerUrl);

      this.ws.on('open', () => {
        resolve(target);
      });

      this.ws.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('error', (err) => {
        reject(err);
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.targetId = null;
      });
    });
  }

  handleMessage(message) {
    if (message.id !== undefined && this.pendingCommands.has(message.id)) {
      const { resolve, reject } = this.pendingCommands.get(message.id);
      this.pendingCommands.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  }

  // Send a CDP command
  async send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Chrome');
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.pendingCommands.set(id, { resolve, reject });

      this.ws.send(JSON.stringify({
        id,
        method,
        params
      }));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command ${method} timed out`));
        }
      }, 30000);
    });
  }

  // High-level browser operations

  async getTabsInfo() {
    const targets = await this.getTargets();
    return targets
      .filter(t => t.type === 'page')
      .map(t => ({
        id: t.id,
        title: t.title,
        url: t.url
      }));
  }

  async navigate(url) {
    if (!this.ws) {
      await this.connectToTarget();
    }
    return await this.send('Page.navigate', { url });
  }

  async takeScreenshot(options = {}) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    const result = await this.send('Page.captureScreenshot', {
      format: options.format || 'png',
      quality: options.quality || 80
    });

    return result.data; // base64 encoded image
  }

  async getPageContent() {
    if (!this.ws) {
      await this.connectToTarget();
    }

    const result = await this.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML'
    });

    return result.result.value;
  }

  async executeScript(script) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    const result = await this.send('Runtime.evaluate', {
      expression: script,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }

    return result.result.value;
  }

  async click(x, y) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x, y,
      button: 'left',
      clickCount: 1
    });

    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x, y,
      button: 'left',
      clickCount: 1
    });
  }

  async type(text) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char
      });
    }
  }

  async createTab(url) {
    return new Promise((resolve, reject) => {
      // Chrome's /json/new endpoint requires PUT method
      const endpoint = url
        ? `/json/new?${encodeURIComponent(url)}`
        : `/json/new`;

      const options = {
        hostname: 'localhost',
        port: this.port,
        path: endpoint,
        method: 'PUT'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to create tab: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  async closeTab(targetId) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${this.port}/json/close/${targetId}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { CDPClient };
