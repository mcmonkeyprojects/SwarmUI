using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;

namespace SwarmUI.WebAPI;

[API.APIClass("API routes used by the experimental React frontend bridge.")]
public static class ReactBridgeAPI
{
    /// <summary>Maximum allowed fetched roleplay character card size, in bytes.</summary>
    public const int MaxRoleplayCardFetchBytes = 25 * 1024 * 1024;

    /// <summary>Maximum number of redirects followed while fetching a remote roleplay character card.</summary>
    public const int MaxRoleplayCardRedirects = 5;

    /// <summary>Number of external roleplay character source results to fetch per page.</summary>
    public const int RoleplaySourcePageSize = 24;

    /// <summary>HTTP client used for roleplay card URL fetching, with manual redirect handling.</summary>
    public static readonly HttpClient RoleplayCardFetchClient = new(new SocketsHttpHandler() { AllowAutoRedirect = false });

    public static void Register()
    {
        API.RegisterAPICall(ForwardMetadataImageRequest, false, Permissions.EditModelMetadata);
        API.RegisterAPICall(SetModelPreviewFromMetadataUrl, true, Permissions.EditModelMetadata);
        API.RegisterAPICall(RoleplayFetchCharacterCardUrl, false, Permissions.FundamentalGenerateTabAccess);
        API.RegisterAPICall(RoleplaySearchCharacterCardSources, false, Permissions.FundamentalGenerateTabAccess);
        API.RegisterAPICall(RoleplayFetchCharacterCardSource, false, Permissions.FundamentalGenerateTabAccess);
    }

    public static bool IsAllowedMetadataHost(string host)
    {
        return host == "civitai.com" || host.EndsWith(".civitai.com") || host == "huggingface.co" || host.EndsWith(".huggingface.co");
    }

    public static bool TryParseAllowedMetadataUri(string url, out Uri uri, out string error)
    {
        uri = null;
        error = null;
        if (string.IsNullOrWhiteSpace(url))
        {
            error = "Invalid URL.";
            return false;
        }
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out uri))
        {
            error = "Invalid URL.";
            return false;
        }
        if (uri.Scheme != Uri.UriSchemeHttps)
        {
            error = "Invalid URL.";
            return false;
        }
        if (!IsAllowedMetadataHost(uri.Host.ToLowerFast()))
        {
            error = "Invalid URL.";
            return false;
        }
        return true;
    }

    public static string BuildAuthorizedMetadataUrl(Session session, Uri uri)
    {
        string url = uri.AbsoluteUri;
        string host = uri.Host.ToLowerFast();
        if ((host == "civitai.com" || host.EndsWith(".civitai.com")) && !url.Contains("?token=") && !url.Contains("&token="))
        {
            string civitaiApiKey = session.User.GetGenericData("civitai_api", "key");
            if (!string.IsNullOrWhiteSpace(civitaiApiKey))
            {
                url += (url.Contains('?') ? "&token=" : "?token=") + ModelsAPI.TokenTextLimiter.TrimToMatches(civitaiApiKey);
            }
        }
        return url;
    }

    public static HttpRequestMessage BuildAuthorizedMetadataRequest(Session session, Uri uri)
    {
        HttpRequestMessage request = new(HttpMethod.Get, BuildAuthorizedMetadataUrl(session, uri));
        string host = uri.Host.ToLowerFast();
        if (host == "huggingface.co" || host.EndsWith(".huggingface.co"))
        {
            string huggingFaceApiKey = session.User.GetGenericData("huggingface_api", "key");
            if (!string.IsNullOrWhiteSpace(huggingFaceApiKey))
            {
                request.Headers.Authorization = new("Bearer", huggingFaceApiKey.Trim());
            }
        }
        return request;
    }

    public static bool IsPrivateNetworkAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address))
        {
            return true;
        }
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            byte[] bytes = address.GetAddressBytes();
            return bytes[0] == 0
                || bytes[0] == 10
                || bytes[0] == 127
                || (bytes[0] == 169 && bytes[1] == 254)
                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
                || (bytes[0] == 192 && bytes[1] == 168);
        }
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            byte[] bytes = address.GetAddressBytes();
            return address.IsIPv6LinkLocal
                || address.IsIPv6SiteLocal
                || (bytes[0] & 0xfe) == 0xfc;
        }
        return true;
    }

    public static async Task<string> ValidateRoleplayCardFetchUri(Uri uri)
    {
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return "Only http and https URLs are supported.";
        }
        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(uri.Host, Program.GlobalProgramCancel);
        }
        catch (Exception ex)
        {
            return $"Could not resolve host: {ex.Message}";
        }
        if (addresses.Length == 0)
        {
            return "Could not resolve host.";
        }
        foreach (IPAddress address in addresses)
        {
            if (IsPrivateNetworkAddress(address))
            {
                return "Private-network URLs are not allowed for remote card downloads.";
            }
        }
        return null;
    }

    public static string GetRoleplayCardFileName(Uri uri, HttpResponseMessage response)
    {
        string fileName = response.Content.Headers.ContentDisposition?.FileNameStar
            ?? response.Content.Headers.ContentDisposition?.FileName
            ?? Path.GetFileName(uri.LocalPath);
        fileName = fileName?.Trim('"', ' ', '\t') ?? "";
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = "character-card";
        }
        if (string.IsNullOrWhiteSpace(Path.GetExtension(fileName)))
        {
            string mimeType = $"{response.Content.Headers.ContentType?.MediaType}".ToLowerFast();
            string path = uri.AbsolutePath.ToLowerFast();
            if (mimeType == "image/png" || path.Contains("/download/png/"))
            {
                fileName += ".png";
            }
            else if (mimeType == "application/json" || path.Contains("/download/json/"))
            {
                fileName += ".json";
            }
        }
        return Utilities.StrictFilenameClean(fileName);
    }

    public static string GetRoleplayCardMimeType(Uri uri, HttpResponseMessage response)
    {
        string mimeType = $"{response.Content.Headers.ContentType?.MediaType}".ToLowerFast();
        if (!string.IsNullOrWhiteSpace(mimeType))
        {
            return mimeType;
        }
        string extension = Path.GetExtension(uri.LocalPath).ToLowerFast();
        if (extension == ".png")
        {
            return "image/png";
        }
        if (extension == ".json")
        {
            return "application/json";
        }
        return "application/octet-stream";
    }

    public static bool IsLikelyRoleplayCardMimeType(string mimeType)
    {
        return mimeType == "image/png"
            || mimeType == "image/x-png"
            || mimeType == "application/json"
            || mimeType == "text/json"
            || mimeType == "application/octet-stream";
    }

    public static string ValidateRoleplayCardResponse(Uri uri, HttpResponseMessage response, string fileName, string mimeType)
    {
        string lowerFileName = (fileName ?? "").ToLowerFast();
        if (mimeType == "text/html" || mimeType == "application/xhtml+xml" || lowerFileName.EndsWith(".html") || lowerFileName.EndsWith(".htm"))
        {
            return "URL returned an HTML page instead of a Tavern PNG or JSON card.";
        }
        if (IsLikelyRoleplayCardMimeType(mimeType) || lowerFileName.EndsWith(".png") || lowerFileName.EndsWith(".json"))
        {
            return null;
        }
        return $"Remote file does not look like a Tavern PNG or JSON card (got {mimeType}).";
    }

    public static async Task<(byte[] Data, string Error)> ReadRoleplayCardResponse(HttpResponseMessage response)
    {
        long? contentLength = response.Content.Headers.ContentLength;
        if (contentLength.HasValue && contentLength.Value > MaxRoleplayCardFetchBytes)
        {
            return (null, "Remote card is too large.");
        }
        await using Stream stream = await response.Content.ReadAsStreamAsync(Program.GlobalProgramCancel);
        using MemoryStream memory = new();
        byte[] buffer = new byte[81920];
        while (true)
        {
            int read = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), Program.GlobalProgramCancel);
            if (read == 0)
            {
                break;
            }
            memory.Write(buffer, 0, read);
            if (memory.Length > MaxRoleplayCardFetchBytes)
            {
                return (null, "Remote card is too large.");
            }
        }
        return (memory.ToArray(), null);
    }

    public static async Task<JObject> FetchRoleplayCharacterCardUrlInternal(string url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out Uri uri))
        {
            return new JObject() { ["success"] = false, ["error"] = "Invalid URL." };
        }

        for (int redirect = 0; redirect <= MaxRoleplayCardRedirects; redirect++)
        {
            string validationError = await ValidateRoleplayCardFetchUri(uri);
            if (validationError is not null)
            {
                return new JObject() { ["success"] = false, ["error"] = validationError };
            }

            try
            {
                using HttpRequestMessage request = new(HttpMethod.Get, uri);
                request.Headers.UserAgent.ParseAdd($"SwarmUI/{Utilities.Version}");
                using HttpResponseMessage response = await RoleplayCardFetchClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, Program.GlobalProgramCancel);
                if ((int)response.StatusCode >= 300 && (int)response.StatusCode < 400 && response.Headers.Location is not null)
                {
                    uri = new Uri(uri, response.Headers.Location);
                    if (redirect == MaxRoleplayCardRedirects)
                    {
                        return new JObject() { ["success"] = false, ["error"] = "Too many redirects." };
                    }
                    continue;
                }
                if (!response.IsSuccessStatusCode)
                {
                    return new JObject() { ["success"] = false, ["error"] = $"{(int)response.StatusCode} {response.StatusCode}" };
                }
                string fileName = GetRoleplayCardFileName(uri, response);
                string mimeType = GetRoleplayCardMimeType(uri, response);
                string responseValidationError = ValidateRoleplayCardResponse(uri, response, fileName, mimeType);
                if (responseValidationError is not null)
                {
                    return new JObject() { ["success"] = false, ["error"] = responseValidationError };
                }
                (byte[] data, string readError) = await ReadRoleplayCardResponse(response);
                if (readError is not null)
                {
                    return new JObject() { ["success"] = false, ["error"] = readError };
                }
                return new JObject()
                {
                    ["success"] = true,
                    ["fileName"] = fileName,
                    ["mimeType"] = mimeType,
                    ["dataBase64"] = Convert.ToBase64String(data),
                    ["finalUrl"] = uri.AbsoluteUri
                };
            }
            catch (Exception ex)
            {
                Logs.Warning($"While fetching remote roleplay card '{url}', got exception: {ex.ReadableString()}");
                return new JObject() { ["success"] = false, ["error"] = $"{ex.GetType().Name}: {ex.Message}" };
            }
        }

        return new JObject() { ["success"] = false, ["error"] = "Too many redirects." };
    }

    [API.APIDescription("Fetches a remote SillyTavern/Tavern character card URL and returns the raw data as base64.",
        """
            "success": true,
            "fileName": "card.png",
            "mimeType": "image/png",
            "dataBase64": "abc123",
            "finalUrl": "https://example.com/card.png"
        """)]
    public static async Task<JObject> RoleplayFetchCharacterCardUrl(Session session,
        [API.APIParameter("Direct http or https URL to a Tavern character card JSON or PNG file.")] string url)
    {
        return await FetchRoleplayCharacterCardUrlInternal(url);
    }

    public static string RoleplayContentRatingQueryValue(string contentRating)
    {
        string normalized = (contentRating ?? "").Trim().ToLowerFast();
        if (normalized == "all" || normalized == "nsfw")
        {
            return normalized;
        }
        return "sfw";
    }

    public static string TokenString(JToken token)
    {
        return token is null || token.Type == JTokenType.Null ? "" : token.ToString();
    }

    public static string FirstNonEmpty(params string[] values)
    {
        foreach (string value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }
        return "";
    }

    public static JArray NormalizeRoleplaySourceTags(JToken tags)
    {
        JArray result = [];
        if (tags is not JArray tagsArray)
        {
            return result;
        }
        foreach (JToken tag in tagsArray)
        {
            string value = tag.Type == JTokenType.Object ? TokenString(tag["name"]) : TokenString(tag);
            if (!string.IsNullOrWhiteSpace(value))
            {
                result.Add(value);
            }
        }
        return result;
    }

    public static bool TagsContain(JArray tags, string expected)
    {
        foreach (JToken tag in tags)
        {
            if (TokenString(tag).Equals(expected, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    public static async Task<JObject> FetchRoleplaySourceJson(string url)
    {
        using HttpRequestMessage request = new(HttpMethod.Get, url);
        request.Headers.UserAgent.ParseAdd($"SwarmUI/{Utilities.Version}");
        using HttpResponseMessage response = await RoleplayCardFetchClient.SendAsync(request, Program.GlobalProgramCancel);
        string body = await response.Content.ReadAsStringAsync(Program.GlobalProgramCancel);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"{(int)response.StatusCode} {response.StatusCode}");
        }
        return JObject.Parse(body);
    }

    public static JObject BuildRoleplaySourceResult(
        string providerId,
        string externalId,
        string title,
        string creator,
        string description,
        JArray tags,
        string thumbnailUrl,
        string contentRating,
        string externalUrl,
        string sourceUrl)
    {
        return new JObject()
        {
            ["providerId"] = providerId,
            ["externalId"] = externalId,
            ["title"] = title,
            ["creator"] = creator,
            ["description"] = description,
            ["tags"] = tags ?? new JArray(),
            ["thumbnailUrl"] = thumbnailUrl,
            ["contentRating"] = contentRating,
            ["externalUrl"] = externalUrl,
            ["sourceUrl"] = sourceUrl
        };
    }

    public static async Task<JObject> SearchCharaVaultRoleplaySources(string query, int page, string contentRating)
    {
        int offset = Math.Max(0, page - 1) * RoleplaySourcePageSize;
        string normalizedRating = RoleplayContentRatingQueryValue(contentRating);
        string url = $"https://charavault.net/api/cards?limit={RoleplaySourcePageSize}&offset={offset}";
        if (!string.IsNullOrWhiteSpace(query))
        {
            url += $"&q={Uri.EscapeDataString(query.Trim())}";
        }
        if (normalizedRating == "sfw")
        {
            url += "&nsfw=false";
        }
        else if (normalizedRating == "nsfw")
        {
            url += "&nsfw=true";
        }

        JObject data = await FetchRoleplaySourceJson(url);
        JArray results = [];
        foreach (JToken item in (data["results"] as JArray) ?? new JArray())
        {
            string folder = TokenString(item["folder"]);
            string file = TokenString(item["file"]);
            if (string.IsNullOrWhiteSpace(folder) || string.IsNullOrWhiteSpace(file))
            {
                continue;
            }
            string id = $"{folder}/{file}";
            string cardUrl = $"https://charavault.net/cards/{Uri.EscapeDataString(folder)}/{Uri.EscapeDataString(file)}";
            bool isNsfw = item["nsfw"]?.Value<bool>() ?? false;
            results.Add(BuildRoleplaySourceResult(
                "charavault",
                id,
                FirstNonEmpty(TokenString(item["name"]), file),
                TokenString(item["creator"]),
                TokenString(item["description_preview"]),
                NormalizeRoleplaySourceTags(item["tags"]),
                cardUrl,
                isNsfw ? "nsfw" : "sfw",
                cardUrl,
                cardUrl));
        }
        int total = data["total"]?.Value<int>() ?? results.Count;
        return new JObject()
        {
            ["success"] = true,
            ["providerId"] = "charavault",
            ["results"] = results,
            ["page"] = page,
            ["total"] = total,
            ["hasMore"] = offset + results.Count < total
        };
    }

    public static async Task<JObject> SearchBotbooruRoleplaySources(string query, int page, string contentRating)
    {
        int offset = Math.Max(0, page - 1) * RoleplaySourcePageSize;
        string normalizedRating = RoleplayContentRatingQueryValue(contentRating);
        string url = $"https://botbooru.com/posts/?sort=latest&limit={RoleplaySourcePageSize}&offset={offset}";
        if (!string.IsNullOrWhiteSpace(query))
        {
            url += $"&q={Uri.EscapeDataString(query.Trim())}";
        }
        if (normalizedRating == "sfw")
        {
            url += "&sfw_only=true";
        }

        JObject data = await FetchRoleplaySourceJson(url);
        JArray results = [];
        foreach (JToken item in (data["posts"] as JArray) ?? new JArray())
        {
            string id = TokenString(item["id"]);
            string fileName = TokenString(item["filename"]);
            if (string.IsNullOrWhiteSpace(id))
            {
                continue;
            }
            JArray tags = NormalizeRoleplaySourceTags(item["tags"]);
            bool isNsfw = TagsContain(tags, "nsfw");
            string revision = TokenString(item["card_image_revision"]);
            string thumbnailUrl = string.IsNullOrWhiteSpace(fileName)
                ? ""
                : $"https://botbooru.com/images/preview/320/{Uri.EscapeDataString(fileName)}{(string.IsNullOrWhiteSpace(revision) ? "" : $"?v={Uri.EscapeDataString(revision)}")}";
            results.Add(BuildRoleplaySourceResult(
                "botbooru",
                id,
                FirstNonEmpty(TokenString(item["meta_name"]), TokenString(item["character_name"]), $"Botbooru #{id}"),
                "",
                FirstNonEmpty(TokenString(item["tagline"]), TokenString(item["description_excerpt"]), TokenString(item["creator_notes_excerpt"])),
                tags,
                thumbnailUrl,
                isNsfw ? "nsfw" : "sfw",
                $"https://botbooru.com/character/{Uri.EscapeDataString(id)}",
                $"https://botbooru.com/download/png/{Uri.EscapeDataString(id)}"));
        }
        int total = data["total"]?.Value<int>() ?? results.Count;
        return new JObject()
        {
            ["success"] = true,
            ["providerId"] = "botbooru",
            ["results"] = results,
            ["page"] = page,
            ["total"] = total,
            ["hasMore"] = offset + results.Count < total
        };
    }

    [API.APIDescription("Searches stable public character card sources and returns normalized source results.",
        """
            "success": true,
            "providerId": "charavault",
            "results": [{ "externalId": "cards/example.png", "title": "Example" }]
        """)]
    public static async Task<JObject> RoleplaySearchCharacterCardSources(Session session,
        [API.APIParameter("Provider id to search, eg `charavault` or `botbooru`.")] string providerId,
        [API.APIParameter("Search query text.")] string query = "",
        [API.APIParameter("One-based result page.")] int page = 1,
        [API.APIParameter("Content rating filter: `sfw`, `nsfw`, or `all`. Defaults to SFW.")] string contentRating = "sfw")
    {
        string provider = (providerId ?? "").Trim().ToLowerFast();
        page = Math.Max(1, page);
        try
        {
            if (provider == "charavault")
            {
                return await SearchCharaVaultRoleplaySources(query, page, contentRating);
            }
            if (provider == "botbooru")
            {
                return await SearchBotbooruRoleplaySources(query, page, contentRating);
            }
            return new JObject() { ["success"] = false, ["error"] = "This source does not support built-in search yet." };
        }
        catch (Exception ex)
        {
            Logs.Warning($"While searching roleplay card source '{provider}', got exception: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = $"{ex.GetType().Name}: {ex.Message}" };
        }
    }

    public static bool TryGetJannyCharacterId(string input, out string characterId)
    {
        characterId = "";
        Match match = Regex.Match(input ?? "", @"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
        if (!match.Success)
        {
            return false;
        }
        characterId = match.Value;
        return true;
    }

    public static bool TryGetCharacterTavernPath(string input, out string path)
    {
        path = "";
        string value = (input ?? "").Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }
        if (!Uri.TryCreate(value, UriKind.Absolute, out Uri uri))
        {
            path = value.Trim('/').Replace(".png", "", StringComparison.OrdinalIgnoreCase);
            return path.Split('/').Length == 2;
        }
        string host = uri.Host.ToLowerFast();
        string[] segments = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (host == "character-tavern.com" || host.EndsWith(".character-tavern.com"))
        {
            if (segments.Length >= 3 && (segments[0] == "character" || segments[0] == "chat"))
            {
                path = $"{segments[1]}/{segments[2]}";
                return true;
            }
        }
        if (host == "cards.character-tavern.com" && segments.Length >= 2)
        {
            path = $"{segments[0]}/{segments[1].Replace(".png", "", StringComparison.OrdinalIgnoreCase)}";
            return true;
        }
        return false;
    }

    public static async Task<JObject> FetchJannyRoleplayCard(string externalId, string sourceUrl)
    {
        string characterIdInput = string.IsNullOrWhiteSpace(externalId) ? sourceUrl : externalId;
        if (!TryGetJannyCharacterId(characterIdInput, out string characterId))
        {
            return new JObject() { ["success"] = false, ["error"] = "Could not find a JannyAI/Janitor character id in the URL." };
        }
        using HttpRequestMessage request = new(HttpMethod.Post, "https://api.jannyai.com/api/v1/download");
        request.Headers.UserAgent.ParseAdd($"SwarmUI/{Utilities.Version}");
        request.Content = new StringContent(new JObject() { ["characterId"] = characterId }.ToString(), Encoding.UTF8, "application/json");
        using HttpResponseMessage response = await RoleplayCardFetchClient.SendAsync(request, Program.GlobalProgramCancel);
        string body = await response.Content.ReadAsStringAsync(Program.GlobalProgramCancel);
        if (!response.IsSuccessStatusCode)
        {
            return new JObject() { ["success"] = false, ["error"] = $"{(int)response.StatusCode} {response.StatusCode}" };
        }
        JObject parsed = JObject.Parse(body);
        if (TokenString(parsed["status"]) != "ok" || string.IsNullOrWhiteSpace(TokenString(parsed["downloadUrl"])))
        {
            return new JObject() { ["success"] = false, ["error"] = FirstNonEmpty(TokenString(parsed["error"]), "JannyAI did not return a download URL.") };
        }
        JObject fetched = await FetchRoleplayCharacterCardUrlInternal(TokenString(parsed["downloadUrl"]));
        fetched["sourceProviderId"] = "jannyai";
        fetched["sourceExternalId"] = characterId;
        return fetched;
    }

    public static async Task<JObject> FetchCharacterTavernRoleplayCard(string externalId, string sourceUrl)
    {
        string input = string.IsNullOrWhiteSpace(externalId) ? sourceUrl : externalId;
        if (!TryGetCharacterTavernPath(input, out string path))
        {
            return new JObject() { ["success"] = false, ["error"] = "Could not find a Character Tavern character path in the URL." };
        }
        string url = $"https://cards.character-tavern.com/{path}.png";
        JObject fetched = await FetchRoleplayCharacterCardUrlInternal(url);
        fetched["sourceProviderId"] = "character-tavern";
        fetched["sourceExternalId"] = path;
        return fetched;
    }

    [API.APIDescription("Fetches a card from a known character card source and returns the raw card data as base64.",
        """
            "success": true,
            "fileName": "card.png",
            "mimeType": "image/png",
            "dataBase64": "abc123",
            "finalUrl": "https://example.com/card.png"
        """)]
    public static async Task<JObject> RoleplayFetchCharacterCardSource(Session session,
        [API.APIParameter("Provider id, eg `charavault`, `botbooru`, `jannyai`, or `character-tavern`.")] string providerId,
        [API.APIParameter("Provider-specific result id or character id/path.")] string externalId = "",
        [API.APIParameter("Optional source URL to resolve for direct URL providers.")] string sourceUrl = "")
    {
        string provider = (providerId ?? "").Trim().ToLowerFast();
        try
        {
            JObject result;
            if (provider == "charavault")
            {
                string id = (externalId ?? "").Trim().Trim('/');
                string url = string.IsNullOrWhiteSpace(sourceUrl) ? $"https://charavault.net/cards/{id}" : sourceUrl;
                result = await FetchRoleplayCharacterCardUrlInternal(url);
            }
            else if (provider == "botbooru")
            {
                string id = (externalId ?? "").Trim();
                result = await FetchRoleplayCharacterCardUrlInternal($"https://botbooru.com/download/png/{Uri.EscapeDataString(id)}");
                if (!(result["success"]?.Value<bool>() ?? false))
                {
                    result = await FetchRoleplayCharacterCardUrlInternal($"https://botbooru.com/download/json/{Uri.EscapeDataString(id)}");
                }
            }
            else if (provider == "jannyai" || provider == "janitorai")
            {
                result = await FetchJannyRoleplayCard(externalId, sourceUrl);
            }
            else if (provider == "character-tavern")
            {
                result = await FetchCharacterTavernRoleplayCard(externalId, sourceUrl);
            }
            else
            {
                return new JObject() { ["success"] = false, ["error"] = "This source does not support direct import yet. Open it in a browser and import a Tavern PNG or JSON URL." };
            }
            if (result["sourceProviderId"] is null)
            {
                result["sourceProviderId"] = provider;
            }
            if (result["sourceExternalId"] is null)
            {
                result["sourceExternalId"] = externalId;
            }
            return result;
        }
        catch (Exception ex)
        {
            Logs.Warning($"While fetching roleplay card source '{provider}', got exception: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = $"{ex.GetType().Name}: {ex.Message}" };
        }
    }

    public static async Task<(ImageFile Image, string Error)> FetchMetadataImage(Session session, string url)
    {
        if (!TryParseAllowedMetadataUri(url, out Uri uri, out string error))
        {
            return (null, error);
        }
        Logs.Debug($"ForwardMetadataImageRequest for user '{session.User.UserID}' to '{uri.Host}{uri.PathAndQuery}'");
        try
        {
            using HttpRequestMessage request = BuildAuthorizedMetadataRequest(session, uri);
            using HttpResponseMessage response = await Utilities.UtilWebClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, Program.GlobalProgramCancel);
            if (!response.IsSuccessStatusCode)
            {
                Logs.Warning($"ForwardMetadataImageRequest to '{uri}' returned {(int)response.StatusCode} {response.StatusCode}");
                return (null, $"{(int)response.StatusCode} {response.StatusCode}");
            }
            byte[] rawData = await response.Content.ReadAsByteArrayAsync(Program.GlobalProgramCancel);
            string mimeType = $"{response.Content.Headers.ContentType?.MediaType}".ToLowerFast();
            Logs.Debug($"ForwardMetadataImageRequest to '{uri}' succeeded with content-type '{mimeType}' and {rawData.Length} bytes");
            MediaType mediaType = null;
            if (!string.IsNullOrWhiteSpace(mimeType))
            {
                mediaType = MediaType.TypesByMimeType.GetValueOrDefault(mimeType);
            }
            if (mediaType is null)
            {
                string extension = Path.GetExtension(uri.AbsolutePath).TrimStart('.').ToLowerFast();
                if (!string.IsNullOrWhiteSpace(extension))
                {
                    mediaType = MediaType.GetByExtension(extension, "image", MediaMetaType.Image);
                }
            }
            mediaType ??= MediaType.ImageJpg;
            if (mediaType.MetaType != MediaMetaType.Image && mediaType.MetaType != MediaMetaType.Animation)
            {
                return (null, $"URL did not resolve to an image (got '{mediaType.MimeType}').");
            }
            Image image = new(rawData, mediaType);
            _ = image.ToIS;
            return (image, null);
        }
        catch (Exception ex)
        {
            Logs.Warning($"While making metadata image request to '{url}', got exception: {ex.ReadableString()}");
            return (null, $"{ex.GetType().Name}: {ex.Message}");
        }
    }

    [API.APIDescription("Forwards a remote preview image request and returns a data URL.", "\"image\": \"data:image/jpeg;base64,...\"")]
    public static async Task<JObject> ForwardMetadataImageRequest(Session session, string url)
    {
        (ImageFile image, string error) = await FetchMetadataImage(session, url);
        if (image is null)
        {
            return new JObject() { ["error"] = error ?? "Failed to fetch image." };
        }
        return new JObject() { ["image"] = image.AsDataString() };
    }

    [API.APIDescription("Fetches a remote preview image URL and saves it as the model preview image.", "\"success\": true")]
    public static async Task<JObject> SetModelPreviewFromMetadataUrl(Session session,
        [API.APIParameter("Exact filepath name of the model.")] string model,
        [API.APIParameter("Remote image URL to fetch.")] string image_url,
        [API.APIParameter("The model's sub-type, eg `Stable-Diffusion`, `LoRA`, etc.")] string subtype = "Stable-Diffusion",
        [API.APIParameter("Optional raw text of metadata to inject to the preview image.")] string preview_image_metadata = null)
    {
        Logs.Debug($"SetModelPreviewFromMetadataUrl requested for model '{model}' ({subtype}) from '{image_url}' by user '{session.User.UserID}'");
        if (!Program.T2IModelSets.TryGetValue(subtype, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid sub-type." };
        }
        if (ModelsAPI.TryGetRefusalForModel(session, model, out JObject refusal))
        {
            return refusal;
        }
        T2IModel actualModel = null;
        using (ManyReadOneWriteLock.ReadClaim claim = Program.RefreshLock.LockRead())
        {
            if (!handler.Models.TryGetValue(model, out actualModel))
            {
                return new JObject() { ["error"] = "Model not found." };
            }
        }
        (ImageFile previewImage, string error) = await FetchMetadataImage(session, image_url);
        if (previewImage is null)
        {
            return new JObject() { ["error"] = error ?? "Failed to fetch image." };
        }
        ImageFile converted = previewImage.ToMetadataJpg(preview_image_metadata);
        if (converted is null)
        {
            return new JObject() { ["error"] = "Failed to process preview image." };
        }
        lock (handler.ModificationLock)
        {
            actualModel.Metadata ??= new();
            actualModel.PreviewImage = converted.AsDataString();
            actualModel.Metadata.PreviewImage = actualModel.PreviewImage;
        }
        handler.ResetMetadataFrom(actualModel);
        _ = Utilities.RunCheckedTask(() => actualModel.ResaveModel(), "model resave");
        Interlocked.Increment(ref ModelsAPI.ModelEditID);
        Logs.Debug($"SetModelPreviewFromMetadataUrl succeeded for model '{model}' ({subtype})");
        return new JObject() { ["success"] = true };
    }
}
