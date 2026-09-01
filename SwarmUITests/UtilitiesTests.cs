using NUnit.Framework;
using SwarmUI.Utils;

namespace SwarmUITests;

/// <summary>Tests <see cref="Utilities"/>.</summary>
[TestFixture]
public class UtilitiesTests : SwarmUITest
{
    /// <summary>Prepares the basics.</summary>
    [OneTimeSetUp]
    public static void PreInit()
    {
        Setup();
    }

    /// <summary>Tests <see cref="Utilities.StrictFilenameClean(string)"/>.</summary>
    [Test]
    public static void TestStrictFilenameClean()
    {
        Assert.That(Utilities.StrictFilenameClean("hello") == "hello");
        Assert.That(Utilities.StrictFilenameClean("My File") == "My File");
        Assert.That(Utilities.StrictFilenameClean("abc123") == "abc123");
        Assert.That(Utilities.StrictFilenameClean("foo-bar_baz") == "foo-bar_baz");
        Assert.That(Utilities.StrictFilenameClean("") == "");
        Assert.That(Utilities.StrictFilenameClean("file.txt") == "filetxt");
        Assert.That(Utilities.StrictFilenameClean("...") == "");
        Assert.That(Utilities.StrictFilenameClean("folder/sub/file") == "folder/sub/file");
        Assert.That(Utilities.StrictFilenameClean("folder\\sub\\file") == "folder/sub/file");
        Assert.That(Utilities.StrictFilenameClean("/leading/slash") == "leading/slash");
        Assert.That(Utilities.StrictFilenameClean("foo//bar///baz") == "foo/bar/baz");
        Assert.That(Utilities.StrictFilenameClean("../secret") == "secret");
        Assert.That(Utilities.StrictFilenameClean("foo/./bar") == "foo/bar");
        Assert.That(Utilities.StrictFilenameClean("foo/") == "foo");
        Assert.That(Utilities.StrictFilenameClean("  padded  ") == "padded");
        Assert.That(Utilities.StrictFilenameClean("hello<>world") == "helloworld");
        Assert.That(Utilities.StrictFilenameClean("a:b") == "ab");
        Assert.That(Utilities.StrictFilenameClean("hello%20world") == "hello20world");
        Assert.That(Utilities.StrictFilenameClean("name*?") == "name");
        Assert.That(Utilities.StrictFilenameClean("hello\nworld") == "helloworld");
        Assert.That(Utilities.StrictFilenameClean("con") == "con_");
        Assert.That(Utilities.StrictFilenameClean("CON") == "CON_");
        Assert.That(Utilities.StrictFilenameClean("prn") == "prn_");
        Assert.That(Utilities.StrictFilenameClean("com1") == "com1_");
        Assert.That(Utilities.StrictFilenameClean("lpt9") == "lpt9_");
        Assert.That(Utilities.StrictFilenameClean("models/con/file") == "models/con_/file");
        Assert.That(Utilities.StrictFilenameClean("hello\u200bworld") == "helloworld");
        Assert.That(Utilities.StrictFilenameClean("hello\ufeffworld") == "helloworld");
    }
}
