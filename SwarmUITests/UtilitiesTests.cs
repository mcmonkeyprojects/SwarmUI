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
        Assert.That(Utilities.StrictFilenameClean("hello"), Is.EqualTo("hello"));
        Assert.That(Utilities.StrictFilenameClean("My File"), Is.EqualTo("My File"));
        Assert.That(Utilities.StrictFilenameClean("abc123"), Is.EqualTo("abc123"));
        Assert.That(Utilities.StrictFilenameClean("foo-bar_baz"), Is.EqualTo("foo-bar_baz"));
        Assert.That(Utilities.StrictFilenameClean(""), Is.EqualTo(""));
        Assert.That(Utilities.StrictFilenameClean("file.txt"), Is.EqualTo("filetxt"));
        Assert.That(Utilities.StrictFilenameClean("..."), Is.EqualTo(""));
        Assert.That(Utilities.StrictFilenameClean("folder/sub/file"), Is.EqualTo("folder/sub/file"));
        Assert.That(Utilities.StrictFilenameClean("folder\\sub\\file"), Is.EqualTo("folder/sub/file"));
        Assert.That(Utilities.StrictFilenameClean("/leading/slash"), Is.EqualTo("leading/slash"));
        Assert.That(Utilities.StrictFilenameClean("foo//bar///baz"), Is.EqualTo("foo/bar/baz"));
        Assert.That(Utilities.StrictFilenameClean("../secret"), Is.EqualTo("secret"));
        Assert.That(Utilities.StrictFilenameClean("foo/./bar"), Is.EqualTo("foo/bar"));
        Assert.That(Utilities.StrictFilenameClean("foo/"), Is.EqualTo("foo"));
        Assert.That(Utilities.StrictFilenameClean("  padded  "), Is.EqualTo("padded"));
        Assert.That(Utilities.StrictFilenameClean("hello<>world"), Is.EqualTo("helloworld"));
        Assert.That(Utilities.StrictFilenameClean("a:b"), Is.EqualTo("ab"));
        Assert.That(Utilities.StrictFilenameClean("hello%20world"), Is.EqualTo("hello20world"));
        Assert.That(Utilities.StrictFilenameClean("name*?"), Is.EqualTo("name"));
        Assert.That(Utilities.StrictFilenameClean("hello\nworld"), Is.EqualTo("helloworld"));
        Assert.That(Utilities.StrictFilenameClean("con"), Is.EqualTo("con_"));
        Assert.That(Utilities.StrictFilenameClean("CON"), Is.EqualTo("CON_"));
        Assert.That(Utilities.StrictFilenameClean("prn"), Is.EqualTo("prn_"));
        Assert.That(Utilities.StrictFilenameClean("com1"), Is.EqualTo("com1_"));
        Assert.That(Utilities.StrictFilenameClean("lpt9"), Is.EqualTo("lpt9_"));
        Assert.That(Utilities.StrictFilenameClean("models/con/file"), Is.EqualTo("models/con_/file"));
        Assert.That(Utilities.StrictFilenameClean("hello\u200bworld"), Is.EqualTo("helloworld"));
        Assert.That(Utilities.StrictFilenameClean("hello\ufeffworld"), Is.EqualTo("helloworld"));
    }
}
