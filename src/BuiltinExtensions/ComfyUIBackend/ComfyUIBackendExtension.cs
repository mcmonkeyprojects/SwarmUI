using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Microsoft.AspNetCore.Builder;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.IO;
using System.Net.Http;

namespace SwarmUI.Builtin_ComfyUIBackend;

/// <summary>Main class for the ComfyUI Backend extension.</summary>
public class ComfyUIBackendExtension : Extension
{
    /// <summary>Copy of <see cref="Extension.FilePath"/> for ComfyUI.</summary>
    public static string Folder;

    public static PermInfoGroup ComfyPermGroup = new("ComfyUI", "Permissions related to direct interaction with the ComfyUI backend.");

    public static PermInfo PermDirectCalls = Permissions.Register(new("comfy_direct_calls", "ComfyUI Direct Calls", "Allows the user to make direct calls to the ComfyUI backend. Required for most ComfyUI features.", PermissionDefault.POWERUSERS, ComfyPermGroup));
    public static PermInfo PermBackendGenerate = Permissions.Register(new("comfy_backend_generate", "ComfyUI Backend Generate", "Allows the user to generate directly from the ComfyUI backend.", PermissionDefault.POWERUSERS, ComfyPermGroup));
    public static PermInfo PermDynamicCustomWorkflows = Permissions.Register(new("comfy_dynamic_custom_workflows", "ComfyUI Dynamic Custom Workflows", "Allows the user to use dynamic custom workflows via Generate tab parameters.", PermissionDefault.POWERUSERS, ComfyPermGroup));
    public static PermInfo PermStoredCustomWorkflows = Permissions.Register(new("comfy_stored_custom_workflows", "ComfyUI Stored Custom Workflows", "Allows the user to use stored (already saved by a user with direct access) custom workflows via Generate tab parameters.", PermissionDefault.POWERUSERS, ComfyPermGroup));
    public static PermInfo PermReadWorkflows = Permissions.Register(new("comfy_read_workflows", "ComfyUI Read Workflows", "Allows the user read stored workflow data.", PermissionDefault.POWERUSERS, ComfyPermGroup));
    public static PermInfo PermEditWorkflows = Permissions.Register(new("comfy_edit_workflows", "ComfyUI Edit Workflows", "Allows the save, delete, or edit stored workflows.", PermissionDefault.POWERUSERS, ComfyPermGroup));

    public record class ComfyCustomWorkflow(string Name, string Workflow, string Prompt, string CustomParams, string ParamValues, string Image, string Description, bool EnableInSimple);

    /// <summary>All current custom workflow IDs mapped to their data.</summary>
    public static ConcurrentDictionary<string, ComfyCustomWorkflow> CustomWorkflows = new();

    /// <summary>Set of all feature-ids supported by ComfyUI backends.</summary>
    public static HashSet<string> FeaturesSupported = ["comfyui", "refiners", "controlnet", "endstepsearly", "seamless", "video", "variation_seed", "freeu", "yolov8"];

    /// <summary>Set of feature-ids that were added presumptively during loading and should be removed if the backend turns out to be missing them.</summary>
    public static HashSet<string> FeaturesDiscardIfNotFound = ["variation_seed", "freeu", "yolov8"];

    /// <summary>Extensible map of ComfyUI Node IDs to supported feature IDs.</summary>
    public static Dictionary<string, string> NodeToFeatureMap = new()
    {
        ["SwarmLoadImageB64"] = "comfy_loadimage_b64",
        ["SwarmSaveImageWS"] = "comfy_saveimage_ws",
        ["SwarmJustLoadTheModelPlease"] = "comfy_just_load_model",
        ["SwarmLatentBlendMasked"] = "comfy_latent_blend_masked",
        ["SwarmKSampler"] = "variation_seed",
        ["FreeU"] = "freeu",
        ["AITemplateLoader"] = "aitemplate",
        ["IPAdapter"] = "ipadapter",
        ["IPAdapterApply"] = "ipadapter",
        ["IPAdapterModelLoader"] = "cubiqipadapter",
        ["IPAdapterUnifiedLoader"] = "cubiqipadapterunified",
        ["MiDaS-DepthMapPreprocessor"] = "controlnetpreprocessors",
        ["RIFE VFI"] = "frameinterps",
        ["Sam2Segmentation"] = "sam2",
        ["SwarmYoloDetection"] = "yolov8",
        ["PixArtCheckpointLoader"] = "extramodelspixart",
        ["SanaCheckpointLoader"] = "extramodelssana",
        ["CheckpointLoaderNF4"] = "bnb_nf4",
        ["UnetLoaderGGUF"] = "gguf",
        ["TensorRTLoader"] = "tensorrt",
        ["TeaCacheForImgGen"] = "teacache"
    };

    /// <inheritdoc/>
    public override void OnPreInit()
    {
        Folder = FilePath;
        LoadWorkflowFiles();
        Program.ModelRefreshEvent += Refresh;
        Program.ModelPathsChangedEvent += OnModelPathsChanged;
        ScriptFiles.Add("Assets/comfy_workflow_editor_helper.js");
        StyleSheetFiles.Add("Assets/comfy_workflow_editor.css");
        T2IParamTypes.FakeTypeProviders.Add(DynamicParamGenerator);
        // Temporary: remove old pycache files where we used to have python files, to prevent Comfy boot errors
        Utilities.RemoveBadPycacheFrom($"{FilePath}/ExtraNodes");
        Utilities.RemoveBadPycacheFrom($"{FilePath}/ExtraNodes/SwarmWebHelper");
        T2IAPI.AlwaysTopKeys.Add("comfyworkflowraw");
        T2IAPI.AlwaysTopKeys.Add("comfyworkflowparammetadata");
        if (Directory.Exists($"{FilePath}/DLNodes/ComfyUI_IPAdapter_plus"))
        {
            FeaturesSupported.UnionWith(["ipadapter", "cubiqipadapterunified"]);
            FeaturesDiscardIfNotFound.UnionWith(["ipadapter", "cubiqipadapterunified"]);
        }
        if (Directory.Exists($"{FilePath}/DLNodes/comfyui_controlnet_aux"))
        {
            FeaturesSupported.UnionWith(["controlnetpreprocessors"]);
            FeaturesDiscardIfNotFound.UnionWith(["controlnetpreprocessors"]);
        }
        if (Directory.Exists($"{FilePath}/DLNodes/ComfyUI-Frame-Interpolation"))
        {
            FeaturesSupported.UnionWith(["frameinterps"]);
            FeaturesDiscardIfNotFound.UnionWith(["frameinterps"]);
        }
        if (Directory.Exists($"{FilePath}/DLNodes/ComfyUI-segment-anything-2"))
        {
            FeaturesSupported.UnionWith(["sam2"]);
            FeaturesDiscardIfNotFound.UnionWith(["sam2"]);
        }
        if (Directory.Exists($"{FilePath}/DLNodes/ComfyUI_bitsandbytes_NF4"))
        {
            FeaturesSupported.UnionWith(["bnb_nf4"]);
            FeaturesDiscardIfNotFound.UnionWith(["bnb_nf4"]);
        }
        if (Directory.Exists($"{FilePath}/DLNodes/ComfyUI-GGUF"))
        {
            FeaturesSupported.UnionWith(["gguf"]);
            FeaturesDiscardIfNotFound.UnionWith(["gguf"]);
        }
        if (Directory.Exists($"{FilePath}/DLNodes/ComfyUI-TeaCache"))
        {
            FeaturesSupported.UnionWith(["teacache"]);
            FeaturesDiscardIfNotFound.UnionWith(["teacache"]);
        }
        T2IParamTypes.ConcatDropdownValsClean(ref UpscalerModels, InternalListModelsFor("upscale_models", true).Select(u => $"model-{u}///Model: {u}"));
        T2IParamTypes.ConcatDropdownValsClean(ref YoloModels, InternalListModelsFor("yolov8", false));
        T2IParamTypes.ConcatDropdownValsClean(ref GligenModels, InternalListModelsFor("gligen", false));
        T2IParamTypes.ConcatDropdownValsClean(ref StyleModels, InternalListModelsFor("style_models", true));
        SwarmSwarmBackend.OnSwarmBackendAdded += OnSwarmBackendAdded;
    }

    /// <summary>Helper to quickly read a list of model files in a model subfolder, for prepopulating model lists during startup.</summary>
    public static string[] InternalListModelsFor(string subpath, bool createDir)
    {
        string path = Utilities.CombinePathWithAbsolute(Program.ServerSettings.Paths.ActualModelRoot, subpath);
        if (createDir)
        {
            Directory.CreateDirectory(path);
        }
        else if (!Directory.Exists(path))
        {
            return [];
        }
        static bool isModelFile(string f) => T2IModel.LegacyModelExtensions.Contains(f.AfterLast('.')) || T2IModel.NativelySupportedModelExtensions.Contains(f.AfterLast('.'));
        return [.. Directory.EnumerateFiles(path, "*.*", SearchOption.AllDirectories).Where(isModelFile).Select(f => Path.GetRelativePath(path, f))];
    }

    /// <inheritdoc/>
    public override void OnShutdown()
    {
        T2IParamTypes.FakeTypeProviders.Remove(DynamicParamGenerator);
    }

    /// <summary>Forces all currently running comfy backends to restart.</summary>
    public static async Task RestartAllComfyBackends()
    {
        List<Task> tasks = [];
        foreach (ComfyUIAPIAbstractBackend backend in RunningComfyBackends)
        {
            tasks.Add(Program.Backends.ReloadBackend(backend.BackendData));
        }
        await Task.WhenAll(tasks);
    }

    public static T2IParamType FakeRawInputType = new("comfyworkflowraw", "", "", Type: T2IParamDataType.TEXT, ID: "comfyworkflowraw", FeatureFlag: "comfyui", HideFromMetadata: true), // TODO: Setting to toggle metadata
        FakeParameterMetadata = new("comfyworkflowparammetadata", "", "", Type: T2IParamDataType.TEXT, ID: "comfyworkflowparammetadata", FeatureFlag: "comfyui", HideFromMetadata: true);

    public static SingleCacheAsync<string, JObject> ParameterMetadataCacheHelper = new(s => s.ParseToJson());

    public T2IParamType DynamicParamGenerator(string name, T2IParamInput context)
    {
        try
        {
            if (!context.SourceSession?.User?.HasPermission(PermDynamicCustomWorkflows) ?? false)
            {
                return null;
            }
            if (name == "comfyworkflowraw")
            {
                return FakeRawInputType;
            }
            if (name == "comfyworkflowparammetadata")
            {
                return FakeParameterMetadata;
            }
            if (context.TryGetRaw(FakeParameterMetadata, out object paramMetadataObj))
            {
                JObject paramMetadata = ParameterMetadataCacheHelper.GetValue((string)paramMetadataObj);
                if (paramMetadata.TryGetValue(name, out JToken paramTok))
                {
                    T2IParamType type = T2IParamType.FromNet((JObject)paramTok);
                    if (type.Type == T2IParamDataType.INTEGER && type.ViewType == ParamViewType.SEED)
                    {
                        string seedClean(string prior, string newVal)
                        {
                            int parsed = int.Parse(newVal);
                            if (parsed == -1)
                            {
                                int max = (int)type.Max;
                                parsed = Random.Shared.Next(0, max <= 0 ? int.MaxValue : max);
                            }
                            return parsed.ToString();
                        }
                        type = type with { Clean = seedClean };
                    }
                    return type;
                }
                //Logs.Verbose($"Failed to find param metadata for {name} in {paramMetadata.Properties().Select(p => p.Name).JoinString(", ")}");
            }
            if (name.StartsWith("comfyrawworkflowinput") && (context.ValuesInput.ContainsKey("comfyworkflowraw") || context.ValuesInput.ContainsKey("comfyuicustomworkflow")))
            {
                string nameNoPrefix = name.After("comfyrawworkflowinput");
                T2IParamDataType type = FakeRawInputType.Type;
                ParamViewType numberType = ParamViewType.BIG;
                Func<string, string, string> cleaner = null;
                if (nameNoPrefix.StartsWith("seed"))
                {
                    type = T2IParamDataType.INTEGER;
                    numberType = ParamViewType.SEED;
                    nameNoPrefix = nameNoPrefix.After("seed");
                    string seedClean(string prior, string newVal)
                    {
                        int parsed = int.Parse(newVal);
                        if (parsed == -1)
                        {
                            parsed = Random.Shared.Next(0, int.MaxValue);
                        }
                        return parsed.ToString();
                    }
                    cleaner = seedClean;
                }
                else
                {
                    foreach (T2IParamDataType possible in Enum.GetValues<T2IParamDataType>())
                    {
                        string typeId = possible.ToString().ToLowerFast();
                        if (nameNoPrefix.StartsWith(typeId))
                        {
                            nameNoPrefix = nameNoPrefix.After(typeId);
                            type = possible;
                            break;
                        }
                    }
                }
                T2IParamType resType = FakeRawInputType with { Name = nameNoPrefix, ID = name, HideFromMetadata = false, Type = type, ViewType = numberType, Clean = cleaner };
                if (type == T2IParamDataType.MODEL)
                {
                    static string cleanup(string _, string val)
                    {
                        val = val.Replace('\\', '/');
                        while (val.Contains("//"))
                        {
                            val = val.Replace("//", "/");
                        }
                        val = val.Replace('/', Path.DirectorySeparatorChar);
                        return val;
                    }
                    resType = resType with { Clean = cleanup };
                }
                return resType;
            }
        }
        catch (Exception e)
        {
            Logs.Error($"Error generating dynamic Comfy param {name}: {e}");
        }
        return null;
    }

    public static IEnumerable<ComfyUIAPIAbstractBackend> RunningComfyBackends => Program.Backends.RunningBackendsOfType<ComfyUIAPIAbstractBackend>();

    public static string[] ExampleWorkflowNames;

    public void LoadWorkflowFiles()
    {
        CustomWorkflows.Clear();
        Directory.CreateDirectory($"{FilePath}/CustomWorkflows");
        Directory.CreateDirectory($"{FilePath}/CustomWorkflows/Examples");
        string[] getCustomFlows(string path) => [.. Directory.EnumerateFiles($"{FilePath}/{path}", "*.*", new EnumerationOptions() { RecurseSubdirectories = true }).Select(f => f.Replace('\\', '/').After($"/{path}/")).Order()];
        ExampleWorkflowNames = getCustomFlows("ExampleWorkflows");
        string[] customFlows = getCustomFlows("CustomWorkflows");
        bool anyCopied = false;
        foreach (string workflow in ExampleWorkflowNames.Where(f => f.EndsWith(".json")))
        {
            if (!customFlows.Contains($"Examples/{workflow}") && !customFlows.Contains($"Examples/{workflow}.deleted"))
            {
                File.Copy($"{FilePath}/ExampleWorkflows/{workflow}", $"{FilePath}/CustomWorkflows/Examples/{workflow}");
                anyCopied = true;
            }
        }
        if (anyCopied)
        {
            customFlows = getCustomFlows("CustomWorkflows");
        }
        foreach (string workflow in customFlows.Where(f => f.EndsWith(".json")))
        {
            CustomWorkflows.TryAdd(workflow.BeforeLast('.'), null);
        }
    }

    public static ComfyCustomWorkflow GetWorkflowByName(string name)
    {
        if (!CustomWorkflows.TryGetValue(name, out ComfyCustomWorkflow workflow))
        {
            return null;
        }
        if (workflow is not null)
        {
            return workflow;
        }
        string path = $"{Folder}/CustomWorkflows/{name}.json";
        if (!File.Exists(path))
        {
            CustomWorkflows.TryRemove(name, out _);
            return null;
        }
        JObject json = File.ReadAllText(path).ParseToJson();
        string getStringFor(string key)
        {
            if (!json.TryGetValue(key, out JToken data))
            {
                return null;
            }
            if (data.Type == JTokenType.String)
            {
                return data.ToString();
            }
            return data.ToString(Formatting.None);
        }
        string workflowData = getStringFor("workflow");
        string prompt = getStringFor("prompt");
        string customParams = getStringFor("custom_params");
        string paramValues = getStringFor("param_values");
        string image = getStringFor("image") ?? "/imgs/model_placeholder.jpg";
        string description = getStringFor("description");
        bool enableInSimple = json.TryGetValue("enable_in_simple", out JToken enableInSimpleTok) && enableInSimpleTok.ToObject<bool>();
        workflow = new(name, workflowData, prompt, customParams, paramValues, image, description, enableInSimple);
        CustomWorkflows[name] = workflow;
        return workflow;
    }

    public void Refresh()
    {
        List<Task> tasks = [];
        try
        {
            ComfyUIRedirectHelper.ObjectInfoReadCacher.ForceExpire();
            LoadWorkflowFiles();
            foreach (ComfyUIAPIAbstractBackend backend in RunningComfyBackends.ToArray())
            {
                tasks.Add(backend.LoadValueSet(5));
            }
        }
        catch (Exception ex)
        {
            Logs.Error($"Error refreshing ComfyUI: {ex.ReadableString()}");
        }
        if (!tasks.Any())
        {
            return;
        }
        try
        {
            using CancellationTokenSource cancel = Utilities.TimedCancel(TimeSpan.FromMinutes(0.5));
            Task.WaitAll([.. tasks], cancel.Token);
        }
        catch (Exception ex)
        {
            Logs.Debug("ComfyUI refresh failed, will retry in background");
            Logs.Verbose($"Error refreshing ComfyUI: {ex.ReadableString()}");
            Utilities.RunCheckedTask(() =>
            {
                try
                {
                    using CancellationTokenSource cancel = Utilities.TimedCancel(TimeSpan.FromMinutes(5));
                    Task.WaitAll([.. tasks], cancel.Token);
                }
                catch (Exception ex2)
                {
                    Logs.Error($"Error refreshing ComfyUI: {ex2}");
                }
            });
        }
    }

    public void OnModelPathsChanged()
    {
        ComfyUISelfStartBackend.IsComfyModelFileEmitted = false;
        foreach (ComfyUISelfStartBackend backend in Program.Backends.RunningBackendsOfType<ComfyUISelfStartBackend>())
        {
            if (backend.IsEnabled)
            {
                Program.Backends.ReloadBackend(backend.BackendData).Wait(Program.GlobalProgramCancel);
            }
        }
    }

    public static async Task RunArbitraryWorkflowOnFirstBackend(string workflow, Action<object> takeRawOutput, bool allowRemote = true)
    {
        ComfyUIAPIAbstractBackend backend = RunningComfyBackends.FirstOrDefault(b => allowRemote || b is ComfyUISelfStartBackend) ?? throw new SwarmUserErrorException("No available ComfyUI Backend to run this operation");
        await backend.AwaitJobLive(workflow, "0", takeRawOutput, new(null), Program.GlobalProgramCancel);
    }

    public static void OnSwarmBackendAdded(SwarmSwarmBackend backend)
    {
        // TODO: Multi-layered forwarding? (Swarm connects to Swarm connects to Comfy)
        if (!backend.LinkedRemoteBackendType.StartsWith("comfyui_"))
        {
            return;
        }
        Utilities.RunCheckedTask(async () =>
        {
            HttpRequestMessage getReq = new(HttpMethod.Get, $"{backend.Address}/ComfyBackendDirect/object_info");
            backend.RequestAdapter()?.Invoke(getReq);
            getReq.Headers.Add("X-Swarm-Backend-ID", $"{backend.LinkedRemoteBackendID}");
            HttpResponseMessage resp = await SwarmSwarmBackend.HttpClient.SendAsync(getReq, Program.GlobalProgramCancel);
            JObject rawObjectInfo = (await resp.Content.ReadAsStringAsync()).ParseToJson();
            AssignValuesFromRaw(rawObjectInfo);
        });
    }

    public static LockObject ValueAssignmentLocker = new();
    
    /// <summary>Add handlers here to do additional parsing of RawObjectInfo data.</summary>
    public static List<Action<JObject>> RawObjectInfoParsers = [];

    public static void AssignValuesFromRaw(JObject rawObjectInfo)
    {
        lock (ValueAssignmentLocker)
        {
            if (rawObjectInfo.TryGetValue("UpscaleModelLoader", out JToken modelLoader))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref UpscalerModels, modelLoader["input"]["required"]["model_name"][0].Select(u => $"model-{u}///Model: {u}"));
            }
            if (rawObjectInfo.TryGetValue("SwarmKSampler", out JToken swarmksampler))
            {
                string[] dropped = [.. Samplers.Select(s => s.Before("///")).Except([.. swarmksampler["input"]["required"]["sampler_name"][0].Select(u => $"{u}")])];
                if (dropped.Any())
                {
                    Logs.Warning($"Samplers are listed, but not included in SwarmKSampler internal list: {dropped.JoinString(", ")}");
                }
                T2IParamTypes.ConcatDropdownValsClean(ref Samplers, swarmksampler["input"]["required"]["sampler_name"][0].Select(u => $"{u}///{u} (New)"));
                T2IParamTypes.ConcatDropdownValsClean(ref Schedulers, swarmksampler["input"]["required"]["scheduler"][0].Select(u => $"{u}///{u} (New)"));
            }
            if (rawObjectInfo.TryGetValue("KSampler", out JToken ksampler))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref Samplers, ksampler["input"]["required"]["sampler_name"][0].Select(u => $"{u}///{u} (New in KS)"));
                T2IParamTypes.ConcatDropdownValsClean(ref Schedulers, ksampler["input"]["required"]["scheduler"][0].Select(u => $"{u}///{u} (New in KS)"));
            }
            if (rawObjectInfo.TryGetValue("IPAdapterUnifiedLoader", out JToken ipadapterCubiqUnified))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref IPAdapterModels, ipadapterCubiqUnified["input"]["required"]["preset"][0].Select(m => $"{m}"));
            }
            else if (rawObjectInfo.TryGetValue("IPAdapter", out JToken ipadapter) && (ipadapter["input"]["required"] as JObject).TryGetValue("model_name", out JToken ipAdapterModelName))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref IPAdapterModels, ipAdapterModelName[0].Select(m => $"{m}"));
            }
            if (rawObjectInfo.TryGetValue("IPAdapterModelLoader", out JToken ipadapterCubiq))
            {
                HashSet<string> native = ["ip-adapter-faceid-portrait-v11_sd15.bin", "ip-adapter-faceid-portrait_sdxl.bin", "ip-adapter-faceid-portrait_sdxl_unnorm.bin", "ip-adapter-faceid-plusv2_sd15.bin", "ip-adapter-faceid-plusv2_sdxl.bin", "ip-adapter-faceid-plus_sd15.bin", "ip-adapter-faceid_sd15.bin", "ip-adapter-faceid_sdxl.bin", "full_face_sd15.safetensors", "ip-adapter-plus-face_sd15.safetensors", "ip-adapter-plus-face_sdxl_vit-h.safetensors", "ip-adapter-plus_sd15.safetensors", "ip-adapter-plus_sdxl_vit-h.safetensors", "ip-adapter_sd15_vit-G.safetensors", "ip-adapter_sdxl.safetensors", "ip-adapter_sd15.safetensors", "ip-adapter_sdxl_vit-h.safetensors", "sd15_light_v11.bin"];
                string[] models = [.. ipadapterCubiq["input"]["required"]["ipadapter_file"][0].Select(m => $"{m}").Where(m => !native.Contains(m))];
                T2IParamTypes.ConcatDropdownValsClean(ref IPAdapterModels, models.Select(m => $"file:{m}///Model File: {m}"));
            }
            if (rawObjectInfo.TryGetValue("IPAdapter", out JToken ipadapter2) && (ipadapter2["input"]["required"] as JObject).TryGetValue("weight_type", out JToken ipAdapterWeightType))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref IPAdapterWeightTypes, ipAdapterWeightType[0].Select(m => $"{m}///{m} (New)"));
            }
            if (rawObjectInfo.TryGetValue("IPAdapterUnifiedLoaderFaceID", out JToken ipadapterCubiqUnifiedFace))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref IPAdapterModels, ipadapterCubiqUnifiedFace["input"]["required"]["preset"][0].Select(m => $"{m}"));
            }
            if (rawObjectInfo.TryGetValue("GLIGENLoader", out JToken gligenLoader))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref GligenModels, gligenLoader["input"]["required"]["gligen_name"][0].Select(m => $"{m}"));
            }
            if (rawObjectInfo.TryGetValue("StyleModelLoader", out JToken styleModelLoader))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref StyleModels, styleModelLoader["input"]["required"]["style_model_name"][0].Select(m => $"{m}"));
            }
            if (rawObjectInfo.TryGetValue("SwarmYoloDetection", out JToken yoloDetection))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref YoloModels, yoloDetection["input"]["required"]["model_name"][0].Select(m => $"{m}"));
            }
            if (rawObjectInfo.TryGetValue("SetUnionControlNetType", out JToken unionCtrlNet))
            {
                T2IParamTypes.ConcatDropdownValsClean(ref ControlnetUnionTypes, unionCtrlNet["input"]["required"]["type"][0].Select(m => $"{m}///{m} (New)"));
            }
            if (rawObjectInfo.TryGetValue("Sam2AutoSegmentation", out JToken nodeData))
            {
                foreach (string size in new string[] { "base_plus", "large", "small" })
                {
                    ControlNetPreprocessors[$"Segment Anything 2 Global Autosegment {size}"] = new JObject()
                    {
                        ["swarm_custom"] = true,
                        ["output"] = "SWARM:NODE_1,1",
                        ["nodes"] = new JArray()
                        {
                            new JObject()
                            {
                                ["class_type"] = "DownloadAndLoadSAM2Model",
                                ["inputs"] = new JObject()
                                {
                                    ["model"] = $"sam2_hiera_{size}.safetensors",
                                    ["segmentor"] = "automaskgenerator",
                                    ["device"] = "cuda", // TODO: This should really be decided by the python, not by swarm's workflow generator - the python knows what the GPU supports, swarm does not
                                    ["precision"] = "bf16"
                                }
                            },
                            new JObject()
                            {
                                ["class_type"] = "Sam2AutoSegmentation",
                                ["node_data"] = nodeData,
                                ["inputs"] = new JObject()
                                {
                                    ["sam2_model"] = "SWARM:NODE_0",
                                    ["image"] = "SWARM:INPUT_0"
                                }
                            }
                        }
                    };
                }
            }
            foreach ((string key, JToken data) in rawObjectInfo)
            {
                if (data["category"].ToString() == "image/preprocessors")
                {
                    ControlNetPreprocessors[key] = data;
                }
                else if (key.EndsWith("Preprocessor"))
                {
                    ControlNetPreprocessors[key] = data;
                }
                if (NodeToFeatureMap.TryGetValue(key, out string featureId))
                {
                    FeaturesSupported.Add(featureId);
                    FeaturesDiscardIfNotFound.Remove(featureId);
                }
            }
            foreach (string feature in FeaturesDiscardIfNotFound)
            {
                FeaturesSupported.Remove(feature);
            }
            foreach (Action<JObject> parser in RawObjectInfoParsers)
            {
                try
                {
                    parser(rawObjectInfo);
                }
                catch (Exception ex)
                {
                    Logs.Error($"Error while running extension parsing on raw object info: {ex.ReadableString()}");
                }
            }
        }
    }

    public static T2IRegisteredParam<string> WorkflowParam, CustomWorkflowParam, SamplerParam, SchedulerParam, RefinerUpscaleMethod, UseIPAdapterForRevision, IPAdapterWeightType, VideoPreviewType, VideoFrameInterpolationMethod, Text2VideoFrameInterpolationMethod, GligenModel, YoloModelInternal, PreferredDType, StyleModelForRevision, TeaCacheMode;

    public static T2IRegisteredParam<bool> AITemplateParam, DebugRegionalPrompting, ShiftedLatentAverageInit;

    public static T2IRegisteredParam<double> IPAdapterWeight, IPAdapterStart, IPAdapterEnd, SelfAttentionGuidanceScale, SelfAttentionGuidanceSigmaBlur, PerturbedAttentionGuidanceScale, StyleModelMergeStrength, StyleModelApplyStart, StyleModelMultiplyStrength, RescaleCFGMultiplier, TeaCacheThreshold, RenormCFG;

    public static T2IRegisteredParam<int> RefinerHyperTile, VideoFrameInterpolationMultiplier, Text2VideoFrameInterpolationMultiplier;

    public static T2IRegisteredParam<string>[] ControlNetPreprocessorParams = new T2IRegisteredParam<string>[3], ControlNetUnionTypeParams = new T2IRegisteredParam<string>[3];

    public static List<string> UpscalerModels = ["pixel-lanczos///Pixel: Lanczos (cheap + high quality)", "pixel-bicubic///Pixel: Bicubic (Basic)", "pixel-area///Pixel: Area", "pixel-bilinear///Pixel: Bilinear", "pixel-nearest-exact///Pixel: Nearest-Exact (Pixel art)", "latent-bislerp///Latent: Bislerp", "latent-bicubic///Latent: Bicubic", "latent-area///Latent: Area", "latent-bilinear///Latent: Bilinear", "latent-nearest-exact///Latent: Nearest-Exact"],
        Samplers =
        [
            // K-Diffusion
            "euler///Euler", "euler_ancestral///Euler Ancestral (Randomizing)", "heun///Heun (2x Slow)", "heunpp2///Heun++ 2 (2x Slow)", "dpm_2///DPM-2 (Diffusion Probabilistic Model) (2x Slow)", "dpm_2_ancestral///DPM-2 Ancestral (2x Slow)",
            "lms///LMS (Linear Multi-Step)", "dpm_fast///DPM Fast (DPM without the DPM2 slowdown)", "dpm_adaptive///DPM Adaptive (Dynamic Steps)",
            "dpmpp_2s_ancestral///DPM++ 2S Ancestral (2nd Order Single-Step) (2x Slow)", "dpmpp_sde///DPM++ SDE (Stochastic / randomizing) (2x Slow)", "dpmpp_sde_gpu///DPM++ SDE, GPU Seeded (2x Slow)",
            "dpmpp_2m///DPM++ 2M (2nd Order Multi-Step)", "dpmpp_2m_sde///DPM++ 2M SDE", "dpmpp_2m_sde_gpu///DPM++ 2M SDE, GPU Seeded", "dpmpp_3m_sde///DPM++ 3M SDE (3rd Order Multi-Step)", "dpmpp_3m_sde_gpu///DPM++ 3M SDE, GPU Seeded",
            "ddim///DDIM (Denoising Diffusion Implicit Models) (Identical to Euler)", "ddpm///DDPM (Denoising Diffusion Probabilistic Models)",
            // Unique tack-ons
             "lcm///LCM (for LCM models)", "uni_pc///UniPC (Unified Predictor-Corrector)", "uni_pc_bh2///UniPC BH2", "res_multistep///Res MultiStep (for Cosmos)",
            "ipndm///iPNDM (Improved Pseudo-Numerical methods for Diffusion Models)", "ipndm_v///iPNDM-V (Variable-Step)", "deis///DEIS (Diffusion Exponential Integrator Sampler)", "gradient_estimation///Gradient Estimation (Improving from Optimization Perspective)",
            // CFG++ variants
            "euler_cfg_pp///Euler CFG++ (Manifold-constrained CFG)", "euler_ancestral_cfg_pp///Euler Ancestral CFG++", "dpmpp_2m_cfg_pp///DPM++ 2M CFG++", "dpmpp_2s_ancestral_cfg_pp///DPM++ 2S Ancestral CFG++ (2x Slow)", "res_multistep_cfg_pp///Res MultiStep CFG++"
        ],
        Schedulers = ["normal///Normal", "karras///Karras", "exponential///Exponential", "simple///Simple", "ddim_uniform///DDIM Uniform", "sgm_uniform///SGM Uniform", "turbo///Turbo (for turbo models, max 10 steps)", "align_your_steps///Align Your Steps (NVIDIA, rec. 10 steps)", "beta///Beta", "linear_quadratic///Linear Quadratic (Mochi)", "ltxv///LTX-Video", "ltxv-image///LTXV-Image", "kl_optimal///KL Optimal (Nvidia AYS)"];

    public static List<string> IPAdapterModels = ["None"], IPAdapterWeightTypes = ["standard", "prompt is more important", "style transfer"];

    public static List<string> GligenModels = ["None"], YoloModels = [], StyleModels = ["None"];

    public static List<string> ControlnetUnionTypes = ["auto", "openpose", "depth", "hed/pidi/scribble/ted", "canny/lineart/anime_lineart/mlsd", "normal", "segment", "tile", "repaint"];

    public static ConcurrentDictionary<string, JToken> ControlNetPreprocessors = new() { ["None"] = null };

    public static T2IParamGroup ComfyGroup, ComfyAdvancedGroup;

    /// <inheritdoc/>
    public override void OnInit()
    {
        UseIPAdapterForRevision = T2IParamTypes.Register<string>(new("Use IP-Adapter", $"Select an IP-Adapter model to use IP-Adapter for image-prompt input handling.\nModels will automatically be downloaded when you first use them.\nNote if you use a custom model, you must also set your ReVision Model under Advanced Model Addons, otherwise CLIP Vision G will be presumed.\n<a target=\"_blank\" href=\"{Utilities.RepoDocsRoot}/Features/ImagePrompting.md\">See more docs here.</a>",
            "None", IgnoreIf: "None", FeatureFlag: "ipadapter", GetValues: _ => IPAdapterModels, Group: T2IParamTypes.GroupImagePrompting, OrderPriority: 15, ChangeWeight: 1
            ));
        IPAdapterWeight = T2IParamTypes.Register<double>(new("IP-Adapter Weight", "Weight to use with IP-Adapter (if enabled).",
            "1", Min: -1, Max: 3, Step: 0.05, IgnoreIf: "1", FeatureFlag: "ipadapter", Group: T2IParamTypes.GroupImagePrompting, ViewType: ParamViewType.SLIDER, OrderPriority: 16
            ));
        IPAdapterStart = T2IParamTypes.Register<double>(new("IP-Adapter Start", "When to start applying IP-Adapter, as a fraction of steps (if enabled).\nFor example, 0.25 starts applying a quarter (25%) of the way through. Must be less than IP-Adapter End.",
            "0", IgnoreIf: "0", Min: 0.0, Max: 1.0, Step: 0.05, FeatureFlag: "ipadapter", Group: T2IParamTypes.GroupImagePrompting, ViewType: ParamViewType.SLIDER, OrderPriority: 17, IsAdvanced: true, Examples: ["0", "0.2", "0.5"]
            ));
        IPAdapterEnd = T2IParamTypes.Register<double>(new("IP-Adapter End", "When to stop applying IP-Adapter, as a fraction of steps (if enabled).\nFor example, 0.5 stops applying halfway (50%) through. Must be greater than IP-Adapter Start.",
            "1", IgnoreIf: "1",  Min: 0.0, Max: 1.0, Step: 0.05, FeatureFlag: "ipadapter", Group: T2IParamTypes.GroupImagePrompting, ViewType: ParamViewType.SLIDER, OrderPriority: 18, IsAdvanced: true, Examples: ["1", "0.8", "0.5"]
            ));
        IPAdapterWeightType = T2IParamTypes.Register<string>(new("IP-Adapter Weight Type", "How to shift the weighting of the IP-Adapter.\nThis can produce subtle but useful different effects.",
            "standard", FeatureFlag: "ipadapter", Group: T2IParamTypes.GroupImagePrompting, ViewType: ParamViewType.SLIDER, OrderPriority: 19, IsAdvanced: true, GetValues: _ => IPAdapterWeightTypes
            ));
        StyleModelForRevision = T2IParamTypes.Register<string>(new("Use Style Model", $"Select a Style model to use it for image-prompt input handling.\nFlux.1 Redux is an example of a style model.\nPlace these models in `(Swarm)/Models/style_models`.",
            "None", IgnoreIf: "None", FeatureFlag: "comfyui", GetValues: _ => StyleModels, Group: T2IParamTypes.GroupImagePrompting, OrderPriority: 14, ChangeWeight: 1
            ));
        StyleModelMergeStrength = T2IParamTypes.Register<double>(new("Style Model Merge Strength", "How strongly to merge in the effects of the style model.\nAt 1, the style model is fully used.\nAt 0, the style model is ignored.\nFor Flux Redux, very low values (eg 0.1) are recommended.",
            "1", IgnoreIf: "1", Min: 0.0, Max: 1.0, Step: 0.01, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupImagePrompting, ViewType: ParamViewType.SLIDER, OrderPriority: 14.5, IsAdvanced: true, Examples: ["0", "0.25", "0.5", "0.75", "1"]
            ));
        StyleModelMultiplyStrength = T2IParamTypes.Register<double>(new("Style Model Multiply Strength", "How strongly to multiply the effects of the style model.\nAt 1, the style model is fully used.\nAt 0, the style model is ignored.\nFor Flux Redux, very low values (eg 0.1) are recommended.",
            "1", IgnoreIf: "1", Min: 0.0, Max: 10.0, ViewMax: 2, Step: 0.01, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupImagePrompting, ViewType: ParamViewType.SLIDER, OrderPriority: 14.6, IsAdvanced: true, Examples: ["0", "0.25", "0.5", "0.75", "1", "2"]
            ));
        StyleModelApplyStart = T2IParamTypes.Register<double>(new("Style Model Apply Start", "When to start applying the Style Model, as a fraction of steps (if enabled).\nFor example, 0.25 starts applying a quarter (25%) of the way through.\nThis is probably off-scale due to scheduler behavior in ComfyUI internals. Very low values are recommend for practical usage.",
            "0", IgnoreIf: "0", Min: 0.0, Max: 1.0, Step: 0.01, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupImagePrompting, ViewType: ParamViewType.SLIDER, OrderPriority: 14.7, IsAdvanced: true, Examples: ["0", "0.2", "0.5"]
            ));
        ComfyGroup = new("ComfyUI", Toggles: false, Open: false);
        ComfyAdvancedGroup = new("ComfyUI Advanced", Toggles: false, IsAdvanced: true, Open: false);
        CustomWorkflowParam = T2IParamTypes.Register<string>(new("[ComfyUI] Custom Workflow", "What custom workflow to use in ComfyUI (built in the Comfy Workflow Editor tab).\nGenerally, do not use this directly.",
            "", Toggleable: true, FeatureFlag: "comfyui", Group: ComfyGroup, IsAdvanced: true, ValidateValues: false, ChangeWeight: 8, Permission: PermStoredCustomWorkflows,
            GetValues: (_) => [.. CustomWorkflows.Keys.Order()],
            Clean: (_, val) => CustomWorkflows.ContainsKey(val) ? $"PARSED%{val}%{ComfyUIWebAPI.ReadCustomWorkflow(val)["prompt"]}" : val,
            MetadataFormat: v => v.StartsWith("PARSED%") ? v.After("%").Before("%") : v
            ));
        SamplerParam = T2IParamTypes.Register<string>(new("Sampler", "Sampler type (for ComfyUI backends).\nGenerally, 'Euler' is fine, but for SD1 and SDXL 'DPM++ 2M' is popular when paired with the 'Karras' scheduler.\n'Ancestral' and 'SDE' samplers only work with non-rectified models (eg SD1/SDXL) and randomly move over time.\nSome special model variants require specific Samplers or Schedulers.\n'CFG++' samplers have a different CFG range than normal (between 0 to 2, depending).",
            "euler", Toggleable: true, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupSampling, OrderPriority: -5,
            GetValues: (_) => Samplers
            ));
        SchedulerParam = T2IParamTypes.Register<string>(new("Scheduler", "Scheduler type (for ComfyUI backends).\nGoes with the Sampler parameter above.",
            "normal", Toggleable: true, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupSampling, OrderPriority: -4,
            GetValues: (_) => Schedulers
            ));
        AITemplateParam = T2IParamTypes.Register<bool>(new("Enable AITemplate", "If checked, enables AITemplate for ComfyUI generations (UNet only). Only compatible with some GPUs.",
            "false", IgnoreIf: "false", FeatureFlag: "aitemplate", Group: ComfyGroup, ChangeWeight: 5
            ));
        PreferredDType = T2IParamTypes.Register<string>(new("Preferred DType", "Preferred data type for models, when a choice is available.\n(Notably primarily affects Flux.1 models currently).\nIf disabled, will automatically decide.\n'fp8_e43fn' is recommended for large models.\n'Default' uses global default type, usually fp16 or bf16.",
            "automatic", FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, Toggleable: true, OrderPriority: 9, GetValues: (_) => ["automatic///Automatic (decide by model)", "default///Default (16 bit)", "fp8_e4m3fn///FP8 e4m3fn (8 bit)", "fp8_e5m2///FP8 e5m2 (alt 8 bit)"]
            ));
        SelfAttentionGuidanceScale = T2IParamTypes.Register<double>(new("Self-Attention Guidance Scale", "Scale for Self-Attention Guidance.\n''Self-Attention Guidance (SAG) uses the intermediate self-attention maps of diffusion models to enhance their stability and efficacy.\nSpecifically, SAG adversarially blurs only the regions that diffusion models attend to at each iteration and guides them accordingly.''\nDefaults to 0.5.",
            "0.5", Min: -2, Max: 5, Step: 0.1, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, Toggleable: true, ViewType: ParamViewType.SLIDER, OrderPriority: 12
            ));
        SelfAttentionGuidanceSigmaBlur = T2IParamTypes.Register<double>(new("Self-Attention Guidance Sigma Blur", "Blur-sigma for Self-Attention Guidance.\nDefaults to 2.0.",
            "2", Min: 0, Max: 10, Step: 0.25, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, Toggleable: true, ViewType: ParamViewType.SLIDER, OrderPriority: 12.5
            ));
        PerturbedAttentionGuidanceScale = T2IParamTypes.Register<double>(new("Perturbed-Attention Guidance Scale", "Scale for Perturbed-Attention Guidance (PAG).\n''PAG is designed to progressively enhance the structure of synthesized samples throughout the denoising process by considering the self-attention mechanisms' ability to capture structural information.\nIt involves generating intermediate samples with degraded structure by substituting selected self-attention maps in diffusion U-Net with an identity matrix, and guiding the denoising process away from these degraded samples.''\nDefaults to 3.",
            "3", Min: 0, Max: 100, Step: 0.1, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, Toggleable: true, ViewType: ParamViewType.SLIDER, OrderPriority: 13
            ));
        RescaleCFGMultiplier = T2IParamTypes.Register<double>(new("Rescale CFG Multiplier", "If enabled, use Comfy's native version of RescaleCFG.\nThis is only expected to work on certain vpred models.\nThis is, generally, pointless.\nThe value specified is the multiplier rate.",
            "0.7", Min: 0, Max: 1, Step: 0.01, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, Toggleable: true, ViewType: ParamViewType.SLIDER, OrderPriority: 14
            ));
        RenormCFG = T2IParamTypes.Register<double>(new("Renorm CFG", "If enabled, use 'Renorm CFG', a technique developed for use with Lumina 2.\nAt 0, this does nothing. Lumina 2 reference code sets this to 1.\nThis parameter only works on some models, and will corrupt others.",
            "0", Min: 0, Max: 100, Step: 0.1, IgnoreIf: "0", ViewMax: 2, FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, ViewType: ParamViewType.SLIDER, OrderPriority: 15
            ));
        RefinerUpscaleMethod = T2IParamTypes.Register<string>(new("Refiner Upscale Method", "How to upscale the image, if upscaling is used.",
            "pixel-lanczos", Group: T2IParamTypes.GroupRefiners, OrderPriority: -1, FeatureFlag: "comfyui", ChangeWeight: 1,
            GetValues: (_) => UpscalerModels
            ));
        for (int i = 0; i < 3; i++)
        {
            ControlNetPreprocessorParams[i] = T2IParamTypes.Register<string>(new($"ControlNet{T2IParamTypes.Controlnets[i].NameSuffix} Preprocessor", "The preprocessor to use on the ControlNet input image.\nIf toggled off, will be automatically selected.\nUse 'None' to disable preprocessing.",
                "None", Toggleable: true, FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, Group: T2IParamTypes.Controlnets[i].Group, OrderPriority: 3, GetValues: (_) => [.. ControlNetPreprocessors.Keys.Order().OrderBy(v => v == "None" ? -1 : 0)], ChangeWeight: 2
                ));
            ControlNetUnionTypeParams[i] = T2IParamTypes.Register<string>(new($"ControlNet{T2IParamTypes.Controlnets[i].NameSuffix} Union Type", "For Union ControlNets, you can optionally manually specify the union controlnet type.",
                "auto", Toggleable: true, IsAdvanced: true, FeatureFlag: "controlnet", Permission: Permissions.ParamControlNet, Group: T2IParamTypes.Controlnets[i].Group, OrderPriority: 4, GetValues: (_) => ControlnetUnionTypes
                ));
        }
        DebugRegionalPrompting = T2IParamTypes.Register<bool>(new("Debug Regional Prompting", "If checked, outputs masks from regional prompting for debug reasons.",
            "false", IgnoreIf: "false", FeatureFlag: "comfyui", VisibleNormally: false
            ));
        RefinerHyperTile = T2IParamTypes.Register<int>(new("Refiner HyperTile", "The size of hypertiles to use for the refining stage.\nHyperTile is a technique to speed up sampling of large images by tiling the image and batching the tiles.\nThis is useful when using SDv1 models as the refiner. SDXL-Base models do not benefit as much.",
            "256", Min: 64, Max: 2048, Step: 32, Toggleable: true, IsAdvanced: true, FeatureFlag: "comfyui", ViewType: ParamViewType.POT_SLIDER, Group: T2IParamTypes.GroupAdvancedSampling, OrderPriority: 20
            ));
        Text2VideoFrameInterpolationMethod = T2IParamTypes.Register<string>(new("Text2Video Frame Interpolation Method", "How to interpolate frames in the video.\n'RIFE' or 'FILM' are two different decent interpolation model options.",
            "RIFE", FeatureFlag: "frameinterps", Group: T2IParamTypes.GroupText2Video, Permission: Permissions.ParamVideo, GetValues: (_) => ["RIFE", "FILM"], OrderPriority: 32
            ));
        Text2VideoFrameInterpolationMultiplier = T2IParamTypes.Register<int>(new("Text2Video Frame Interpolation Multiplier", "How many frames to interpolate between each frame in the video.\nHigher values are smoother, but make take significant time to save the output, and may have quality artifacts.",
            "1", IgnoreIf: "1", Min: 1, Max: 10, Step: 1, FeatureFlag: "frameinterps", Group: T2IParamTypes.GroupText2Video, Permission: Permissions.ParamVideo, OrderPriority: 33
            ));
        VideoPreviewType = T2IParamTypes.Register<string>(new("Video Preview Type", "How to display previews for generating videos.\n'Animate' shows a low-res animated video preview.\n'iterate' shows one frame at a time while it goes.\n'one' displays just the first frame.\n'none' disables previews.",
            "animate", IgnoreIf: "animate", FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedVideo, Permission: Permissions.ParamVideo, IsAdvanced: true, GetValues: (_) => ["animate", "iterate", "one", "none"]
            ));
        VideoFrameInterpolationMethod = T2IParamTypes.Register<string>(new("Video Frame Interpolation Method", "How to interpolate frames in the video.\n'RIFE' or 'FILM' are two different decent interpolation model options.",
            "RIFE", FeatureFlag: "frameinterps", Group: T2IParamTypes.GroupVideo, Permission: Permissions.ParamVideo, GetValues: (_) => ["RIFE", "FILM"], OrderPriority: 32
            ));
        VideoFrameInterpolationMultiplier = T2IParamTypes.Register<int>(new("Video Frame Interpolation Multiplier", "How many frames to interpolate between each frame in the video.\nHigher values are smoother, but make take significant time to save the output, and may have quality artifacts.",
            "1", IgnoreIf: "1", Min: 1, Max: 10, Step: 1, FeatureFlag: "frameinterps", Group: T2IParamTypes.GroupVideo, Permission: Permissions.ParamVideo, OrderPriority: 33
            ));
        GligenModel = T2IParamTypes.Register<string>(new("GLIGEN Model", "Optionally use a GLIGEN model.\nGLIGEN is only compatible with SDv1 at time of writing.",
            "None", IgnoreIf: "None", FeatureFlag: "comfyui", Group: T2IParamTypes.GroupRegionalPrompting, GetValues: (_) => GligenModels, IsAdvanced: true
            ));
        ShiftedLatentAverageInit = T2IParamTypes.Register<bool>(new("Shifted Latent Average Init", "If checked, shifts the empty latent to use a mean-average per-channel latent value (as calculated by Birchlabs).\nIf unchecked, default behavior of zero-init latents are used.\nThis can potentially improve the color range or even general quality on SDv1, SDv2, and SDXL models.\nNote that the effect is very minor.",
            "false", IgnoreIf: "false", FeatureFlag: "comfyui", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true
            ));
        YoloModelInternal = T2IParamTypes.Register<string>(new("YOLO Model Internal", "Parameter for internally tracking YOLOv8 models.\nThis is not for real usage, it is just to expose the list to the UI handler.",
            "", IgnoreIf: "", FeatureFlag: "yolov8", Group: ComfyAdvancedGroup, GetValues: (_) => YoloModels, Toggleable: true, IsAdvanced: true, AlwaysRetain: true, VisibleNormally: false
            ));
        TeaCacheMode = T2IParamTypes.Register<string>(new("TeaCache Mode", "When to use TeaCache.\nTeaCache is a trick to accelerate diffusion models, especially video models.\nThat is: generation runs faster, but loses some quality.\nSee <a target=\"_blank\" href=\"https://liewfeng.github.io/TeaCache/\">here for more info</a>.\nYou can leave this disabled, enabled for all model sampling stages, or only enabled for certain model sampling stages.\n(This separation is so eg you can accelerate your video generation, without losing quality of an initial image).",
            "disabled", IgnoreIf: "disabled", FeatureFlag: "teacache", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, GetValues: (_) => ["disabled", "all", "base gen only///base gen only (no refiner or video)", "video only"], OrderPriority: 15
            ));
        TeaCacheThreshold = T2IParamTypes.Register<double>(new("TeaCache Threshold", "What threshold to use with TeaCache.\nSee 'TeaCache Mode' parameter above.\n0.4 might work well with Flux image generation, and 0.15 might work well with video generation.\n0.25 is a good stable default for most purposes - decent acceleration but little visual change.",
            "0.25", IgnoreIf: "0.25", Min: 0, Max: 1, Step: 0.01, FeatureFlag: "teacache", Group: T2IParamTypes.GroupAdvancedSampling, IsAdvanced: true, ViewType: ParamViewType.SLIDER, OrderPriority: 15.5
            ));
        Program.Backends.RegisterBackendType<ComfyUIAPIBackend>("comfyui_api", "ComfyUI API By URL", "A backend powered by a pre-existing installation of ComfyUI, referenced via API base URL.", true);
        Program.Backends.RegisterBackendType<ComfyUISelfStartBackend>("comfyui_selfstart", "ComfyUI Self-Starting", "A backend powered by a pre-existing installation of the ComfyUI, automatically launched and managed by this UI server.", isStandard: true);
        ComfyUIWebAPI.Register();
    }

    public override void OnPreLaunch()
    {
        WebServer.WebApp.Map("/ComfyBackendDirect/{*Path}", ComfyUIRedirectHelper.ComfyBackendDirectHandler);
    }

    public record struct ComfyBackendData(HttpClient Client, string APIAddress, string WebAddress, AbstractT2IBackend Backend);

    public static IEnumerable<ComfyBackendData> ComfyBackendsDirect()
    {
        foreach (ComfyUIAPIAbstractBackend backend in RunningComfyBackends)
        {
            yield return new(ComfyUIAPIAbstractBackend.HttpClient, backend.APIAddress, backend.WebAddress, backend);
        }
        foreach (SwarmSwarmBackend swarmBackend in Program.Backends.RunningBackendsOfType<SwarmSwarmBackend>().Where(b => b.LinkedRemoteBackendType is not null && b.LinkedRemoteBackendType.StartsWith("comfyui_")))
        {
            string addr = $"{swarmBackend.Address}/ComfyBackendDirect";
            yield return new(SwarmSwarmBackend.HttpClient, addr, addr, swarmBackend);
        }
    }
}
