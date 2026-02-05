# SwarmUI Desktop App Implementation Details

## Overview

SwarmUI Desktop provides a native Windows wrapper for SwarmUI, displaying the web UI in a native window instead of a browser tab. It's a lightweight WebView2-based application that launches the SwarmUI server and provides desktop-native features.

**Note**: First-time setup (backend, models) is handled by SwarmUI's own web installer - the desktop app just provides the window.

---

## Features

| Feature | Description |
|---------|-------------|
| **Native Window** | Proper Windows app with taskbar icon |
| **Dark Titlebar** | Modern dark appearance via DWM API |
| **System Tray** | Minimize to tray, background operation |
| **Window Persistence** | Remembers size, position, maximized state |
| **Single Instance** | Prevents multiple copies via mutex |
| **Loading Screen** | Splash while server starts |
| **Graceful Shutdown** | Instant window close, server killed reliably |
| **DPI Awareness** | Per-monitor DPI scaling |
| **No Admin Required** | Runs with standard user privileges |

---

## Architecture

```
User runs launch-windows-desktop.bat
              |
              v
    Builds SwarmUI.Desktop.exe (if needed)
              |
              v
    SwarmUI.Desktop.exe starts
              |
              +---> Single instance check (mutex)
              |
              v
    Shows loading screen (dark theme)
              |
              v
    Launches SwarmUI.exe as child process
    (with --launch_mode none)
              |
              v
    Polls http://localhost:7801 until ready
              |
              v
    WebView2 navigates to server URL
              |
              v
    If first run: SwarmUI shows its own /Install page
              |
              v
    User interacts with SwarmUI in native window
              |
              v
    On close: Window hides instantly, server killed
```

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | .NET 8.0 Windows Forms |
| Browser Engine | Microsoft WebView2 (Edge Chromium) |
| Server Communication | HTTP polling |
| Settings Storage | JSON in %LOCALAPPDATA% |

---

## Files

```
src/Desktop/
    SwarmUI.Desktop.csproj   - Project configuration
    Program.cs               - Entry point, single-instance
    MainForm.cs              - Window, tray, WebView2
    app.manifest             - Windows compatibility

launch-windows-desktop.bat   - Build & launch script
```

---

## Key Implementation Details

### Dark Titlebar (DWM API)

```csharp
[DllImport("dwmapi.dll")]
private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

private void ApplyDarkTitlebar()
{
    int darkMode = 1;
    DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));
}
```

### Server Shutdown

```csharp
private void KillServerNow()
{
    serverProcess.Kill(true); // Kill entire process tree
    serverProcess.WaitForExit(1000);
    
    // Fallback with taskkill
    if (!serverProcess.HasExited)
    {
        Process.Start("taskkill", $"/F /T /PID {pid}");
    }
}
```

### Window Settings

Saved to `%LOCALAPPDATA%\SwarmUI\Desktop\window-settings.json`:

```json
{
  "X": 100,
  "Y": 100,
  "Width": 1400,
  "Height": 900,
  "Maximized": false
}
```

---

## Usage

### Quick Start

```bash
launch-windows-desktop.bat
```

### Command Line

```bash
# Local server
SwarmUI.Desktop.exe

# Remote server
SwarmUI.Desktop.exe --url http://192.168.1.100:7801
```

---

## Browser Mode vs Desktop Mode

| Aspect | Browser Mode | Desktop Mode |
|--------|-------------|--------------|
| Launch | `launch-windows.bat` | `launch-windows-desktop.bat` |
| UI appears in | Web browser tab | Native window |
| Taskbar icon | Browser icon | SwarmUI icon |
| Terminal | Visible | Hidden |
| Close | Browser + terminal | Single window |
| System tray | No | Yes |
| Window memory | No | Yes |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Black window | Delete `%LOCALAPPDATA%\SwarmUI\Desktop\WebView2` |
| Wrong window size | Delete `%LOCALAPPDATA%\SwarmUI\Desktop\window-settings.json` |
| Server stays running | Check Task Manager for SwarmUI.exe |
| WebView2 missing | Install from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/) |
