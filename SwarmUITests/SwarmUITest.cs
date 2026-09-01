using System;
using FreneticUtilities.FreneticToolkit;
using NUnit.Framework;

namespace SwarmUITests;

/// <summary>Represents any test in SwarmUI. Should be derived from.</summary>
public abstract class SwarmUITest
{
    /// <summary>ALWAYS call this in a test's static OneTimeSetUp!</summary>
    public static void Setup()
    {
        SpecialTools.Internationalize();
    }

    /// <summary>Asserts that two normal-range doubles are approximately equal (down to 4 decimal places).</summary>
    /// <param name="expected">The expected value.</param>
    /// <param name="actual">The actual value.</param>
    /// <param name="message">The message to display if they aren't roughly equal.</param>
    public static void AssertAreRoughlyEqual(double expected, double actual, string message)
    {
        Assert.That((long)Math.Round(expected * 10000), Is.EqualTo((long)Math.Round(actual * 10000)), message);
    }
}
