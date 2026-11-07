using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;

namespace SwarmUI.Text2Image;

/// <summary>A model's JSON element format for bounding box prompt tags.</summary>
public record class T2IBoundingBoxFormat
{
    /// <summary>ID of this format.</summary>
    public string ID;

    /// <summary>Creates an element from [0..1] range [x1,y1,x2,y2] coordinates, its prompt, canvas width/height, and a one-based element index.</summary>
    public Func<double[], string, int, int, int, JObject> Format;

    /// <summary>All registered bounding box formats.</summary>
    public static Dictionary<string, T2IBoundingBoxFormat> Formats = [];

    /// <summary>Registers a bounding box format for use by model families.</summary>
    public static T2IBoundingBoxFormat Register(T2IBoundingBoxFormat format)
    {
        Formats.Add(format.ID.ToLowerFast(), format);
        return format;
    }

    /// <summary>Converts bbox coordinates to integer y1,x1,y2,x2 coordinates on a 0-1000 grid.</summary>
    public static JArray ToYxyx1000(double[] box)
    {
        return new JArray((int)Math.Round(box[1] * 1000), (int)Math.Round(box[0] * 1000), (int)Math.Round(box[3] * 1000), (int)Math.Round(box[2] * 1000));
    }

    /// <summary>Converts a bbox coordinate to center-aligned format (eg MOSS).</summary>
    public static int ToCenteredPixel(double edge, int size, bool isMax)
    {
        double pixel = Math.Round(edge * size, 9);
        return (int)(isMax ? Math.Ceiling(pixel) : Math.Floor(pixel)) - size / 2;
    }

    /// <summary>Fallback JSON element with [0..1] range x1,y1,x2,y2 coordinates.</summary>
    public static T2IBoundingBoxFormat Generic = Register(new() { ID = "generic", Format = (box, prompt, width, height, index) => new JObject()
    {
        ["bbox"] = new JArray(box),
        ["desc"] = prompt
    }});

    /// <summary>Ideogram 4 elements: type, bbox, desc, in training key order. See https://github.com/ideogram-oss/ideogram4/blob/main/docs/prompting.md.</summary>
    public static T2IBoundingBoxFormat Ideogram4 = Register(new() { ID = "ideogram-4", Format = (box, prompt, width, height, index) => new JObject()
    {
        ["type"] = "obj",
        ["bbox"] = ToYxyx1000(box),
        ["desc"] = prompt
    }});

    /// <summary>FLUX 3 element table rows: id, bbox, desc. See https://huggingface.co/black-forest-labs/flux-3-image-klein-pup/blob/main/system_prompts.json.</summary>
    public static T2IBoundingBoxFormat Flux3 = Register(new() { ID = "flux-3", Format = (box, prompt, width, height, index) => new JObject()
    {
        ["id"] = $"object_{index}",
        ["bbox"] = ToYxyx1000(box),
        ["desc"] = prompt
    }});

    /// <summary>Fibo 2 objects with top-left x,y,w,h percentages rounded to one decimal.</summary>
    public static T2IBoundingBoxFormat Fibo2 = Register(new() { ID = "fibo-2", Format = (box, prompt, width, height, index) => new JObject()
    {
        ["description"] = prompt,
        ["bounding_box"] = new JArray(Math.Round(box[0] * 100, 1), Math.Round(box[1] * 100, 1), Math.Round((box[2] - box[0]) * 100, 1), Math.Round((box[3] - box[1]) * 100, 1))
    }});

    /// <summary>Ming Image layers with normalized center/width/height strings. See https://github.com/inclusionAI/Ming-Image/blob/main/assets/t2i_rewriter_system_prompt.txt.</summary>
    public static T2IBoundingBoxFormat MingImage = Register(new() { ID = "ming-image", Format = (box, prompt, width, height, index) => new JObject()
    {
        ["description"] = prompt,
        ["coordinates"] = $"cx: {(box[0] + box[2]) / 2:F3}, cy: {(box[1] + box[3]) / 2:F3}, w: {box[2] - box[0]:F3}, h: {box[3] - box[1]:F3}",
        ["hierarchy_and_relation"] = "",
        ["color_specs"] = new JArray()
    }});

    /// <summary>MOSS Image items with centered pixel y1,x1,y2,x2 boxes. See https://github.com/OpenMOSS/MOSS-Image/blob/main/skills/moss-image-prompt-enhancer/scripts/compile_prompt.py.</summary>
    public static T2IBoundingBoxFormat MossImage = Register(new() { ID = "moss-image", Format = (box, prompt, width, height, index) => new JObject()
    {
        ["label"] = "object",
        ["caption"] = prompt,
        ["bbox"] = new JArray(ToCenteredPixel(box[1], height, false), ToCenteredPixel(box[0], width, false), ToCenteredPixel(box[3], height, true), ToCenteredPixel(box[2], width, true))
    }});
}
