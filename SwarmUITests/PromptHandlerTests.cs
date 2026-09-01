using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using NUnit.Framework;
using SwarmUI.Text2Image;
using SwarmUI.Utils;

namespace SwarmUITests;

public class PromptHandlerTests : SwarmUITest
{
    /// <summary>Prepares the basics.</summary>
    [OneTimeSetUp]
    public static void PreInit()
    {
        Setup();
    }

    /// <summary>Tests <see cref="T2IPromptHandling.SplitSmart(string)"/>.</summary>
    [Test]
    public static void TestSplitSmart()
    {
        string[] splitComma = T2IPromptHandling.SplitSmart("a, b");
        Assert.That(splitComma.Length, Is.EqualTo(2));
        Assert.That(splitComma[0], Is.EqualTo("a"));
        Assert.That(splitComma[1], Is.EqualTo("b"));
        string[] splitPipe = T2IPromptHandling.SplitSmart("a|b|NUMBA, THREE");
        Assert.That(splitPipe.Length, Is.EqualTo(3));
        Assert.That(splitPipe[0], Is.EqualTo("a"));
        Assert.That(splitPipe[1], Is.EqualTo("b"));
        Assert.That(splitPipe[2], Is.EqualTo("NUMBA, THREE"));
        string[] splitTwoPipe = T2IPromptHandling.SplitSmart("one|| t,wo || three");
        Assert.That(splitTwoPipe.Length, Is.EqualTo(3));
        Assert.That(splitTwoPipe[0], Is.EqualTo("one"));
        Assert.That(splitTwoPipe[1], Is.EqualTo("t,wo"));
        Assert.That(splitTwoPipe[2], Is.EqualTo("three"));
        string[] splitTrick = T2IPromptHandling.SplitSmart("a, b, c|d, e");
        Assert.That(splitTrick.Length, Is.EqualTo(2));
        Assert.That(splitTrick[0], Is.EqualTo("a, b, c"));
        Assert.That(splitTrick[1], Is.EqualTo("d, e"));
        string[] splitTrickPipe = T2IPromptHandling.SplitSmart("a|b||c");
        Assert.That(splitTrickPipe.Length, Is.EqualTo(2));
        Assert.That(splitTrickPipe[0], Is.EqualTo("a|b"));
        Assert.That(splitTrickPipe[1], Is.EqualTo("c"));
    }

    /// <summary>Tests <see cref="T2IPromptHandling.JoinSmart(string[])"/>.</summary>
    [Test]
    public static void TestJoinSmart()
    {
        Assert.That(T2IPromptHandling.JoinSmart(["a", "b"]), Is.EqualTo("a,b"));
        Assert.That(T2IPromptHandling.JoinSmart(["a", "b", "NUMBA, THREE"]), Is.EqualTo("a|b|NUMBA, THREE"));
        Assert.That(T2IPromptHandling.JoinSmart(["one", "t,wo", "three"]), Is.EqualTo("one|t,wo|three"));
        Assert.That(T2IPromptHandling.JoinSmart(["a, b, c", "d, e"]), Is.EqualTo("a, b, c|d, e"));
        Assert.That(T2IPromptHandling.JoinSmart(["a|b", "c"]), Is.EqualTo("a|b||c"));
    }

    /// <summary>Tests <see cref="LegacyPromptParser.Convert(string)"/>.</summary>
    [Test]
    public static void TestLegacyParser()
    {
        Assert.That(LegacyPromptParser.Convert("a, b"), Is.EqualTo("a, b"));
        Assert.That(LegacyPromptParser.Convert("<weight[1.5]:hello world!>"), Is.EqualTo("<weight[1.5]:hello world!>"));
        Assert.That(LegacyPromptParser.Convert("(hello world!:1.5)"), Is.EqualTo("<weight[1.5]:hello world!>"));
        Assert.That(LegacyPromptParser.Convert("(hello world!)"), Is.EqualTo("<weight[1.1]:hello world!>"));
        Assert.That(LegacyPromptParser.Convert("((hello world!))"), Is.EqualTo("<weight[1.21]:hello world!>"));
        Assert.That(LegacyPromptParser.Convert("(some (hello world!) text)"), Is.EqualTo("<weight[1.1]:some <weight[1.1]:hello world!> text>"));
        Assert.That(LegacyPromptParser.Convert("[a|b]"), Is.EqualTo("<alternate:a,b>"));
        Assert.That(LegacyPromptParser.Convert("[a|b|c|d]"), Is.EqualTo("<alternate:a,b,c,d>"));
        Assert.That(LegacyPromptParser.Convert("[a|b|c|d,e]"), Is.EqualTo("<alternate:a|b|c|d,e>"));
        Assert.That(LegacyPromptParser.Convert("[a:b:0.5]"), Is.EqualTo("<fromto[0.5]:a,b>"));
        Assert.That(LegacyPromptParser.Convert("some (weighted:1.3) and [from:to:0.25] and [alter|nating] text"), Is.EqualTo("some <weight[1.3]:weighted> and <fromto[0.25]:from,to> and <alternate:alter,nating> text"));
        Assert.That(LegacyPromptParser.Convert("(layers of [a|b] features:1.5)"), Is.EqualTo("<weight[1.5]:layers of <alternate:a,b> features>"));
        Assert.That(LegacyPromptParser.Convert("(<weight[2]:layers of [a|b] features>:1.5)"), Is.EqualTo("<weight[1.5]:<weight[2]:layers of <alternate:a,b> features>>"));
        Assert.That(LegacyPromptParser.Convert("(<weight[2]:layers of [some (weighted:3)|b] features>:1.5)"), Is.EqualTo("<weight[1.5]:<weight[2]:layers of <alternate:some <weight[3]:weighted>,b> features>>"));
        Assert.That(LegacyPromptParser.Convert("[rating!=g]"), Is.EqualTo("[rating!=g]"));
        Assert.That(LegacyPromptParser.Convert("masterpiece, <trigger>, <q:tags/deepghs.danbooru2024[rating!=g]>"), Is.EqualTo("masterpiece, <trigger>, <q:tags/deepghs.danbooru2024[rating!=g]>"));
        Assert.That(LegacyPromptParser.Convert("\\(hello world!:1.5\\)"), Is.EqualTo("(hello world!:1.5)"));
        Assert.That(LegacyPromptParser.Convert("\\(hello (world:2)!:1.5\\)"), Is.EqualTo("(hello <weight[2]:world>!:1.5)"));
        Assert.That(LegacyPromptParser.Convert("\\(hello (world \\(and all who inhabit it\\):2)!:1.5\\)"), Is.EqualTo("(hello <weight[2]:world (and all who inhabit it)>!:1.5)"));
    }
}
