﻿using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Core;
using SwarmUI.WebAPI;
using System.IO;

namespace SwarmUI.Utils;

/// <summary>Central class for processing wildcard files.</summary>
public class WildcardsHelper
{
    public class Wildcard
    {
        public string Name;

        public string[] Options;

        public string Image;

        public string Raw;

        public long TimeModified;

        public long TimeCreated;

        /// <summary>Max length cache, calculated in T2IParamInput.</summary>
        public string MaxLength = null;

        public JObject GetNetObject(bool dataImgs = true)
        {
            string previewImg = Image ?? "imgs/model_placeholder.jpg";
            if (!dataImgs && previewImg is not null && previewImg.StartsWithFast("data:"))
            {
                previewImg = $"/ViewSpecial/Wildcards/{Name}?editid={ModelsAPI.ModelEditID}";
            }
            return new()
            {
                ["name"] = Name,
                ["options"] = JArray.FromObject(Options),
                ["raw"] = Raw,
                ["image"] = previewImg
            };
        }
    }

    /// <summary>Internal tracker of all currently known wildcard files. Values populate on first read.</summary>
    public static ConcurrentDictionary<string, Wildcard> WildcardFiles = new();

    public static string Folder => Utilities.CombinePathWithAbsolute(Program.DataDir, Program.ServerSettings.Paths.WildcardsFolder);

    /// <summary>Returns a list of all known wildcard files.</summary>
    public static string[] ListFiles => [.. WildcardFiles.Values.Select(w => w.Name)];

    /// <summary>Initializes the engine.</summary>
    public static void Init()
    {
        Refresh();
        Program.ModelRefreshEvent += Refresh;
    }

    /// <summary>Refreshes the wildcard tracker, reloading from folder.</summary>
    public static void Refresh()
    {
        try
        {
            ConcurrentDictionary<string, Wildcard> newWildcards = new();
            Directory.CreateDirectory(Folder);
            foreach (string str in Directory.EnumerateFiles(Folder, "*.txt", SearchOption.AllDirectories))
            {
                string path = Path.GetRelativePath(Folder, str).Replace("\\", "/").TrimStart('/').BeforeLast('.');
                newWildcards.TryAdd(path.ToLowerFast(), new() { Name = path });
            }
            WildcardFiles = newWildcards;
        }
        catch (Exception ex)
        {
            Logs.Error($"Error while refreshing wildcards: {ex.ReadableString()}");
        }
    }

    /// <summary>Gets the wildcard data for the specified exact wildcard name.</summary>
    public static Wildcard GetWildcard(string name)
    {
        if (!WildcardFiles.TryGetValue(name.ToLowerFast(), out Wildcard wildcard))
        {
            return null;
        }
        if (wildcard.Options is null)
        {
            string fname = $"{Folder}/{name}.txt";
            wildcard.TimeCreated = new DateTimeOffset(File.GetCreationTimeUtc(fname)).ToUnixTimeMilliseconds();
            wildcard.TimeModified = new DateTimeOffset(File.GetLastWriteTimeUtc(fname)).ToUnixTimeMilliseconds();
            string rawText = StringConversionHelper.UTF8Encoding.GetString(File.ReadAllBytes(fname)).Replace("\r\n", "\n").Replace("\r", "").Replace("\uFEFF", "");
            wildcard.Raw = rawText;
            wildcard.Options = [.. rawText.Split('\n').Select(card => card.Before('#').Trim()).Where(card => !string.IsNullOrWhiteSpace(card))];
            if (wildcard.Image is null && File.Exists($"{Folder}/{name}.jpg"))
            {
                wildcard.Image = new Image(File.ReadAllBytes($"{Folder}/{name}.jpg"), Image.ImageType.IMAGE, "jpg").AsDataString();
            }
        }
        return wildcard;
    }

    /// <summary>Picks a random entry from the given wildcard name, for the given random provider.</summary>
    /// <param name="name">The exact wildcard name.</param>
    /// <param name="random">The random provider.</param>
    /// <returns>The random value, or null if invalid.</returns>
    public static string PickRandom(string name, Random random)
    {
        Wildcard wildcard = GetWildcard(name);
        if (wildcard is null)
        {
            return null;
        }
        return wildcard.Options[random.Next(wildcard.Options.Length)];
    }
}
