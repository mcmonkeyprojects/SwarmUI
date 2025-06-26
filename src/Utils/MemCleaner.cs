using SwarmUI.Core;
using SwarmUI.WebAPI;

namespace SwarmUI.Utils;

/// <summary>Simple utility class that keeps memory cleared up automatically over time based on user settings.</summary>
public static class MemCleaner
{
    public static long TimeSinceLastGen = 0;

    public static bool HasClearedVRAM = false, HasClearedSysRAM = false;

    public static void TickIsGenerating()
    {
        TimeSinceLastGen = 0;
        HasClearedVRAM = false;
        HasClearedSysRAM = false;
    }

    public static void TickNoGenerations()
    {
        if (TimeSinceLastGen == 0)
        {
            TimeSinceLastGen = Environment.TickCount64;
        }
        else if (Environment.TickCount64 - TimeSinceLastGen > Program.ServerSettings.Backends.ClearVRAMAfterMinutes * 60 * 1000 && !HasClearedVRAM && Program.ServerSettings.Backends.ClearVRAMAfterMinutes >= 0)
        {
            BackendAPI.FreeBackendMemory(null, false).Wait();
            HasClearedVRAM = true;
        }
        else if (Environment.TickCount64 - TimeSinceLastGen > Program.ServerSettings.Backends.ClearSystemRAMAfterMinutes * 60 * 1000 && !HasClearedSysRAM && Program.ServerSettings.Backends.ClearSystemRAMAfterMinutes >= 0)
        {
            BackendAPI.FreeBackendMemory(null, true).Wait();
            HasClearedSysRAM = true;
        }
    }
}
