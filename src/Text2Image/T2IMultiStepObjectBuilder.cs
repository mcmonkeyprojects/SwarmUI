using System;
using FreneticUtilities.FreneticExtensions;
using Newtonsoft.Json.Linq;
using ImageMagick;
using SwarmUI.Accounts;
using SwarmUI.Utils;
using SwarmUI.Media;

namespace SwarmUI.Text2Image;

/// <summary>This special utility class generates prompts that have multi-step object generation included.
/// Called by <see cref="T2IEngine"/>, should not be called directly.</summary>
public class T2IMultiStepObjectBuilder
{
    public static async Task<Image> CreateFullImage(string prompt, T2IParamInput user_input, string batchId, Session.GenClaim claim, Action<JObject> output, Action<string> setError, bool isWS, float backendTimeoutMin)
    {
        int obj = 0;
        async Task<MediaFile> createImageDirect(T2IParamInput user_input)
        {
            MediaFile result = null;
            await T2IEngine.CreateImageTask(user_input, batchId + (obj++), claim, output, setError, isWS, backendTimeoutMin, (img, meta) => { result = img.File; }, false);
            return result;
        }
        if (string.IsNullOrWhiteSpace(prompt) || !prompt.Contains("<object:"))
        {
            return null;
        }
        PromptRegion regions = new(prompt);
        PromptRegion.Part[] objects = [.. regions.Parts.Where(p => p.Type == PromptRegion.PartType.Object)];
        if (objects.IsEmpty())
        {
            return null;
        }
        user_input = user_input.Clone();
        if (user_input.TryGet(T2IParamTypes.AltResolutionHeightMult, out _))
        {
            user_input.Set(T2IParamTypes.Height, user_input.GetImageHeight());
            user_input.Remove(T2IParamTypes.AspectRatio);
            user_input.Remove(T2IParamTypes.AltResolutionHeightMult);
        }
        user_input.Remove(T2IParamTypes.RefinerModel);
        user_input.Remove(T2IParamTypes.RefinerUpscale);
        user_input.Remove(T2IParamTypes.RefinerMethod);
        //user_input.Set(T2IParamTypes.EndStepsEarly, 0.2);
        user_input.Set(T2IParamTypes.Seed, user_input.Get(T2IParamTypes.Seed) + 1);
        claim.Extend(1 + objects.Length);
        T2IParamInput basicInput = user_input.Clone();
        foreach (T2IParamTypes.ControlNetParamHolder controlnet in T2IParamTypes.Controlnets)
        {
            basicInput.Remove(controlnet.Model);
            basicInput.Remove(controlnet.Strength);
        }
        MediaFile file = await createImageDirect(basicInput);
        if (file is not ImageFile img)
        {
            return null;
        }
        //user_input.Set(T2IParamTypes.EndStepsEarly, 0.6); // TODO: Configurable
        using IMagickImage<ushort> liveImg = img.ToMagick.Clone();
        float overBound = 0.1f;
        foreach (PromptRegion.Part part in objects)
        {
            if (claim.ShouldCancel)
            {
                return null;
            }
            user_input.Set(T2IParamTypes.Seed, user_input.Get(T2IParamTypes.Seed) + 1);
            T2IParamInput objInput = user_input.Clone();
            int mpTarget = (int)(liveImg.Width * liveImg.Height);
            if (objInput.TryGet(T2IParamTypes.RegionalObjectInpaintingModel, out T2IModel model))
            {
                objInput.Set(T2IParamTypes.Model, model);
                if (model.StandardWidth > 0)
                {
                    mpTarget = model.StandardWidth * model.StandardHeight;
                }
            }
            objInput.Set(T2IParamTypes.Prompt, part.Prompt);
            int pixelX = (int)(part.X * liveImg.Width);
            int pixelY = (int)(part.Y * liveImg.Height);
            int pixelWidth = (int)(part.Width * liveImg.Width);
            int pixelHeight = (int)(part.Height * liveImg.Height);
            int extraX = Math.Max((int)((part.X - overBound * 0.5) * liveImg.Width), 0);
            int extraY = Math.Max((int)((part.Y - overBound * 0.5) * liveImg.Height), 0);
            int extraWidth = Math.Min((int)((part.Width + overBound) * liveImg.Width), (int)liveImg.Width - extraX);
            int extraHeight = Math.Min((int)((part.Height + overBound) * liveImg.Height), (int)liveImg.Height - extraY);
            (int fixedWidth, int fixedHeight) = Utilities.ResToModelFit(extraWidth, extraHeight, mpTarget);
            double scaleWidth = fixedWidth / (double)extraWidth;
            double scaleHeight = fixedHeight / (double)extraHeight;
            using IMagickImage<ushort> subImage = liveImg.Clone();
            subImage.Crop(new MagickGeometry(extraX, extraY, (uint)extraWidth, (uint)extraHeight));
            subImage.ResetPage();
            subImage.Resize(new MagickGeometry((uint)fixedWidth, (uint)fixedHeight) { IgnoreAspectRatio = true });
            using MagickImage maskImage = new(MagickColors.Black, (uint)fixedWidth, (uint)fixedHeight) { Depth = 8 };
            using MagickImage maskInnerImage = new(MagickColors.White, (uint)(pixelWidth * scaleWidth), (uint)(pixelHeight * scaleHeight)) { Depth = 8 };
            maskImage.Composite(maskInnerImage, (int)((pixelX - extraX) * scaleWidth), (int)((pixelY - extraY) * scaleHeight), CompositeOperator.Over);
            objInput.Set(T2IParamTypes.MaskImage, new(maskImage));
            objInput.Set(T2IParamTypes.Prompt, part.Prompt);
            objInput.Set(T2IParamTypes.InitImage, new Image(subImage));
            objInput.Set(T2IParamTypes.InitImageCreativity, part.Strength2);
            objInput.Set(T2IParamTypes.Width, fixedWidth);
            objInput.Set(T2IParamTypes.Height, fixedHeight);
            MediaFile objFile = await createImageDirect(objInput);
            if (objFile is not ImageFile objImg)
            {
                return null;
            }
            using IMagickImage<ushort> objectImage = objImg.ToMagick.Clone();
            objectImage.Resize(new MagickGeometry((uint)extraWidth, (uint)extraHeight) { IgnoreAspectRatio = true });
            liveImg.Composite(objectImage, extraX, extraY, CompositeOperator.Over);
            if (user_input.Get(T2IParamTypes.OutputIntermediateImages, false))
            {
                output(new JObject() { ["image"] = "data:image/png;base64," + new Image(liveImg).AsBase64, ["batch_index"] = $"{batchId}{obj++}", ["request_id"] = $"{user_input.UserRequestId}", ["metadata"] = null });
            }
        }
        return new(liveImg);
    }
}
