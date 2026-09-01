using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using NUnit.Framework;
using SwarmUI.Text2Image;

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
        Assert.That(splitComma.Length == 2);
        Assert.That(splitComma[0] == "a");
        Assert.That(splitComma[1] == "b");
        string[] splitPipe = T2IPromptHandling.SplitSmart("a|b|NUMBA, THREE");
        Assert.That(splitPipe.Length == 3);
        Assert.That(splitPipe[0] == "a");
        Assert.That(splitPipe[1] == "b");
        Assert.That(splitPipe[2] == "NUMBA, THREE");
        string[] splitTwoPipe = T2IPromptHandling.SplitSmart("one|| t,wo || three");
        Assert.That(splitTwoPipe.Length == 3);
        Assert.That(splitTwoPipe[0] == "one");
        Assert.That(splitTwoPipe[1] == "t,wo");
        Assert.That(splitTwoPipe[2] == "three");
        string[] splitTrick = T2IPromptHandling.SplitSmart("a, b, c|d, e");
        Assert.That(splitTrick.Length == 2);
        Assert.That(splitTrick[0] == "a, b, c");
        Assert.That(splitTrick[1] == "d, e");
        string[] splitTrickPipe = T2IPromptHandling.SplitSmart("a|b||c");
        Assert.That(splitTrickPipe.Length == 2);
        Assert.That(splitTrickPipe[0] == "a|b");
        Assert.That(splitTrickPipe[1] == "c");
    }

    /// <summary>Tests <see cref="T2IPromptHandling.JoinSmart(string[])"/>.</summary>
    [Test]
    public static void TestJoinSmart()
    {
        Assert.That(T2IPromptHandling.JoinSmart(["a", "b"]) == "a,b");
        Assert.That(T2IPromptHandling.JoinSmart(["a", "b", "NUMBA, THREE"]) == "a|b|NUMBA, THREE");
        Assert.That(T2IPromptHandling.JoinSmart(["one", "t,wo", "three"]) == "one|t,wo|three");
        Assert.That(T2IPromptHandling.JoinSmart(["a, b, c", "d, e"]) == "a, b, c|d, e");
        Assert.That(T2IPromptHandling.JoinSmart(["a|b", "c"]) == "a|b||c");
    }
}
