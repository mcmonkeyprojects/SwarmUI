using System.Diagnostics.CodeAnalysis;

// From FrenUtil ref.
[assembly: SuppressMessage("Usage", "CA2211:Non-constant fields should not be visible", Justification = "Counter-productive to quality code")]
[assembly: SuppressMessage("Style", "IDE0060:Remove unused parameter", Justification = "Endless false marking of methods whose parameters are defined by delegate/Func/Action usage")]
[assembly: SuppressMessage("CodeQuality", "IDE0079:Remove unnecessary suppression", Justification = "WTF MICROSOFT???")]

// Local
[assembly: SuppressMessage("Interoperability", "SYSLIB1054:Use 'LibraryImportAttribute' instead of 'DllImportAttribute' to generate P/Invoke marshalling code at compile time")]
[assembly: SuppressMessage("Interoperability", "CA1401:P/Invokes should not be visible")]
[assembly: SuppressMessage("Performance", "CA1806:Do not ignore method results")]
[assembly: SuppressMessage("Performance", "CA1860:Avoid using 'Enumerable.Any()' extension method")]
[assembly: SuppressMessage("Usage", "ASP0018:Unused route parameter")]
[assembly: SuppressMessage("Performance", "CA1861:Avoid constant arrays as arguments")]
[assembly: SuppressMessage("Style", "IDE0130:Namespace does not match folder structure", Justification = "Extensions have intentional mismatch")]
[assembly: SuppressMessage("Style", "IDE0019:Use pattern matching", Justification = "Often wants to change to pretty bad code")]
[assembly: SuppressMessage("Performance", "CA1859:Use concrete types when possible for improved performance", Justification = "the description of this message has no relation to the random things it marks, and it seems to just be actively wrong in what it marks")]

// Special
[assembly: SuppressMessage("Performance", "CA1854:Prefer the 'IDictionary.TryGetValue(TKey, out TValue)' method", Justification = "Detection is bad here, but a good warning normally", Scope = "member", Target = "~M:SwarmUI.Accounts.SessionHandler.#ctor")]
