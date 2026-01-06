/**
 * Protocol constants for Claude Chrome Bridge
 */

/** WebSocket server port */
export const WS_PORT = 19222;

/** WebSocket server host (localhost for security) */
export const WS_HOST = '127.0.0.1';

/** Full WebSocket URL */
export const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

/** Chrome native messaging host identifier */
export const NATIVE_HOST_NAME = 'com.anthropic.claude_code_browser_extension';

/** Unix socket path template (replace {username} with actual username) */
export const UNIX_SOCKET_PATH_TEMPLATE = '/tmp/claude-mcp-browser-bridge-{username}';

/** Maximum message size (Chrome's limit is 1MB) */
export const MAX_MESSAGE_SIZE = 1024 * 1024; // 1 MB

/** WebSocket reconnection delay in ms */
export const WS_RECONNECT_DELAY = 1000;

/** WebSocket max reconnection attempts */
export const WS_MAX_RECONNECT_ATTEMPTS = 10;

/** Heartbeat interval for connection health checks */
export const HEARTBEAT_INTERVAL = 30000; // 30 seconds

/**
 * Get the Unix socket path for a given username
 */
export function getUnixSocketPath(username: string): string {
  return UNIX_SOCKET_PATH_TEMPLATE.replace('{username}', username);
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
