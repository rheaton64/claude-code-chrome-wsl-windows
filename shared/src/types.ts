/**
 * Message direction through the bridge
 */
export type MessageDirection = 'to-chrome' | 'from-chrome';

/**
 * Bridge message envelope for WebSocket communication
 */
export interface BridgeMessage {
  /** Unique message ID for request/response matching */
  id: string;
  /** Direction of message flow */
  direction: MessageDirection;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Original message payload from Claude Code or Chrome */
  payload: unknown;
}

/**
 * Connection status for logging and monitoring
 */
export interface ConnectionStatus {
  chromeConnected: boolean;
  wsClientConnected: boolean;
  unixSocketReady: boolean;
}

/**
 * Log levels for bridge components
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  component: 'windows-host' | 'wsl-bridge';
  message: string;
  timestamp: number;
  data?: unknown;
}
