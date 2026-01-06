# Claude Code WSL-Windows Chrome Bridge - Debug Session Notes

## Date: 2026-01-06

## Project Goal
Enable Claude Code running in WSL to control Chrome running on Windows, bypassing the "Native Host not supported on this platform" error.

## Architecture
```
Claude Code (WSL)
    ↓ MCP protocol (stdio)
MCP Server (WSL: mcp-server.js)
    ↓ WebSocket
Windows Host (Windows: index.js)
    ↓ Native Messaging (stdio)
Chrome Extension (Claude in Chrome)
```

## Key Files

### WSL Side
- `/home/tony/projects/claude-code-chrome-wsl-windows/wsl-bridge/src/mcp-server.js` - MCP server that Claude Code connects to
- `/home/tony/.mcp.json` - MCP server configuration for Claude Code

### Windows Side
- `C:\Users\Tony\projects\claude-chrome-bridge\windows-host\src\index.js` - Main Windows host
- `C:\Users\Tony\projects\claude-chrome-bridge\windows-host\src\native-messaging.js` - Chrome native messaging protocol
- `C:\Users\Tony\projects\claude-chrome-bridge\windows-host\src\websocket-server.js` - WebSocket server for WSL
- `C:\Users\Tony\projects\claude-chrome-bridge\windows-host\run-host.bat` - Batch file to start the host

## Critical Discoveries

### 1. WSL2 Networking
- WSL2 cannot use `127.0.0.1` to reach Windows
- Must use the Windows host IP from `ip route | grep default | awk '{print $3}'`
- Current IP: `172.22.16.1`
- WebSocket server must listen on `0.0.0.0`, not `127.0.0.1`

### 2. Chrome Native Host Registration
Chrome reads native messaging hosts from MULTIPLE locations (priority order):
1. **Registry (TAKES PRECEDENCE)**: `HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\`
2. File system: `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\`

**The original Claude Code native host was registered in the registry at:**
```
HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.anthropic.claude_code_browser_extension
→ C:\Users\Tony\AppData\Roaming\Claude Code\ChromeNativeHost\com.anthropic.claude_code_browser_extension.json
```

**We updated the registry to point to our host:**
```powershell
Set-ItemProperty -Path "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.anthropic.claude_code_browser_extension" -Name "(default)" -Value "C:\Users\Tony\projects\claude-chrome-bridge\windows-host\com.anthropic.claude_code_browser_extension.json"
```

### 3. Native Messaging Behavior
- Chrome SPAWNS the native host when the extension initiates a connection
- Chrome communicates via stdin/stdout with the native host
- When the extension disconnects (or doesn't send anything), stdin closes
- **PROBLEM**: When stdin closes, Node.js process exits even if WebSocket server is running
- **FIX**: Added keep-alive timer with `setInterval()` to prevent process exit

### 4. MCP Server Protocol
The MCP server must handle these methods locally (not forward to Chrome):
- `initialize` - Return server info and capabilities
- `initialized` - Notification, no response needed
- `tools/list` - Return list of browser automation tools
- `tools/call` - Forward to Windows host → Chrome extension
- `ping` - Return empty response

### 5. Extension Behavior
- The Claude in Chrome extension connects via native messaging when clicked
- It may disconnect quickly if it doesn't get expected responses
- The extension expects specific protocol - we don't know the exact format
- **CURRENT STATE**: Extension connects, spawns our host, then disconnects after ~10 seconds

## Current State (as of last test)

### What Works
1. ✅ Registry updated to point to our native host
2. ✅ Chrome spawns our host when extension is clicked
3. ✅ Our host starts successfully
4. ✅ WebSocket server starts on port 19222
5. ✅ MCP server connects to Claude Code

### What Doesn't Work
1. ❌ Process exits after extension disconnects (stdin closes)
2. ❌ Keep-alive timer was just added - needs testing
3. ❌ Chrome extension not staying connected (disconnects after ~10 seconds)
4. ❌ Tool calls fail because Chrome isn't connected

## Log File Locations
- Early startup log: `C:\Users\Tony\claude-bridge-startup.log`
- Detailed log: `%TEMP%\claude-chrome-bridge.log`

## Commands to Debug

### Check if host is running
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue
Get-WmiObject Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId, CommandLine | Format-List
```

### Check if port is listening
```powershell
netstat -an | findstr 19222
```

### Check logs
```powershell
cat C:\Users\Tony\claude-bridge-startup.log
cat $env:TEMP\claude-chrome-bridge.log
```

### Restart Chrome and trigger extension
```powershell
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
# Then open Chrome and click the Claude in Chrome extension icon
```

### Copy updated files from WSL to Windows
```bash
cp /home/tony/projects/claude-code-chrome-wsl-windows/windows-host/src/*.js "/mnt/c/Users/Tony/projects/claude-chrome-bridge/windows-host/src/"
```

## Next Steps to Try

1. **Test keep-alive timer** - Just added, should prevent process exit
2. **If process stays alive but extension disconnects** - We need to figure out what the extension expects
3. **Alternative: Use Chrome DevTools Protocol (CDP)** - Start Chrome with `--remote-debugging-port=9222` and control directly

## MCP Configuration

File: `/home/tony/.mcp.json`
```json
{
  "mcpServers": {
    "claude-in-chrome": {
      "command": "node",
      "args": ["/home/tony/projects/claude-code-chrome-wsl-windows/wsl-bridge/src/mcp-server.js"],
      "env": {
        "WINDOWS_HOST_IP": "172.22.16.1"
      }
    }
  }
}
```

## Key Code Changes Made

### 1. websocket-server.js - Listen on all interfaces
```javascript
host: '0.0.0.0' // Changed from '127.0.0.1'
```

### 2. index.js - Don't shutdown on native messaging close
```javascript
this.nativeMessaging.onClose(() => {
  // DON'T shutdown - keep WebSocket server running for WSL
  // this.shutdown();

  // Keep process alive with an interval timer
  this.keepAliveInterval = setInterval(() => {}, 30000);
});
```

### 3. index.js - Start keep-alive immediately
```javascript
// In start() method, after WebSocket server starts:
this.keepAliveInterval = setInterval(() => {
  // This keeps the event loop alive even if stdin closes
}, 30000);
```

### 4. mcp-server.js - Handle MCP protocol locally
- Handles `initialize`, `initialized`, `tools/list`, `tools/call`, `ping`
- Only `tools/call` is forwarded to Windows host

## Environment Details
- WSL2 on Windows 10/11
- Node.js on both Windows and WSL
- Chrome with "Claude in Chrome" extension (ID: fcoeoabgfenejglbffodgkkbkcdhcgfn)
- Claude Code v2.0.76
