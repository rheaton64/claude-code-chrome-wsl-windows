/**
 * Windows Host for Claude Chrome Bridge
 * Uses Chrome DevTools Protocol (CDP) to control Chrome
 */

const fs = require('fs');
const path = require('path');

const EARLY_LOG = 'C:\\Users\\Tony\\claude-bridge-startup.log';
fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] CDP Host starting, PID: ${process.pid}\n`);

const { WebSocketServer } = require('./websocket-server');
const { CDPClient } = require('./cdp-client');

const WS_PORT = 19222;
const CDP_PORT = 9222;
const LOG_FILE = path.join(process.env.TEMP || 'C:\\Temp', 'claude-chrome-bridge.log');

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [CDP Host] [${level.toUpperCase()}] ${message}`;
  console.error(logLine);
  if (data) console.error(JSON.stringify(data, null, 2));

  try {
    const fileLog = data ? `${logLine}\n${JSON.stringify(data, null, 2)}\n` : `${logLine}\n`;
    fs.appendFileSync(LOG_FILE, fileLog);
  } catch (e) {}
}

class CDPHost {
  constructor() {
    this.wsServer = new WebSocketServer(WS_PORT);
    this.cdp = new CDPClient(CDP_PORT);
    this.wsClient = null;
    this.chromeConnected = false;
  }

  async start() {
    log('info', 'Starting CDP Host...');
    fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] Starting CDP Host\n`);

    // Test Chrome connection
    try {
      const tabs = await this.cdp.getTabsInfo();
      this.chromeConnected = true;
      log('info', `Connected to Chrome, found ${tabs.length} tabs`);
      fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] Chrome connected, ${tabs.length} tabs\n`);
    } catch (e) {
      log('warn', `Chrome not available: ${e.message}`);
      fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] Chrome not available: ${e.message}\n`);
    }

    // Set up WebSocket server for WSL connections
    this.wsServer.onConnection((client) => {
      if (this.wsClient) {
        log('warn', 'Rejecting additional WebSocket client');
        client.close(4000, 'Only one client allowed');
        return;
      }

      this.wsClient = client;
      log('info', 'WSL bridge connected');

      client.onMessage(async (message) => {
        log('debug', 'Received from WSL', { id: message.id, method: message.payload?.method });
        await this.handleToolCall(message);
      });

      client.onClose(() => {
        log('info', 'WSL bridge disconnected');
        this.wsClient = null;
      });

      client.onError((error) => {
        log('error', 'WebSocket client error', { error: error.message });
      });
    });

    this.wsServer.onError((error) => {
      log('error', 'WebSocket server error', { error: error.message });
    });

    this.wsServer.start();
    log('info', `WebSocket server listening on port ${WS_PORT}`);
    fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] WebSocket server started on ${WS_PORT}\n`);
  }

  async handleToolCall(bridgeMessage) {
    const payload = bridgeMessage.payload;
    const toolName = payload?.params?.name || payload?.tool;
    const args = payload?.params?.arguments || payload?.arguments || {};

    log('debug', `Tool call: ${toolName}`, args);

    try {
      let result;

      switch (toolName) {
        case 'tabs_context_mcp':
          result = await this.handleTabsContext(args);
          break;
        case 'tabs_create_mcp':
          result = await this.handleCreateTab(args);
          break;
        case 'navigate':
          result = await this.handleNavigate(args);
          break;
        case 'computer':
          result = await this.handleComputer(args);
          break;
        case 'read_page':
          result = await this.handleReadPage(args);
          break;
        case 'get_page_text':
          result = await this.handleGetPageText(args);
          break;
        case 'javascript_tool':
          result = await this.handleJavaScript(args);
          break;
        case 'find':
          result = await this.handleFind(args);
          break;
        case 'form_input':
          result = await this.handleFormInput(args);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      log('debug', `Tool ${toolName} completed successfully`);
      this.sendResponse(bridgeMessage.id, result);
    } catch (error) {
      log('error', `Tool ${toolName} failed: ${error.message}\n${error.stack}`);
      this.sendError(bridgeMessage.id, error.message);
    }
  }

  async handleTabsContext(args) {
    // Refresh Chrome connection
    try {
      const tabs = await this.cdp.getTabsInfo();
      this.chromeConnected = true;

      if (tabs.length === 0 && args.createIfEmpty) {
        const newTab = await this.cdp.createTab();
        return {
          tabs: [{
            id: newTab.id,
            title: newTab.title || 'New Tab',
            url: newTab.url || 'about:blank'
          }],
          activeTabId: newTab.id
        };
      }

      return {
        tabs: tabs,
        activeTabId: tabs[0]?.id
      };
    } catch (e) {
      this.chromeConnected = false;
      throw new Error(`Chrome not available: ${e.message}. Start Chrome with --remote-debugging-port=9222`);
    }
  }

  async handleCreateTab(args) {
    const tab = await this.cdp.createTab(args.url);
    return { id: tab.id, url: tab.url, title: tab.title };
  }

  async handleNavigate(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    }
    const result = await this.cdp.navigate(args.url);
    return { success: true, frameId: result.frameId };
  }

  async handleComputer(args) {
    const action = args.action;

    switch (action) {
      case 'screenshot':
        if (args.tabId) {
          await this.cdp.connectToTarget(args.tabId);
        } else if (!this.cdp.ws) {
          await this.cdp.connectToTarget();
        }
        const screenshot = await this.cdp.takeScreenshot();
        return {
          type: 'image',
          data: screenshot,
          mediaType: 'image/png'
        };

      case 'left_click':
      case 'click':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.click(args.coordinate[0], args.coordinate[1]);
        return { success: true };

      case 'double_click':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.click(args.coordinate[0], args.coordinate[1]);
        await this.cdp.click(args.coordinate[0], args.coordinate[1]);
        return { success: true };

      case 'type':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.type(args.text);
        return { success: true };

      case 'key':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: args.text
        });
        await this.cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: args.text
        });
        return { success: true };

      case 'scroll':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        const x = args.coordinate?.[0] || 0;
        const y = args.coordinate?.[1] || 0;
        await this.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x, y,
          deltaX: 0,
          deltaY: args.delta || -100
        });
        return { success: true };

      case 'wait':
        await new Promise(resolve => setTimeout(resolve, args.duration || 1000));
        return { success: true };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async handleReadPage(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    // Get accessibility tree
    const result = await this.cdp.send('Accessibility.getFullAXTree');
    return { tree: result.nodes?.slice(0, 100) || [] }; // Limit for size
  }

  async handleGetPageText(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const text = await this.cdp.executeScript('document.body.innerText');
    return { text };
  }

  async handleJavaScript(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const result = await this.cdp.executeScript(args.text);
    return { result };
  }

  async handleFind(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const script = `
      (function() {
        const query = ${JSON.stringify(args.query)};
        const elements = document.querySelectorAll(query);
        return Array.from(elements).slice(0, 10).map((el, i) => ({
          ref: 'element-' + i,
          tag: el.tagName,
          text: el.innerText?.substring(0, 100),
          value: el.value
        }));
      })()
    `;

    const result = await this.cdp.executeScript(script);
    return { elements: result || [] };
  }

  async handleFormInput(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const script = `
      (function() {
        const ref = ${JSON.stringify(args.ref)};
        const value = ${JSON.stringify(args.value)};
        const index = parseInt(ref.replace('element-', ''));
        const elements = document.querySelectorAll('input, textarea, select');
        if (elements[index]) {
          elements[index].value = value;
          elements[index].dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      })()
    `;

    const result = await this.cdp.executeScript(script);
    return { success: result };
  }

  sendResponse(id, result) {
    log('debug', `Sending response for ${id}`, { hasResult: !!result });
    if (!this.wsClient) {
      log('warn', 'No WSL client to send response to');
      return;
    }

    this.wsClient.send({
      id,
      direction: 'from-chrome',
      timestamp: Date.now(),
      payload: {
        requestId: id,
        result
      }
    });
  }

  sendError(id, error) {
    if (!this.wsClient) return;

    this.wsClient.send({
      id,
      direction: 'from-chrome',
      timestamp: Date.now(),
      payload: {
        requestId: id,
        error
      }
    });
  }
}

// Start the host
const host = new CDPHost();
host.start().catch(err => {
  fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] ERROR: ${err.message}\n`);
  console.error('Failed to start:', err);
});

// Keep alive
setInterval(() => {}, 60000);
