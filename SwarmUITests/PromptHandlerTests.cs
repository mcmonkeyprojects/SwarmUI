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
    }
}
