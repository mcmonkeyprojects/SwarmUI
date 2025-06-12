using Hardware.Info;
using System.Diagnostics;

namespace SwarmUI.Utils;

/// <summary>Utility to monitor system usage.</summary>
public static class SystemStatusMonitor
{
    /// <summary>The current process.</summary>
    public static Process SelfProc = Process.GetCurrentProcess();

    /// <summary>Last estimated process usage.</summary>
    public static double ProcessCPUUsage = 0;

    /// <summary>Tracker for CPU processor usage</summary>
    public static long LastProcessorTime = 0;

    /// <summary>Last time this monitor was ticked.</summary>
    public static long LastTick = Environment.TickCount64;

    /// <summary>General hardware info provider.</summary>
    public static HardwareInfo HardwareInfo = new();

    /// <summary>Semaphore to prevent the monitor tick firing off overlapping.</summary>
    public static SemaphoreSlim DeDuplicator = new(1, 1);

    /// <summary>How many recent hardware info reports to store in the <see cref="HardwareInfoQueue"/>.</summary>
    public static int QueueSize = 10;

    /// <summary>Holds recent hardware info reports for the last <see cref="QueueSize"/> seconds.</summary>
    public static ConcurrentQueue<HardwareInfo> HardwareInfoQueue = new();

    /// <summary>Updates system status.</summary>
    public static void Tick()
    {
        Task.Run(() =>
        {
            if (DeDuplicator.CurrentCount == 0)
            {
                return;
            }
            DeDuplicator.Wait();
            try
            {
                long newProcessorTime = SelfProc.TotalProcessorTime.Milliseconds;
                long newTick = Environment.TickCount64;
                ProcessCPUUsage = Math.Max(0, (newProcessorTime - LastProcessorTime) / (double)(newTick - LastTick));
                LastProcessorTime = newProcessorTime;
                LastTick = newTick;
                HardwareInfo newInfo = new();
                newInfo.RefreshMemoryStatus();
                HardwareInfo = newInfo;
                HardwareInfoQueue.Enqueue(newInfo);
                if (HardwareInfoQueue.Count > QueueSize)
                {
                    HardwareInfoQueue.TryDequeue(out _);
                }
            }
            catch (Exception ex)
            {
                Logs.Error($"SystemStatusMonitor.Tick: {ex.ReadableString()}");
            }
            finally
            {
                DeDuplicator.Release();
            }
        });
    }
}
