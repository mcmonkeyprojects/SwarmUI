# SwarmUI Desktop

A native Windows desktop wrapper for SwarmUI that displays the web UI in a native window instead of a browser.

## What It Does

- Launches SwarmUI server automatically
- Shows the UI in a native window (WebView2)
- Provides system tray integration
- Remembers window size and position
- Dark titlebar for modern appearance
- Single instance enforcement

**Note**: First-time setup (backend selection, model downloads) is handled by SwarmUI's own web installer - no separate desktop installer needed.

## Quick Start

```bash
# Just run the launcher
launch-windows-desktop.bat
```

That's it! If it's a fresh install, SwarmUI's installer will guide you through setup.

## Features

| Feature | Description |
|---------|-------------|
| Native Window | Proper Windows app with taskbar presence |
| System Tray | Right-click for menu, double-click to restore |
| Window Memory | Remembers size and position |
| Dark Titlebar | Modern dark appearance |
| Single Instance | Only one copy runs at a time |
| Clean Shutdown | Server terminates when you close the window |

## Controls

| Action | Result |
|--------|--------|
| Close (X) | Closes window and stops server |
| Minimize (-) | Minimizes to taskbar |
| Tray double-click | Restore from tray |
| Tray right-click | Show, Minimize to Tray, Exit |

## Command Line

```bash
# Normal launch (local server)
SwarmUI.Desktop.exe

# Connect to remote server
SwarmUI.Desktop.exe --url http://192.168.1.100:7801
```

## Requirements

- Windows 10/11
- .NET 8 Runtime
- WebView2 Runtime (pre-installed on modern Windows)

## Files

| File | Purpose |
|------|---------|
| `Program.cs` | Entry point, single-instance |
| `MainForm.cs` | Window, WebView2, tray |
| `app.manifest` | Windows compatibility |

## Building

```bash
dotnet build src/Desktop/SwarmUI.Desktop.csproj -c Release -o src/bin/live_release_desktop
```
