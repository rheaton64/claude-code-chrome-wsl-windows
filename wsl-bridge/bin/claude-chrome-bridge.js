#!/usr/bin/env node

/**
 * Claude Chrome Bridge CLI
 *
 * Start the WSL bridge to connect Claude Code with Chrome on Windows
 */

const { WSLBridge } = require('../src/index');

const bridge = new WSLBridge();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Bridge] Shutting down...');
  bridge.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Bridge] Shutting down...');
  bridge.shutdown();
  process.exit(0);
});

// Start the bridge
bridge.start();
