using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using SwarmUI.Text2Image;
using SwarmUI.Utils;

namespace SwarmUI.Builtin_ComfyUIBackend;

/// <summary>Represents data from a node output in <see cref="WorkflowGenerator"/>.</summary>
public class WGNodeData(JArray _path, WorkflowGenerator _gen, string _dataType, T2IModelCompatClass _compat)
{
    public static string DT_IMAGE = "IMAGE", DT_LATENT_IMAGE = "LATENT_IMAGE",
        DT_MODEL = "MODEL", DT_TEXTENC = "TEXTENC", DT_VAE = "VAE", DT_AUDIOVAE = "AUDIOVAE",
        DT_VIDEO = "VIDEO", DT_LATENT_VIDEO = "LATENT_VIDEO",
        DT_AUDIO = "AUDIO", DT_LATENT_AUDIO = "LATENT_AUDIO",
        DT_LATENT_AUDIOVIDEO = "LATENT_AUDIOVIDEO";

    /// <summary>Returns true if this holds some form of model (model, textenc, vae, ...).</summary>
    public bool IsAModelType => DataType == DT_MODEL || DataType == DT_VAE || DataType == DT_AUDIOVAE;

    /// <summary>Returns true if this holds latent-encoded media data.</summary>
    public bool IsLatentData => DataType.StartsWith("LATENT_");

    /// <summary>Returns true if this holds raw media data (image, video, audio, ...).</summary>
    public bool IsRawMedia => DataType == DT_IMAGE || DataType == DT_AUDIO || DataType == DT_VIDEO;

    /// <summary>Actual backing path to the node output in the workflow.</summary>
    public JArray Path = _path;

    /// <summary>What type of data is in this. Use the static types available in <see cref="WGNodeData"/>.</summary>
    public string DataType = _dataType;

    /// <summary>If known and relevant (eg latent), what class of models this is compatible with.</summary>
    public T2IModelCompatClass Compat = _compat;

    /// <summary>Returns true if this data has the same compat class as given.</summary>
    public bool IsCompat(T2IModelCompatClass clazz) => Compat is not null && clazz.ID == Compat.ID;

    /// <summary>The width in image space, if known and valid.</summary>
    public int? Width = null;

    /// <summary>The height in image space, if known and valid.</summary>
    public int? Height = null;

    /// <summary>The number of frames in video space, if known and valid.</summary>
    public int? Frames = null;

    /// <summary>The frames per second of a video, if known and valid.</summary>
    public int? FPS = null;

    /// <summary>If this is a video data object, and audio is separate but tracked, this is the audio associated.</summary>
    public WGNodeData AttachedAudio = null;

    /// <summary>The backing relevant workflow generator.</summary>
    public WorkflowGenerator Gen = _gen;

    /// <summary>The current relevant user input data.</summary>
    public T2IParamInput UserInput => Gen.UserInput;

    /// <summary>The current relevant workflow supported feature set.</summary>
    public HashSet<string> Features => Gen.Features;

    /// <summary>Create an exact copy of this object.</summary>
    public WGNodeData Duplicate() => (WGNodeData)MemberwiseClone();

    public (string, JObject) SourceNodeData => Gen.Workflow.TryGetValue($"{Path[0]}", out JToken tok) && tok is JObject node ? ($"{node["class_type"]}", (JObject)node["inputs"]) : (null, null);

    /// <summary>Returns a copy of this node data with a different node path and optional different type. Always returns a new object instance.</summary>
    public WGNodeData WithPath(JArray path, string dataType = null, T2IModelCompatClass compat = null)
    {
        WGNodeData dup = Duplicate();
        dup.Path = path;
        dup.DataType = dataType ?? dup.DataType;
        dup.Compat = compat ?? dup.Compat;
        return dup;
    }

    /// <summary>Decode the latent data in this object to raw media data. If it is already raw, it will be returned unmodified.</summary>
    /// <param name="vae">The VAE or AudioVAE to decode with.</param>
    /// <param name="wantAudio">True if you want audio data, false if you want image/video data, null if it's irrelevant.</param>
    /// <param name="id">Optional node ID override.</param>
    public WGNodeData DecodeLatents(WGNodeData vae, bool? wantAudio, string id = null)
    {
        if (IsRawMedia)
        {
            WGAssert(wantAudio == null || wantAudio == (DataType == DT_AUDIO), $"Data is {DataType} but wantAudio is {wantAudio}, mismatched and therefore failed.");
            return this;
        }
        WGAssert(IsLatentData, $"Cannot decode latents from data of type '{DataType}'.");
        WGAssert(vae is not null, $"Must provide a VAE to decode {DataType} data.");
        (string sourceType, JObject srcInputs) = SourceNodeData;
        if (DataType == DT_LATENT_IMAGE || DataType == DT_LATENT_VIDEO)
        {
            if ((sourceType == "VAEEncode" || sourceType == "VAEEncodeTiled") && srcInputs["vae"][0] == vae.Path[0])
            {
                return WithPath((JArray)srcInputs["pixels"], DataType == DT_LATENT_IMAGE ? DT_IMAGE : DT_VIDEO);
            }
            WGAssert(wantAudio != true, $"Data is {DataType} but wantAudio is true, mismatched and therefore failed.");
            string decoded;
            if (UserInput.TryGet(T2IParamTypes.VAETileSize, out _) || UserInput.TryGet(T2IParamTypes.VAETemporalTileSize, out _))
            {
                decoded = Gen.CreateNode("VAEDecodeTiled", new JObject()
                {
                    ["vae"] = vae.Path,
                    ["samples"] = Path,
                    ["tile_size"] = UserInput.Get(T2IParamTypes.VAETileSize, 256),
                    ["overlap"] = UserInput.Get(T2IParamTypes.VAETileOverlap, 64),
                    ["temporal_size"] = UserInput.Get(T2IParamTypes.VAETemporalTileSize, Gen.IsAnyWanModel() || Gen.IsHunyuanVideo15() ? 9999 : 32),
                    ["temporal_overlap"] = UserInput.Get(T2IParamTypes.VAETemporalTileOverlap, 4)
                }, id);
            }
            // The VAE requirements for hunyuan are basically unobtainable, so force tiling as stupidproofing
            // TODO: IsCompat(...)
            else if ((Gen.IsHunyuanVideo() || Gen.IsHunyuanVideo15() || Gen.IsKandinsky5VidLite() || Gen.IsKandinsky5VidPro()) && UserInput.Get(T2IParamTypes.ModelSpecificEnhancements, true))
            {
                decoded = Gen.CreateNode("VAEDecodeTiled", new JObject()
                {
                    ["vae"] = vae.Path,
                    ["samples"] = Path,
                    ["tile_size"] = 256,
                    ["overlap"] = 64,
                    ["temporal_size"] = Gen.IsHunyuanVideo15() ? 9999 : 32, // HyVid 1.5 dies on temporal tiling
                    ["temporal_overlap"] = 4
                }, id);
            }
            else
            {
                decoded = Gen.CreateNode("VAEDecode", new JObject()
                {
                    ["vae"] = vae.Path,
                    ["samples"] = Path
                }, id);
            }
            return WithPath([decoded, 0], DataType == DT_LATENT_VIDEO ? DT_VIDEO : DT_IMAGE, vae.Compat);
        }
        if (DataType == DT_LATENT_AUDIOVIDEO)
        {
            if (IsCompat(T2IModelClassSorter.CompatLtxv2))
            {
                JArray vidRoute, audRoute;
                if (sourceType == "LTXVConcatAVLatent")
                {
                    vidRoute = (JArray)srcInputs["video_latent"];
                    audRoute = (JArray)srcInputs["audio_latent"];
                }
                else
                {
                    string separated = Gen.CreateNode("LTXVSeparateAVLatent", new JObject()
                    {
                        ["av_latent"] = Path
                    });
                    vidRoute = [separated, 0];
                    audRoute = [separated, 1];
                }
                if (wantAudio == true)
                {
                    WGNodeData latentAudio = WithPath(audRoute, DT_LATENT_AUDIO);
                    return latentAudio.DecodeLatents(vae, true, id);
                }
                else
                {
                    WGNodeData latentVideo = WithPath(vidRoute, DT_LATENT_VIDEO);
                    latentVideo.AttachedAudio = WithPath(audRoute, DT_LATENT_AUDIO);
                    return latentVideo.DecodeLatents(vae, false, id);
                }
            }
            else
            {
                WGAssert(false, $"Cannot decode LATENT_AUDIOVIDEO data from compat class '{Compat}'.");
            }
        }
        if (DataType == DT_LATENT_AUDIO)
        {
            WGAssert(wantAudio != false, $"Data is {DataType} but wantAudio is false, mismatched and therefore failed.");
            if (sourceType == "LTXVAudioVAEEncode" && srcInputs["audio_vae"][0] == vae.Path[0])
            {
                return WithPath((JArray)srcInputs["audio"], DT_LATENT_AUDIO);
            }
            if (sourceType == "VAEEncodeAudio" && srcInputs["vae"][0] == vae.Path[0])
            {
                return WithPath((JArray)srcInputs["audio"], DT_LATENT_AUDIO);
            }
            if (IsCompat(T2IModelClassSorter.CompatLtxv2))
            {
                string audioDecoded = Gen.CreateNode("LTXVAudioVAEDecode", new JObject()
                {
                    ["audio_vae"] = vae.Path,
                    ["samples"] = Path
                }, id);
                return WithPath([audioDecoded, 0], DT_AUDIO, vae.Compat);
            }
            string decoded = Gen.CreateNode("VAEDecodeAudio", new JObject()
            {
                ["vae"] = vae.Path,
                ["samples"] = Path
            }, id);
            return WithPath([decoded, 0], DT_AUDIO, vae.Compat);
        }
        WGAssert(false, $"Unknown latent data type '{DataType}', cannot decode.");
        return null;
    }

    /// <summary>Encode the raw media data in this object to latent data. If it is already latent, it will be returned unmodified.</summary>
    /// <param name="vae">The VAE or AudioVAE to decode with.</param>
    /// <param name="id">Optional node ID override.</param>
    public WGNodeData EncodeToLatent(WGNodeData vae, string id = null)
    {
        if (IsLatentData)
        {
            return this;
        }
        (string sourceType, JObject srcInputs) = SourceNodeData;
        if ((sourceType == "VAEDecode" || sourceType == "VAEDecodeTiled") && srcInputs["vae"][0] == vae.Path[0])
        {
            return WithPath((JArray)srcInputs["samples"], DataType == DT_IMAGE ? DT_LATENT_IMAGE : DT_LATENT_VIDEO);
        }
        if (sourceType == "LTXVAudioVAEDecode" && srcInputs["audio_vae"][0] == vae.Path[0])
        {
            return WithPath((JArray)srcInputs["samples"], DT_LATENT_AUDIO);
        }
        if (sourceType == "VAEDecodeAudio" && srcInputs["vae"][0] == vae.Path[0])
        {
            return WithPath((JArray)srcInputs["samples"], DT_LATENT_AUDIO);
        }
        WGAssert(vae is not null, $"VAE Missing for latent encoding of {DataType} data.");
        if (DataType == DT_IMAGE || DataType == DT_VIDEO)
        {
            string encoded;
            if (vae.IsCompat(T2IModelClassSorter.CompatCascade))
            {
                encoded = Gen.CreateNode("StableCascade_StageC_VAEEncode", new JObject()
                {
                    ["vae"] = vae.Path,
                    ["image"] = Path,
                    ["compression"] = UserInput.Get(T2IParamTypes.CascadeLatentCompression, 32)
                }, id);
            }
            else if (UserInput.TryGet(T2IParamTypes.VAETileSize, out _) || UserInput.TryGet(T2IParamTypes.VAETemporalTileSize, out _))
            {
                encoded = Gen.CreateNode("VAEEncodeTiled", new JObject()
                {
                    ["vae"] = vae.Path,
                    ["pixels"] = Path,
                    ["tile_size"] = UserInput.Get(T2IParamTypes.VAETileSize, 256),
                    ["overlap"] = UserInput.Get(T2IParamTypes.VAETileOverlap, 64),
                    ["temporal_size"] = UserInput.Get(T2IParamTypes.VAETemporalTileSize, Gen.IsAnyWanModel() ? 9999 : 32),
                    ["temporal_overlap"] = UserInput.Get(T2IParamTypes.VAETemporalTileOverlap, 4)
                }, id);
            }
            else
            {
                encoded = Gen.CreateNode("VAEEncode", new JObject()
                {
                    ["vae"] = vae.Path,
                    ["pixels"] = Path
                }, id);
            }
            return WithPath([encoded, 0], DataType == DT_IMAGE ? DT_LATENT_IMAGE : DT_LATENT_VIDEO, vae.Compat);
        }
        if (DataType == DT_AUDIO)
        {
            if (vae.IsCompat(T2IModelClassSorter.CompatLtxv2))
            {
                string encoded = Gen.CreateNode("LTXVAudioVAEEncode", new JObject()
                {
                    ["audio_vae"] = vae.Path,
                    ["audio"] = Path
                }, id);
                return WithPath([encoded, 0], DT_LATENT_AUDIO, vae.Compat);
            }
            else
            {
                string encoded = Gen.CreateNode("VAEEncodeAudio", new JObject()
                {
                    ["vae"] = vae.Path,
                    ["audio"] = Path
                }, id);
                return WithPath([encoded, 0], DT_LATENT_AUDIO, vae.Compat);
            }
        }
        WGAssert(false, $"Unknown raw media data type '{DataType}', cannot encode to latent.");
        return null;
    }

    /// <summary>Converts this data to a format fit for sampling, generally some form of latent.</summary>
    public WGNodeData AsSamplingLatent(WGNodeData vae, WGNodeData audioVae)
    {
        if (IsLatentData)
        {
            WGAssert(vae.Compat.ID == Compat.ID, $"Data is compatible with '{Compat}' but provided VAE is compatible with '{vae.Compat}', cannot encode to sampling latent, ensure correctly decoded first.");
        }
        if (IsLatentData && AttachedAudio is null)
        {
            return this;
        }
        if (DataType == DT_LATENT_AUDIOVIDEO)
        {
            return this;
        }
        if (DataType == DT_LATENT_VIDEO || DataType == DT_LATENT_IMAGE)
        {
            if (vae.IsCompat(T2IModelClassSorter.CompatLtxv2))
            {
                WGNodeData audioEncoded = AttachedAudio.EncodeToLatent(audioVae);
                string concatted = Gen.CreateNode("LTXVConcatAVLatent", new JObject()
                {
                    ["video_latent"] = Path,
                    ["audio_latent"] = audioEncoded.Path
                });
                return WithPath([concatted, 0], DT_LATENT_AUDIOVIDEO);
            }
            return this;
        }
        if (DataType == DT_IMAGE || DataType == DT_VIDEO)
        {
            return EncodeToLatent(vae);
        }
        if (DataType == DT_AUDIO)
        {
            return EncodeToLatent(audioVae);
        }
        WGAssert(false, $"Cannot convert data of type '{DataType}' to sampling latent.");
        return null;
    }

    /// <summary>Returns an object that is definitely compatible with latent image or video inputs, encoding to latent with the VAE or separating A/V as needed, or throws an exception if not possible.</summary>
    public WGNodeData AsLatentImage(WGNodeData vae)
    {
        if (IsLatentData)
        {
            WGAssert(vae.Compat.ID == Compat.ID, $"Data is compatible with '{Compat}' but provided VAE is compatible with '{vae.Compat}', cannot encode to sampling latent, ensure correctly decoded first.");
        }
        if (DataType == DT_LATENT_VIDEO || DataType == DT_LATENT_IMAGE)
        {
            return this;
        }
        if (DataType == DT_VIDEO || DataType == DT_IMAGE)
        {
            return EncodeToLatent(vae);
        }
        else if (DataType == DT_LATENT_AUDIOVIDEO)
        {
            if (IsCompat(T2IModelClassSorter.CompatLtxv2))
            {
                (string sourceType, JObject srcInputs) = SourceNodeData;
                if (sourceType == "LTXVConcatAVLatent")
                {
                    return WithPath((JArray)srcInputs["video_latent"], DT_LATENT_VIDEO);
                }
                string separated = Gen.CreateNode("LTXVSeparateAVLatent", new JObject()
                {
                    ["av_latent"] = Path
                });
                WGNodeData result = WithPath([separated, 0], DT_LATENT_VIDEO);
                result.AttachedAudio = WithPath([separated, 1], DT_LATENT_AUDIO);
                return result;
            }
            else
            {
                WGAssert(false, $"Cannot convert LATENT_AUDIOVIDEO data from compat class '{Compat}' to latent video.");
            }
        }
        WGAssert(false, $"Cannot convert data of type '{DataType}' to latent video.");
        return null;
    }

    /// <summary>Returns an object that is definitely compatible with raw image or video inputs, decoding from latent with the VAE or separating A/V as needed, or throws an exception if not possible.</summary>
    public WGNodeData AsRawImage(WGNodeData vae)
    {
        if (DataType == DT_IMAGE || DataType == DT_VIDEO)
        {
            return this;
        }
        if (DataType == DT_LATENT_IMAGE || DataType == DT_LATENT_VIDEO || DataType == DT_LATENT_AUDIOVIDEO)
        {
            return DecodeLatents(vae, false);
        }
        WGAssert(false, $"Cannot convert data of type '{DataType}' to raw image/video.");
        return null;
    }

    /// <summary>Emit nodes to save this data as output. Only works with media or latent media types (latents will be autodecoded using the given VAEs).</summary>
    public string SaveOutput(WGNodeData vae, WGNodeData audioVae, string id = null)
    {
        if (DataType == DT_LATENT_IMAGE || DataType == DT_LATENT_VIDEO)
        {
            WGNodeData decoded = AsRawImage(vae);
            return decoded.SaveOutput(vae, audioVae, id);
        }
        if (DataType == DT_LATENT_AUDIO)
        {
            WGNodeData decoded = DecodeLatents(audioVae, true);
            return decoded.SaveOutput(vae, audioVae, id);
        }
        if (DataType == DT_LATENT_AUDIOVIDEO)
        {
            WGNodeData decodedVideo = AsRawImage(vae);
            return decodedVideo.SaveOutput(vae, audioVae, id);
        }
        if (AttachedAudio is not null)
        {
            if (AttachedAudio.DataType == DT_LATENT_AUDIO)
            {
                WGNodeData dup = Duplicate();
                dup.AttachedAudio = AttachedAudio.DecodeLatents(audioVae, true);
                return dup.SaveOutput(vae, audioVae, id);
            }
            WGAssert(AttachedAudio.DataType == DT_AUDIO, $"Can only attach audio data, but attachAudio is of type {AttachedAudio.DataType}.");
        }
        WGAssert(IsRawMedia, $"Can only save output from raw media data, but data is of type {DataType}.");
        if (DataType == DT_IMAGE && AttachedAudio is null)
        {
            if (Features.Contains("comfy_saveimage_ws") && !WorkflowGenerator.RestrictCustomNodes)
            {
                return Gen.CreateNode("SwarmSaveImageWS", new JObject()
                {
                    ["images"] = Path,
                    ["bit_depth"] = UserInput.Get(T2IParamTypes.BitDepth, "8bit")
                }, id);
            }
            else
            {
                return Gen.CreateNode("SaveImage", new JObject()
                {
                    ["filename_prefix"] = $"SwarmUI_{Random.Shared.Next():X4}_",
                    ["images"] = Path
                }, id);
            }
        }
        if (DataType == DT_VIDEO || DataType == DT_IMAGE)
        {
            JArray path = Path;
            if (UserInput.Get(T2IParamTypes.VideoBoomerang, false))
            {
                // TODO: Should we really be doing this *here*?!
                // Also arguably audio should boomerang too but that'd probably be weird
                string bounced = Gen.CreateNode("SwarmVideoBoomerang", new JObject()
                {
                    ["images"] = Path
                });
                path = [bounced, 0];
            }
            return Gen.CreateNode("SwarmSaveAnimationWS", new JObject()
            {
                ["images"] = path,
                ["fps"] = FPS ?? Gen.Text2VideoFPS(),
                ["lossless"] = false,
                ["quality"] = 95,
                ["method"] = "default",
                ["format"] = UserInput.Get(T2IParamTypes.VideoFormat, "h264-mp4"),
                ["audio"] = AttachedAudio?.Path
            }, id);
        }
        if (DataType == DT_AUDIO)
        {
            WGAssert(AttachedAudio is null, $"Cannot attach audio onto other audio.");
            // TODO: SwarmSaveAudio? Better format control instead of just using mp3?
            return Gen.CreateNode("SaveAudioMP3", new JObject()
            {
                ["audio"] = Path,
                ["filename_prefix"] = $"SwarmUI_{Random.Shared.Next():X4}_",
                ["quality"] = "V0"
            }, id);
        }
        WGAssert(false, $"Unknown data type {DataType}, cannot save output.");
        return null;
    }

    /// <summary>Helper, check a condition and throw a <see cref="SwarmReadableErrorException"/> if it is wrong.</summary>
    public static void WGAssert(bool condition, string message)
    {
        if (!condition)
        {
            Logs.Debug($"Stack trace for WGAssert failure:\n{Environment.StackTrace}");
            throw new SwarmReadableErrorException($"Workflow generator failed from mishandling data: {message}");
        }
    }
}
