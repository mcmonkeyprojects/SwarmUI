using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System;
using System.IO;
using System.Net.WebSockets;
using ISImage = SixLabors.ImageSharp.Image;

namespace SwarmUI.Builtin_ImageBatchToolExtension;

/// <summary>Extension that adds a tool to generate batches of image-inputs.</summary>
public class ImageBatchToolExtension : Extension
{
    public static PermInfo PermUseImageBatchTool = Permissions.Register(new("imagebatcher_use_image_batcher", "[Image Batch Tool] Use Image Batcher", "If true, the user may use the Image Batcher tool. Only makes sense for localhost users.", PermissionDefault.ADMINS, Permissions.GroupUser));

    public override void OnPreInit()
    {
        ScriptFiles.Add("Assets/image_batcher.js");
    }

    public override void OnInit()
    {
        API.RegisterAPICall(ImageBatchRun, true, PermUseImageBatchTool);
    }

    /// <summary>API route to generate images with WebSocket updates.</summary>
    public static async Task<JObject> ImageBatchRun(WebSocket socket, Session session, JObject rawInput, string input_folder, string output_folder, bool init_image, bool revision, bool controlnet, string resMode, bool append_filename_to_prompt)
    {
        // TODO: Strict path validation / user permission confirmation.
        if (input_folder.Length < 5 || output_folder.Length < 5)
        {
            await socket.SendAndReportError($"ImageBatchRun request from {session.User.UserID}", "Input or output folder looks invalid, please fill it in carefully.", API.WebsocketTimeout);
            return null;
        }
        input_folder = Path.GetFullPath(input_folder);
        output_folder = Path.GetFullPath(output_folder);
        if (!Directory.Exists(input_folder))
        {
            await socket.SendAndReportError($"ImageBatchRun request from {session.User.UserID}, for folder '{input_folder}'", "Input folder does not exist", API.WebsocketTimeout);
            return null;
        }
        if (input_folder == output_folder)
        {
            await socket.SendAndReportError($"ImageBatchRun request from {session.User.UserID}, for folder '{input_folder}'", "Input and output folder cannot be the same", API.WebsocketTimeout);
            return null;
        }
        string[] imageFiles = [.. Directory.EnumerateFiles(input_folder).Where(f => f.EndsWith(".png") || f.EndsWith(".jpg") || f.EndsWith(".jpeg") || f.EndsWith(".webp"))];
        if (imageFiles.Length == 0)
        {
            await socket.SendAndReportError($"ImageBatchRun request from {session.User.UserID}, for folder '{input_folder}'", "Input folder does not contain any images", API.WebsocketTimeout);
            return null;
        }
        if (!init_image && !revision && !controlnet)
        {
            await socket.SendAndReportError($"ImageBatchRun request from {session.User.UserID}, for folder '{input_folder}'", "Image batch needs to supply the images to at least one parameter.", API.WebsocketTimeout);
            return null;
        }
        Directory.CreateDirectory(output_folder);
        await API.RunWebsocketHandlerCallWS(GenBatchRun_Internal, session, (rawInput, input_folder, output_folder, init_image, revision, controlnet, imageFiles, resMode, append_filename_to_prompt), socket);
        Logs.Info("Image Batcher completed successfully");
        await socket.SendJson(new JObject() { ["success"] = "complete" }, API.WebsocketTimeout);
        return null;
    }

    public static async Task GenBatchRun_Internal(Session session, (JObject, string, string, bool, bool, bool, string[], string, bool) input, Action<JObject> output, bool isWS)
    {
        // TODO: This is a silly way of passing data, time for a struct?
        (JObject rawInput, string input_folder, string output_folder, bool init_image, bool revision, bool controlnet, string[] imageFiles, string resMode, bool appendFilenameToPrompt) = input;
        using Session.GenClaim claim = session.Claim(gens: imageFiles.Length);
        async Task sendStatus()
        {
            output(BasicAPIFeatures.GetCurrentStatusRaw(session));
        }
        await sendStatus();
        string finalError = null;
        long failureCount = 0;
        void setError(string message)
        {
            Volatile.Write(ref finalError, message);
            Interlocked.Increment(ref failureCount);
            Logs.Warning($"Failed while running image-batch-gen for {session.User.UserID}: {message}");
        }
        T2IParamInput baseParams;
        try
        {
            baseParams = T2IAPI.RequestToParams(session, rawInput["baseParams"] as JObject);
        }
        catch (SwarmReadableErrorException ex)
        {
            output(new JObject() { ["error"] = ex.Message });
            return;
        }
        List<Task> tasks = [];
        void removeDoneTasks()
        {
            for (int i = 0; i < tasks.Count; i++)
            {
                if (tasks[i].IsCompleted)
                {
                    if (tasks[i].IsFaulted)
                    {
                        Logs.Error($"Image generation failed: {tasks[i].Exception}");
                    }
                    tasks.RemoveAt(i--);
                }
            }
        }
        int max_degrees = session.User.CalcMaxT2ISimultaneous;
        int batchId = 0;
        foreach (string file in imageFiles)
        {
            string fname = file.Replace('\\', '/').AfterLast('/');
            int imageIndex = batchId++;
            removeDoneTasks();
            while (tasks.Count > max_degrees)
            {
                await Task.WhenAny(tasks);
                removeDoneTasks();
            }
            if (claim.ShouldCancel)
            {
                break;
            }
            Image image = new(File.ReadAllBytes(file), Image.ImageType.IMAGE, file.AfterLast('.'));
            ISImage imgData = image.ToIS;
            T2IParamInput param = baseParams.Clone();
            void setRes(int width, int height)
            {
                param.Set(T2IParamTypes.Width, width);
                param.Set(T2IParamTypes.Height, height);
                param.Remove(T2IParamTypes.AspectRatio);
                param.Remove(T2IParamTypes.AltResolutionHeightMult);
                param.Remove(T2IParamTypes.RawResolution);
            }
            if (appendFilenameToPrompt)
            {
                param.Set(T2IParamTypes.Prompt, $"{param.Get(T2IParamTypes.Prompt)} {fname.BeforeLast('.')}".Trim());
            }
            switch (resMode)
            {
                case "From Parameter":
                    break;
                case "From Image":
                    setRes(imgData.Width, imgData.Height);
                    break;
                case "Scale To Model":
                    (int width, int height) = Utilities.ResToModelFit(imgData.Width, imgData.Height, param.Get(T2IParamTypes.Model));
                    setRes(width, height);
                    break;
                case "Scale To Model Or Above":
                    (width, height) = Utilities.ResToModelFit(imgData.Width, imgData.Height, param.Get(T2IParamTypes.Model));
                    if (width < imgData.Width || height < imgData.Height)
                    {
                        setRes(imgData.Width, imgData.Height);
                    }
                    else
                    {
                        setRes(width, height);
                    }
                    break;
                default:
                    throw new SwarmUserErrorException("Invalid resolution mode");
            }
            if (init_image)
            {
                param.Set(T2IParamTypes.InitImage, image);
            }
            if (revision)
            {
                List<Image> imgs = [.. param.Get(T2IParamTypes.PromptImages, []), image];
                param.Set(T2IParamTypes.PromptImages, imgs);
            }
            if (controlnet)
            {
                foreach (T2IParamTypes.ControlNetParamHolder controlnetParams in T2IParamTypes.Controlnets)
                {
                    param.Set(controlnetParams.Image, image);
                }
            }
            param.ApplySpecialLogic();
            int genId = 0;
            tasks.Add(T2IEngine.CreateImageTask(param, $"{imageIndex}", claim, output, setError, isWS, Program.ServerSettings.Backends.PerRequestTimeoutMinutes, (image, metadata) =>
            {
                (string preExt, string ext) = fname.BeforeAndAfterLast('.');
                string properExt = image.Img.Extension;
                if (properExt == "png" && ext != "png")
                {
                    ext = "png";
                }
                else if (properExt == "jpg" && ext != "jpg" && ext != "jpeg")
                {
                    ext = "jpg";
                }
                else if (properExt == "webp" && ext != "webp")
                {
                    ext = "webp";
                }
                else if (!string.IsNullOrWhiteSpace(properExt))
                {
                    ext = properExt;
                }
                int curGen = Interlocked.Increment(ref genId);
                string diffCode = curGen == 1 ? "" : $"-{curGen}";
                string actualFile = $"{output_folder}/{preExt}{diffCode}";
                File.WriteAllBytes($"{actualFile}.{ext}", image.Img.ImageData);
                if (!ImageMetadataTracker.ExtensionsWithMetadata.Contains(ext) && !string.IsNullOrWhiteSpace(metadata))
                {
                    File.WriteAllBytes($"{actualFile}.swarm.json", metadata.EncodeUTF8());
                }
                string img = session.GetImageB64(image.Img);
                output(new JObject() { ["image"] = img, ["batch_index"] = $"{imageIndex}", ["request_id"] = $"{baseParams.UserRequestId}", ["metadata"] = string.IsNullOrWhiteSpace(metadata) ? null : metadata });
                WebhookManager.SendEveryGenWebhook(param, img, image.Img);
            }));
        }
        while (tasks.Any())
        {
            await Task.WhenAny(tasks);
            removeDoneTasks();
        }
        WebhookManager.SendManualAtEndWebhook(baseParams);
        claim.Dispose();
        await sendStatus();
        finalError = Volatile.Read(ref finalError);
        if (finalError is not null)
        {
            Logs.Error($"Image edit batch had {failureCount} errors while running.");
            output(new JObject() { ["error"] = $"{failureCount} images in the batch failed, including: {finalError}" });
            return;
        }
    }
}
