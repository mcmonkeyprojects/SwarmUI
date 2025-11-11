using FreneticUtilities.FreneticExtensions;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Media;
using SwarmUI.Utils;

namespace SwarmUI.Text2Image;

/// <summary>
/// Internal set of parameters tracker, notably used as the internal component of <see cref="T2IParamInput"/>.
/// </summary>
public class T2IParamSet
{
    /// <summary>The raw values in this input. Do not use this directly, instead prefer:
    /// <see cref="Get{T}(T2IRegisteredParam{T})"/>, <see cref="TryGet{T}(T2IRegisteredParam{T}, out T)"/>,
    /// <see cref="Set{T}(T2IRegisteredParam{T}, string)"/>.</summary>
    public Dictionary<string, object> ValuesInput = [];

    /// <summary>The session this input came from.</summary>
    public Session SourceSession;

    /// <summary>Returns a perfect duplicate of this parameter set, with new reference addresses.</summary>
    public T2IParamSet Clone()
    {
        T2IParamSet toret = MemberwiseClone() as T2IParamSet;
        toret.ValuesInput = new Dictionary<string, object>(ValuesInput.Count);
        foreach ((string key, object val) in ValuesInput)
        {
            object useVal = val;
            if (useVal is List<string> strs) { useVal = new List<string>(strs); }
            else if (useVal is List<Image> imgs) { useVal = new List<Image>(imgs); }
            else if (useVal is List<T2IModel> models) { useVal = new List<T2IModel>(models); }
            toret.ValuesInput[key] = useVal;
        }
        return toret;
    }

    /// <summary>Lock in valid seeds to this set (ie remove '-1' seed values).</summary>
    public void LockSeeds()
    {
        if (!TryGet(T2IParamTypes.Seed, out long seed) || seed == -1)
        {
            Set(T2IParamTypes.Seed, Random.Shared.Next());
        }
        if (TryGet(T2IParamTypes.VariationSeed, out long varSeed) && varSeed == -1)
        {
            Set(T2IParamTypes.VariationSeed, Random.Shared.Next());
        }
    }

    /// <summary>Gets the raw value of the parameter, if it is present, or null if not.</summary>
    public object GetRaw(T2IParamType param)
    {
        return ValuesInput.GetValueOrDefault(param.ID);
    }

    /// <summary>Gets the value of the parameter, if it is present, or default if not.</summary>
    public T Get<T>(T2IRegisteredParam<T> param) => Get(param, default, true);

    /// <summary>Gets the value of the parameter, if it is present, or default if not.</summary>
    public T Get<T>(T2IRegisteredParam<T> param, T defVal, bool autoFixDefault = false)
    {
        if (!ValuesInput.TryGetValue(param.Type.ID, out object val))
        {
            if (autoFixDefault && !string.IsNullOrWhiteSpace(param.Type.Default))
            {
                Set(param.Type, param.Type.Default);
                T result = Get(param, defVal, false);
                Remove(param);
                return result;
            }
            return defVal;
        }
        if (val is long lVal && typeof(T) == typeof(int))
        {
            val = (int)lVal;
        }
        if (val is double dVal && typeof(T) == typeof(float))
        {
            val = (float)dVal;
        }
        return (T)val;
    }

    /// <summary>Gets the value of the parameter as a string, if it is present, or null if not.</summary>
    public string GetString<T>(T2IRegisteredParam<T> param)
    {
        if (ValuesInput.TryGetValue(param.Type.ID, out object val))
        {
            return $"{(T)val}";
        }
        return null;
    }

    /// <summary>Tries to get the value of the parameter. If it is present, returns true and outputs the value. If it is not present, returns false.</summary>
    public bool TryGet<T>(T2IRegisteredParam<T> param, out T val)
    {
        if (ValuesInput.TryGetValue(param.Type.ID, out object valObj))
        {
            val = (T)valObj;
            return true;
        }
        val = default;
        return false;
    }

    /// <summary>Tries to get the value of the parameter. If it is present, returns true and outputs the value. If it is not present, returns false.</summary>
    public bool TryGetRaw(T2IParamType param, out object val)
    {
        if (ValuesInput.TryGetValue(param.ID, out object valObj))
        {
            val = valObj;
            return true;
        }
        val = default;
        return false;
    }

    /// <summary>Sets the value of an input parameter to a given plaintext input. Will run the 'Clean' call if needed.</summary>
    public void Set(T2IParamType param, string val)
    {
        if (param.Clean is not null)
        {
            val = param.Clean(ValuesInput.TryGetValue(param.ID, out object valObj) ? valObj.ToString() : null, val);
        }
        T2IModel getModel(string name)
        {
            T2IModelHandler handler = Program.T2IModelSets[param.Subtype ?? "Stable-Diffusion"];
            string best = T2IParamTypes.GetBestModelInList(name.Replace('\\', '/'), [.. handler.ListModelNamesFor(SourceSession)]);
            if (best is null)
            {
                return null;
            }
            T2IModel model = handler.GetModel(best);
            if (model is null)
            {
                return null;
            }
            model.AutoWarn();
            if (Program.ServerSettings.Metadata.ImageMetadataIncludeModelHash)
            {
                model.GetOrGenerateTensorHashSha256(); // Ensure hash is preloaded early
            }
            return model;
        }
        if (param.IgnoreIf is not null && param.IgnoreIf == val)
        {
            ValuesInput.Remove(param.ID);
            return;
        }
        ImageFile imageFor(string val)
        {
            if (val.StartsWithFast("data:"))
            {
                return ImageFile.FromDataString(val);
            }
            return ImageFile.FromBase64(val, MediaType.ImagePng);
        }
        AudioFile audioFor(string val)
        {
            if (val.StartsWithFast("data:"))
            {
                return AudioFile.FromDataString(val);
            }
            return AudioFile.FromBase64(val, MediaType.AudioWav);
        }
        VideoFile videoFor(string val)
        {
            if (val.StartsWithFast("data:"))
            {
                return VideoFile.FromDataString(val);
            }
            return VideoFile.FromBase64(val, MediaType.AudioWav);
        }
        object obj = param.Type switch
        {
            T2IParamDataType.INTEGER => param.SharpType == typeof(long) ? long.Parse(val) : int.Parse(val),
            T2IParamDataType.DECIMAL => param.SharpType == typeof(double) ? double.Parse(val) : float.Parse(val),
            T2IParamDataType.BOOLEAN => bool.Parse(val),
            T2IParamDataType.TEXT or T2IParamDataType.DROPDOWN => val,
            T2IParamDataType.IMAGE => imageFor(val),
            T2IParamDataType.IMAGE_LIST => val.Split(val.Contains("\n|||\n") ? "\n|||\n" : "|").Select(v => imageFor(v) as Image).ToList(),
            T2IParamDataType.MODEL => getModel(val),
            T2IParamDataType.LIST => val.Split(val.Contains("\n|||\n") ? "\n|||\n" : ",", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
            T2IParamDataType.AUDIO => audioFor(val),
            T2IParamDataType.VIDEO => videoFor(val),
            _ => throw new NotImplementedException()
        };
        if (param.SharpType == typeof(int))
        {
            obj = unchecked((int)(long)obj); // Yes this double-cast is needed. Unbox then data convert.
        }
        if (param.SharpType == typeof(float))
        {
            obj = (float)(double)obj;
        }
        if (obj is null)
        {
            Logs.Debug($"Ignoring input to parameter '{param.ID}' of '{val}' because the value maps to null.");
            return;
        }
        ValuesInput[param.ID] = obj;
    }

    /// <summary>Sets the direct raw value of a given parameter, without processing.</summary>
    public void Set<T>(T2IRegisteredParam<T> param, T val)
    {
        if (param.Type.Clean is not null)
        {
            Set(param.Type, val is List<string> list ? list.JoinString(",") : val.ToString());
            return;
        }
        if (param.Type.IgnoreIf is not null && param.Type.IgnoreIf == $"{val}")
        {
            ValuesInput.Remove(param.Type.ID);
            return;
        }
        ValuesInput[param.Type.ID] = val;
    }

    /// <summary>Removes a param.</summary>
    public void Remove<T>(T2IRegisteredParam<T> param)
    {
        ValuesInput.Remove(param.Type.ID);
    }

    /// <summary>Removes a param.</summary>
    public void Remove(T2IParamType param)
    {
        ValuesInput.Remove(param.ID);
    }
}
