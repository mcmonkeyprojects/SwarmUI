# Pipeline Mode

Pipeline mode enables sequential multi-stage image generation workflows directly in the SwarmUI frontend. Chain generation, upscaling, and refinement stages together with full control over settings at each step.

## Overview

Pipeline mode lets you:
- Chain multiple generation stages together (Generate → Upscale → Refine → AI Upscale)
- Run individual stages independently or the full pipeline end-to-end
- Override or inherit settings (prompt, seed, model, dimensions) from previous stages
- Save and load pipeline presets for repeatable workflows
- Compare outputs from different stages side-by-side

## Getting Started

1. Switch to **Pipeline** mode in the workspace selector
2. Add stages using the **Add Stage** button
3. Configure each stage's settings by expanding the stage card
4. Click **Run Pipeline** to execute all enabled stages sequentially

## Stage Types

### Generate
Creates a new image from your prompt. This is typically the first stage in a pipeline.

**Key settings:**
- Model: Select the base generation model
- Steps: Number of generation steps (1-200)
- CFG Scale: Prompt adherence strength (1-20)

### Latent Upscale
Upscales the image in latent space before refinement. Faster than AI upscaling but lower quality.

**Key settings:**
- Scale Factor: Multiplier for image dimensions (1x-4x)
- Upscale Method: Algorithm used for upscaling (latent, latentmodel variants)

### Refine
Re-processes an existing image with a denoise strength to add detail or correct artifacts.

**Key settings:**
- Denoise Strength: How much to modify the image (0.05-0.7)
- Steps: Refinement step count (5-50)
- Refiner Model: Model used for refinement (defaults to base model)
- CFG Scale: Prompt adherence during refinement

### AI Upscale
Uses dedicated upscaler models to increase image resolution with AI enhancement.

**Key settings:**
- Scale Factor: Multiplier for image dimensions (1x-4x)
- Upscaler Model: Dedicated upscaler model to use

## Settings Inheritance

Each stage can inherit settings from the previous stage's output:

- **Prompt**: Inherits the prompt used to generate the previous image
- **Negative Prompt**: Inherits the negative prompt from the previous stage
- **Seed**: Options include:
  - `inherit`: Use the same seed as the previous stage
  - `increment`: Use the previous seed + 1
  - `random`: Generate a new random seed (-1)

## Running Pipelines

### Full Pipeline
Click **Run Pipeline** to execute all enabled stages in sequence. Each stage uses the output of the previous stage as its input image.

### Single Stage
Click the **Play** icon on any stage card to run only that stage. If it's not the first stage, it will use the most recent output from the previous stage as input.

### Stopping
Click **Stop Pipeline** or press **Escape** to halt execution mid-run. Completed stages retain their outputs.

## Keyboard Shortcuts

- **Ctrl+Enter**: Run the pipeline (when not running)
- **Escape**: Stop the pipeline (when running)

## Presets

### Built-in Presets
- **Fast Preview**: Quick generation with default settings
- **Quick Upscale**: Generate → AI Upscale 2x
- **Quality SDXL**: Generate (30 steps) → Refine
- **Full Enhancement**: Generate → Latent Upscale 2x → Refine → AI Upscale 2x
- **Upscale Existing**: AI Upscale only (run on existing image)
- **Refine Existing**: Refine only (improve existing image)

### Saving Custom Presets
1. Configure your pipeline stages
2. Click **Save** to create a new preset
3. Name and describe your preset
4. Load it anytime from the **Presets** dropdown

## Progress Tracking

The progress bar shows:
- Overall completion percentage
- Individual stage status (pending → running → completed/error)
- Current stage name with animated spinner during execution

## Image Comparison

After running multiple stages, use the **Stage Comparison** section to view outputs side-by-side. Toggle the compare view to analyze differences between stages.

## Troubleshooting

### Pipeline fails on a stage
- Check that the required model is loaded
- Verify the previous stage completed successfully
- Review the error message in the progress section

### No output image
- Ensure the stage is enabled (toggle switch is on)
- Check that settings are valid (e.g., scale factor > 0)
- Verify backend is connected and ready

### Slow execution
- Reduce step counts for faster iterations
- Use latent upscaling before AI upscaling for better performance
- Consider running stages individually to identify bottlenecks
