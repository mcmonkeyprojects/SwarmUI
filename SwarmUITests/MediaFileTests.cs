using System;
using System.IO;
using NUnit.Framework;
using SwarmUI.Media;

namespace SwarmUITests;

/// <summary>Tests media file parsing and metadata.</summary>
[TestFixture]
public class MediaFileTests : SwarmUITest
{
    /// <summary>Prepares the basics.</summary>
    [OneTimeSetUp]
    public static void PreInit()
    {
        Setup();
    }

    /// <summary>Creates a minimal PCM WAV file.</summary>
    private static byte[] CreateWav()
    {
        using MemoryStream stream = new();
        using BinaryWriter writer = new(stream);
        writer.Write("RIFF"u8);
        writer.Write(38);
        writer.Write("WAVEfmt "u8);
        writer.Write(16);
        writer.Write((short)1);
        writer.Write((short)1);
        writer.Write(8000);
        writer.Write(16000);
        writer.Write((short)2);
        writer.Write((short)16);
        writer.Write("data"u8);
        writer.Write(2);
        writer.Write((short)0);
        return stream.ToArray();
    }

    /// <summary>Tests that the audio media type creates audio files from data URLs.</summary>
    [Test]
    public static void TestAudioDataStringRecognition()
    {
        string data = $"data:audio/wav;base64,{Convert.ToBase64String(CreateWav())}";
        MediaFile file = MediaMetaType.Audio.FromDataString(data);
        Assert.That(file, Is.TypeOf<AudioFile>());
        Assert.That(file.Type, Is.SameAs(MediaType.AudioWav));
    }

    /// <summary>Tests writing and reading Swarm metadata in an audio file.</summary>
    [Test]
    public static void TestAudioMetadata()
    {
        AudioFile original = new(CreateWav(), MediaType.AudioWav);
        const string metadata = "{\"sui_image_params\":{\"prompt\":\"test\"}}";
        AudioFile updated = original.WithMetadata(metadata);
        Assert.That(updated.GetMetadata(), Is.EqualTo(metadata));
        Assert.That(updated.GetSUIMetadata()["prompt"].ToString(), Is.EqualTo("test"));
    }
}
