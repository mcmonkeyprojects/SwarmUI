﻿namespace SwarmUI.DataHolders;

[AttributeUsage(AttributeTargets.Field)]
public class SuggestionPlaceholder : Attribute
{
    public string Text;
}
