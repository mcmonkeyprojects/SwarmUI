using System;
using System.Text;
using System.Collections.Generic;
using System.Linq;
using SwarmUI.Text2Image;

namespace SwarmUI.Utils;

/// <summary>Converts Comfy/A1111 prompt syntaxes into Swarm tags.</summary>
public static class LegacyPromptParser
{
    /// <summary>Converts Comfy/A1111 prompt syntaxes into Swarm tags.</summary>
    public static string Convert(string val)
    {
        if (string.IsNullOrEmpty(val))
        {
            return val;
        }
        val = ConvertParenWeights(val);
        val = ConvertBracketSyntaxes(val);
        return val;
    }

    static bool IsPromptEscapable(char c)
    {
        return c is '\\' or '[' or ']' or ':' or '|' or '(' or ')' or '<' or '>';
    }

    static int FindMatchingParen(string val, int start)
    {
        int depth = 0;
        for (int i = start; i < val.Length; i++)
        {
            if (val[i] == '\\' && i + 1 < val.Length && IsPromptEscapable(val[i + 1]))
            {
                i++;
                continue;
            }
            if (val[i] == '(')
            {
                depth++;
            }
            else if (val[i] == ')')
            {
                depth--;
                if (depth == 0)
                {
                    return i;
                }
            }
        }
        return -1;
    }

    static int FindMatchingTag(string val, int start)
    {
        int depth = 0;
        for (int i = start; i < val.Length; i++)
        {
            if (val[i] == '<')
            {
                depth++;
            }
            else if (val[i] == '>')
            {
                depth--;
                if (depth == 0)
                {
                    return i;
                }
            }
        }
        return -1;
    }

    static string ConvertParenGroup(string inner)
    {
        double weight = 1.1;
        int xx = inner.LastIndexOf(':');
        if (xx > 0 && double.TryParse(inner[(xx + 1)..].Trim(), out double parsed))
        {
            weight = parsed;
            inner = inner[..xx];
        }
        string converted = ConvertParenWeights(inner);
        if (weight == 1 || converted.Length == 0)
        {
            return converted;
        }
        if (inner.Length >= 2 && inner[0] == '(' && FindMatchingParen(inner, 0) == inner.Length - 1 && converted.StartsWith("<weight[") && converted.EndsWith('>'))
        {
            int close = FindMatchingTag(converted, 0);
            if (close == converted.Length - 1)
            {
                string content = converted[1..^1];
                int colon = T2IPromptHandling.IndexOfNoncontained(content, ':');
                int bracketEnd = content.IndexOf(']');
                if (colon != -1 && bracketEnd > 7 && content.StartsWith("weight[") && double.TryParse(content[7..bracketEnd], out double innerW))
                {
                    return $"<weight[{weight * innerW:0.######}]:{content[(colon + 1)..]}>";
                }
            }
        }
        return $"<weight[{weight:0.######}]:{converted}>";
    }

    static string ConvertParenWeights(string val)
    {
        StringBuilder result = new(val.Length);
        for (int i = 0; i < val.Length; i++)
        {
            char c = val[i];
            if (c == '\\' && i + 1 < val.Length && (val[i + 1] == '(' || val[i + 1] == ')'))
            {
                result.Append(val[i + 1]);
                i++;
                continue;
            }
            if (c == '<')
            {
                int close = FindMatchingTag(val, i);
                if (close == -1)
                {
                    result.Append(c);
                    continue;
                }
                string content = val[(i + 1)..close];
                int colon = T2IPromptHandling.IndexOfNoncontained(content, ':');
                if (colon == -1)
                {
                    result.Append(val[i..(close + 1)]);
                }
                else
                {
                    result.Append($"<{content[..colon]}:{ConvertParenWeights(content[(colon + 1)..])}>");
                }
                i = close;
                continue;
            }
            if (c == '(')
            {
                int end = FindMatchingParen(val, i);
                if (end == -1)
                {
                    result.Append(c);
                    continue;
                }
                result.Append(ConvertParenGroup(val[(i + 1)..end]));
                i = end;
                continue;
            }
            result.Append(c);
        }
        return result.ToString();
    }

    static string[] SplitOnIndices(string val, List<int> indices, int contentStart, int contentEnd)
    {
        List<string> parts = [];
        int prev = contentStart;
        foreach (int idx in indices)
        {
            parts.Add(val[prev..idx]);
            prev = idx + 1;
        }
        parts.Add(val[prev..contentEnd]);
        return [.. parts];
    }

    static bool TryConvertBracket(string val, int start, out int end, out string converted)
    {
        end = -1;
        converted = null;
        int nest = 0;
        List<int> colons = [];
        List<int> pipes = [];
        for (int i = start + 1; i < val.Length; i++)
        {
            if (val[i] == '\\' && i + 1 < val.Length && IsPromptEscapable(val[i + 1]))
            {
                i++;
                continue;
            }
            if (val[i] == '<')
            {
                int close = FindMatchingTag(val, i);
                if (close == -1)
                {
                    continue;
                }
                i = close;
                continue;
            }
            if (val[i] == '[')
            {
                nest++;
            }
            else if (val[i] == ']')
            {
                if (nest == 0)
                {
                    end = i;
                    break;
                }
                nest--;
            }
            else if (val[i] == ':' && nest == 0 && pipes.Count == 0)
            {
                colons.Add(i);
            }
            else if (val[i] == '|' && nest == 0 && colons.Count == 0)
            {
                pipes.Add(i);
            }
        }
        if (end == -1)
        {
            return false;
        }
        string control = val[(start + 1)..end];
        if (pipes.Count > 0)
        {
            converted = $"<alternate:{T2IPromptHandling.JoinSmart(SplitOnIndices(val, pipes, start + 1, end))}>";
            return true;
        }
        if (colons.Count == 2)
        {
            string[] parts = SplitOnIndices(val, colons, start + 1, end);
            if (!double.TryParse(parts[2].Trim(), out _))
            {
                converted = val[start..(end + 1)];
                return true;
            }
            converted = $"<fromto[{parts[2].Trim()}]:{T2IPromptHandling.JoinSmart([parts[0], parts[1]])}>";
            return true;
        }
        if (colons.Count == 1)
        {
            string[] parts = SplitOnIndices(val, colons, start + 1, end);
            if (double.TryParse(parts[1].Trim(), out _))
            {
                converted = $"<fromto[{parts[1].Trim()}]:{T2IPromptHandling.JoinSmart(["", parts[0]])}>";
                return true;
            }
            converted = val[start..(end + 1)];
            return true;
        }
        converted = $"[{ConvertBracketSyntaxes(control)}]";
        return true;
    }

    static string ConvertBracketSyntaxes(string val)
    {
        StringBuilder result = new(val.Length);
        for (int i = 0; i < val.Length; i++)
        {
            char c = val[i];
            if (c == '\\' && i + 1 < val.Length && (val[i + 1] == '[' || val[i + 1] == ']' || val[i + 1] == '|' || val[i + 1] == ':'))
            {
                result.Append(val[i + 1]);
                i++;
                continue;
            }
            if (c == '<')
            {
                int close = FindMatchingTag(val, i);
                if (close == -1)
                {
                    result.Append(c);
                    continue;
                }
                string content = val[(i + 1)..close];
                int colon = T2IPromptHandling.IndexOfNoncontained(content, ':');
                if (colon == -1)
                {
                    result.Append(val[i..(close + 1)]);
                }
                else
                {
                    result.Append($"<{content[..colon]}:{ConvertBracketSyntaxes(content[(colon + 1)..])}>");
                }
                i = close;
                continue;
            }
            if (c == '[')
            {
                if (!TryConvertBracket(val, i, out int end, out string converted))
                {
                    result.Append(c);
                    continue;
                }
                result.Append(converted);
                i = end;
                continue;
            }
            result.Append(c);
        }
        return result.ToString();
    }
}
