using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using System.IO;
using System.Net.Http;

namespace SwarmUI.WebAPI;

[API.APIClass("API routes used by the experimental React frontend bridge.")]
public static class ReactBridgeAPI
{
    public static void Register()
    {
        API.RegisterAPICall(ForwardMetadataImageRequest, false, Permissions.EditModelMetadata);
        API.RegisterAPICall(SetModelPreviewFromMetadataUrl, true, Permissions.EditModelMetadata);
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
