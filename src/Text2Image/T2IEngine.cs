using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Diagnostics;
using System.IO;

namespace SwarmUI.Text2Image
{
    /// <summary>Central core handler for text-to-image processing.</summary>
    public static class T2IEngine
    {
        /// <summary>Extension event, fired before images will be generated, just after the request is received.
        /// No backend is claimed yet.
        /// Use <see cref="SwarmReadableErrorException"/> for a user-readable refusal message.</summary>
        public static Action<PreGenerationEventParams> PreGenerateEvent;

        public record class PreGenerationEventParams(T2IParamInput UserInput);

        /// <summary>Extension event, fired after images were generated, but before saving the result.
        /// Backend is already released, but the gen request is not marked completed.
        /// Ran before metadata is applied.
        /// Use "RefuseImage" to mark an image as refused. Note that generation previews may have already been shown to a user, if that feature is enabled on the server.
        /// Use <see cref="SwarmReadableErrorException"/> for a user-readable hard-refusal message.</summary>
        public static Action<PostGenerationEventParams> PostGenerateEvent;

        /// <summary>Paramters for <see cref="PostGenerateEvent"/>.</summary>
        public record class PostGenerationEventParams(MediaFile File, T2IParamInput UserInput, Action RefuseImage);

        /// <summary>Extension event, fired after a batch of images were generated.
        /// Use "RefuseImage" to mark an image as removed. Note that it may have already been shown to a user, when the live result websocket API is in use.</summary>
        public static Action<PostBatchEventParams> PostBatchEvent;

        /// <summary>Feature flags that don't block a backend from running, such as model-specific flags.</summary>
        public static HashSet<string> DisregardedFeatureFlags = ["sd3", "flux-dev", "text2video", "cascade", "sdxl"];

        /// <summary>Parameters for <see cref="PostBatchEvent"/>.</summary>
        public record class PostBatchEventParams(T2IParamInput UserInput, ImageOutput[] Images);

        /// <summary>Micro-class that represents an image-output and key related details.</summary>
        public class ImageOutput
        {
            /// <summary>The generated media file.</summary>
            public MediaFile File;

            /// <summary>The generated image.</summary>
            [Obsolete("Use File instead")]
            public Image Img
            {
                get => File as Image;
                set => File = value;
            }

            /// <summary>An async task to get the actual final filedata meant to be saved to file.</summary>
            public Task<MediaFile> ActualFileTask;

            /// <summary>The time in milliseconds it took to generate, or -1 if unknown.</summary>
            public long GenTimeMS = -1;

            /// <summary>If true, the file is a real final output. If false, there is something non-standard about this file (eg it's a secondary preview) and so should be excluded from grids/etc.</summary>
            public bool IsReal = true;

            /// <summary>An action that will remove/discard this file as relevant.</summary>
            public Action RefuseImage;
        }

        /// <summary>List of functions that take a pair of userinput and backend, and returns true if they can fit together, or false if the pair is not valid (add to user_input.RefusalReasons if so).</summary>
        public static List<Func<T2IParamInput, BackendHandler.T2IBackendData, bool>> AltBackendValidators = [];

        /// <summary>Helper to create a function to match a backend to a user input request.</summary>
        public static Func<BackendHandler.T2IBackendData, bool> BackendMatcherFor(T2IParamInput user_input)
        {
            string type = user_input.Get(T2IParamTypes.BackendType, "any");
            bool requireId = user_input.TryGet(T2IParamTypes.ExactBackendID, out string reqIdStr);
            int reqId = requireId ? int.Parse(reqIdStr) : -1;
            string typeLow = type.ToLowerFast();
            return backend =>
            {
                if (!backend.Backend.CanLoadModels)
                {
                    Logs.Verbose($"Filter out backend {backend.ID} as it is marked as unable to load models (eg generic placeholder backend, this is not an important refusal)");
                    return false;
                }
                if (typeLow != "any" && typeLow != backend.Backend.HandlerTypeData.ID.ToLowerFast())
                {
                    Logs.Verbose($"Filter out backend {backend.ID} as the Type is specified as {typeLow}, but the backend type is {backend.Backend.HandlerTypeData.ID.ToLowerFast()}");
                    user_input.RefusalReasons.Add($"Specific backend type requested in advanced parameters did not match");
                    return false;
                }
                if (requireId && backend.ID != reqId && (backend.Parent?.ID ?? int.MaxValue) != reqId)
                {
                    Logs.Verbose($"Filter out backend {backend.ID} as the request requires backend ID {reqId}, but the backend ID is {backend.ID}");
                    user_input.RefusalReasons.Add($"Specific backend ID# requested in advanced parameters did not match");
                    return false;
                }
                HashSet<string> features = [.. backend.Backend.SupportedFeatures];
                foreach (string flag in user_input.RequiredFlags)
                {
                    if (!features.Contains(flag) && !DisregardedFeatureFlags.Contains(flag))
                    {
                        Logs.Verbose($"Filter out backend {backend.ID} as the request requires flag {flag}, but the backend does not support it");
                        user_input.RefusalReasons.Add($"Request requires flag '{flag}' which is not present on the backend");
                        return false;
                    }
                }
                if (backend.Backend.Models is not null)
                {
                    bool requireModel(T2IRegisteredParam<T2IModel> param, string type)
                    {
                        if (user_input.TryGet(param, out T2IModel model) && model.Name.ToLowerFast() != "(none)" && backend.Backend.Models.TryGetValue(type, out List<string> models) && !models.Contains(model.Name) && !models.Contains(model.Name + ".safetensors"))
                        {
                            Logs.Verbose($"Filter out backend {backend.ID} as the request requires {type} model {model.Name}, but the backend does not have that model");
                            user_input.RefusalReasons.Add($"Request requires model '{model.Name}' but the backend does not have that model");
                            return false;
                        }
                        return true;
                    }
                    if (!requireModel(T2IParamTypes.Model, "Stable-Diffusion") || !requireModel(T2IParamTypes.RefinerModel, "Stable-Diffusion") || !requireModel(T2IParamTypes.VAE, "VAE"))
                    {
                        return false;
                    }
                    if (!requireModel(T2IParamTypes.ClipGModel, "Clip") || !requireModel(T2IParamTypes.ClipLModel, "Clip") || !requireModel(T2IParamTypes.T5XXLModel, "Clip"))
                    {
                        return false;
                    }
                    foreach (T2IParamTypes.ControlNetParamHolder controlnet in T2IParamTypes.Controlnets)
                    {
                        if (!requireModel(controlnet.Model, "ControlNet"))
                        {
                            return false;
                        }
                    }
                    if (user_input.TryGet(T2IParamTypes.Loras, out List<string> loras) && backend.Backend.Models.TryGetValue("LoRA", out List<string> loraModels))
                    {
                        foreach (string lora in loras)
                        {
                            if (!loraModels.Contains(lora) && !loraModels.Contains(lora + ".safetensors"))
                            {
                                Logs.Verbose($"Filter out backend {backend.ID} as the request requires lora {lora}, but the backend does not have that lora");
                                user_input.RefusalReasons.Add($"Request requires LoRA '{lora}' but the backend does not have that LoRA");
                                return false;
                            }
                        }
                    }
                    if (user_input.ExtraMeta.TryGetValue("used_embeddings", out object usedEmbeds) && backend.Backend.Models.TryGetValue("Embedding", out List<string> embedModels))
                    {
                        foreach (string embed in (List<string>)usedEmbeds)
                        {
                            if (!embedModels.Contains(embed) && !embedModels.Contains(embed + ".safetensors"))
                            {
                                Logs.Verbose($"Filter out backend {backend.ID} as the request requires embedding {embed}, but the backend does not have that embedding");
                                user_input.RefusalReasons.Add($"Request requires embedding '{embed}' but the backend does not have that embedding");
                                return false;
                            }
                        }
                    }
                }
                if (!backend.Backend.IsValidForThisBackend(user_input))
                {
                    return false;
                }
                foreach (Func<T2IParamInput, BackendHandler.T2IBackendData, bool> validator in AltBackendValidators)
                {
                    if (!validator(user_input, backend))
                    {
                        return false;
                    }
                }
                return true;
            };
        }

        /// <summary>Internal handler route to create an image based on a user request.</summary>
        public static async Task CreateImageTask(T2IParamInput user_input, string batchId, Session.GenClaim claim, Action<JObject> output, Action<string> setError, bool isWS, Action<ImageOutput, string> saveImages)
        {
            await CreateImageTask(user_input, batchId, claim, output, setError, isWS, Program.ServerSettings.Backends.PerRequestTimeoutMinutes, saveImages, true);
        }

        /// <summary>Internal handler route to create an image based on a user request.</summary>
        public static async Task CreateImageTask(T2IParamInput user_input, string batchId, Session.GenClaim claim, Action<JObject> output, Action<string> setError, bool isWS, float backendTimeoutMin, Action<ImageOutput, string> saveImages, bool canCallTools)
        {
            long timeStart = Environment.TickCount64;
            void sendStatus()
            {
                if (isWS && user_input.SourceSession is not null)
                {
                    output(BasicAPIFeatures.GetCurrentStatusRaw(user_input.SourceSession));
                }
            }
            if (claim.ShouldCancel)
            {
                return;
            }
            long prepTime = Environment.TickCount64;
            int numImagesGenned = 0;
            long lastGenTime = Environment.TickCount64;
            string genTimeReport = "? failed!";
            void handleFileOutput(ImageOutput img)
            {
                lastGenTime = Environment.TickCount64;
                if (img.GenTimeMS < 0)
                {
                    img.GenTimeMS = Environment.TickCount64 - prepTime;
                }
                long fullTime = Environment.TickCount64 - timeStart;
                string format(long t)
                {
                    double sec = t / 1000.0;
                    return sec > 120 ? $"{sec / 60:0.00} min" : $"{sec:0.00} sec";
                }
                genTimeReport = $"{format(fullTime - img.GenTimeMS)} (prep) and {format(img.GenTimeMS)} (gen)".Trim();
                T2IParamInput copyInput = user_input.Clone();
                copyInput.ExtraMeta["prep_time"] = format(fullTime - img.GenTimeMS);
                copyInput.ExtraMeta["generation_time"] = format(img.GenTimeMS);
                if (!img.IsReal)
                {
                    copyInput.ExtraMeta["intermediate"] = "intermediate output";
                }
                bool refuse = false;
                PostGenerateEvent?.Invoke(new(img.File, copyInput, () => refuse = true));
                if (refuse)
                {
                    Logs.Info($"Refused an image.");
                }
                else
                {
                    (Task<MediaFile> imgTask, string metadata) = copyInput.SourceSession.ApplyMetadata(img.File, copyInput, numImagesGenned, true);
                    img.ActualFileTask = imgTask;
                    saveImages(img, metadata);
                    numImagesGenned++;
                }
            }
            if (canCallTools)
            {
                string prompt = user_input.Get(T2IParamTypes.Prompt);
                if (prompt is not null && prompt.Contains("<object:"))
                {
                    Image multiImg = await T2IMultiStepObjectBuilder.CreateFullImage(prompt, user_input, batchId, claim, output, setError, isWS, backendTimeoutMin);
                    if (multiImg is not null)
                    {
                        user_input = user_input.Clone();
                        user_input.Set(T2IParamTypes.InitImage, multiImg);
                        double cleanup = user_input.Get(T2IParamTypes.RegionalObjectCleanupFactor, 0);
                        if (cleanup == 0)
                        {
                            handleFileOutput(new() { File = multiImg, IsReal = true, GenTimeMS = -1, RefuseImage = null });
                            return;
                        }
                        user_input.Set(T2IParamTypes.InitImageCreativity, cleanup);
                        foreach (T2IParamTypes.ControlNetParamHolder controlnet in T2IParamTypes.Controlnets)
                        {
                            user_input.Remove(controlnet.Model);
                            user_input.Remove(controlnet.Strength);
                        }
                    }
                }
            }
            T2IBackendAccess backend;
            try
            {
                user_input.ApplyLateSpecialLogic();
                PreGenerateEvent?.Invoke(new(user_input));
                claim.Extend(backendWaits: 1);
                sendStatus();
                backend = await Program.Backends.GetNextT2IBackend(TimeSpan.FromMinutes(backendTimeoutMin), user_input.Get(T2IParamTypes.Model), user_input,
                    filter: BackendMatcherFor(user_input), session: user_input.SourceSession, notifyWillLoad: sendStatus, cancel: claim.InterruptToken);
            }
            catch (SwarmReadableErrorException ex)
            {
                setError($"{ex.Message}");
                return;
            }
            catch (TimeoutException)
            {
                setError("Timeout! All backends are occupied with other tasks.");
                return;
            }
            finally
            {
                claim.Complete(backendWaits: 1);
                sendStatus();
            }
            if (claim.ShouldCancel)
            {
                backend?.Dispose();
                return;
            }
            try
            {
                claim.Extend(liveGens: 1);
                sendStatus();
                using (backend)
                {
                    if (claim.ShouldCancel)
                    {
                        return;
                    }
                    prepTime = Environment.TickCount64;
                    await backend.Backend.GenerateLive(user_input, batchId, obj =>
                    {
                        if (obj is MediaFile file)
                        {
                            handleFileOutput(new() { File = file });
                        }
                        else if (obj is ImageOutput imgOut)
                        {
                            handleFileOutput(imgOut);
                        }
                        else
                        {
                            output(new JObject() { ["gen_progress"] = (JToken)obj });
                        }
                    });
                    if (numImagesGenned == 0)
                    {
                        if (claim.ShouldCancel)
                        {
                            Logs.Info("Generation session interrupted.");
                            setError("Generation session interrupted.");
                        }
                        else
                        {
                            Logs.Info("No images were generated (all refused, or failed).");
                            setError("No images were generated (all refused, or failed - check server logs for details).");
                        }
                    }
                    else if (numImagesGenned == 1)
                    {
                        Logs.Info($"Generated an image in {genTimeReport}");
                    }
                    else
                    {
                        long averageMs = (lastGenTime - prepTime) / numImagesGenned;
                        Logs.Info($"Generated {numImagesGenned} images in {(Environment.TickCount64 - timeStart) / 1000.0:0.00} seconds ({averageMs / 1000.0:0.00} seconds per image)");
                    }
                }
            }
            catch (Exception ex)
            {
                if (ex is AggregateException ae)
                {
                    while (ae.InnerException is AggregateException e2 && e2 != ex && e2 != ae)
                    {
                        ae = e2;
                        ex = e2;
                    }
                }
                if (ex is AbstractBackend.PleaseRedirectException)
                {
                    claim.Extend(gens: 1);
                    await CreateImageTask(user_input, batchId, claim, output, setError, isWS, backendTimeoutMin, saveImages, false);
                }
                else if (ex is SwarmReadableErrorException)
                {
                    setError($"{ex.Message}");
                    return;
                }
                else if (ex.InnerException is SwarmReadableErrorException ex2)
                {
                    setError($"{ex2.Message}");
                    return;
                }
                else if (ex is TaskCanceledException)
                {
                    return;
                }
                else
                {
                    Logs.Error($"Internal error processing T2I request: {ex.ReadableString()}");
                    setError("Something went wrong while generating images.");
                    return;
                }
            }
            finally
            {
                claim.Complete(gens: 1, liveGens: 1);
                sendStatus();
            }
        }
    }
}
