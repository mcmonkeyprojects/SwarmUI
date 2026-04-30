
class ImageBatcherClass {

    syncSideLengthInputs(baseId) {
        let slider = getRequiredElementById(`${baseId}`);
        let number = getRequiredElementById(`${baseId}_display`);
        slider.addEventListener('input', () => {
            number.value = slider.value;
        });
        number.addEventListener('input', () => {
            slider.value = number.value;
        });
    }

    updateSideLengthModeVisibility() {
        let isSideLength = getRequiredElementById('ext_image_batcher_res_mode').value == 'Scale Input To Side Length';
        let useSameSideLength = getRequiredElementById('ext_image_batcher_use_same_side_length').checked;
        getRequiredElementById('ext_image_batcher_side_length_wrap').style.display = isSideLength ? 'flex' : 'none';
        getRequiredElementById('ext_image_batcher_output_side_length_wrap').style.display = isSideLength && !useSameSideLength ? 'flex' : 'none';
    }

    doGenerate() {
        resetBatchIfNeeded();
        let batch_id = mainGenHandler.getBatchId();
        let inData = {
            'baseParams': getGenInput(),
            'input_folder': getRequiredElementById('ext_image_batcher_inputfolder').value,
            'output_folder': getRequiredElementById('ext_image_batcher_outputfolder').value,
            'init_image': getRequiredElementById('ext_image_batcher_use_as_init').checked,
            'revision': getRequiredElementById('ext_image_batcher_use_as_revision').checked,
            'controlnet': getRequiredElementById('ext_image_batcher_use_as_controlnet').checked,
            'append_filename_to_prompt': getRequiredElementById('ext_image_batcher_append_filename_to_prompt').checked,
            'resMode': getRequiredElementById('ext_image_batcher_res_mode').value,
            'use_same_side_length': getRequiredElementById('ext_image_batcher_use_same_side_length').checked,
            'input_side_length': parseInt(getRequiredElementById('ext_image_batcher_input_side_length').value) || 1024,
            'output_side_length': parseInt(getRequiredElementById('ext_image_batcher_output_side_length').value) || 1024
        };
        let timeLastGenHit = [Date.now()];
        let images = {};
        let discardable = {};
        makeWSRequestT2I('ImageBatchRun', inData, data => {
            mainGenHandler.internalHandleData(data, images, discardable, timeLastGenHit, inData.baseParams, null, null, false);
        });
    }

    register() {
        let doGenWrapper = () => {
            currentModelHelper.ensureCurrentModel(() => {
                if (document.getElementById('current_model').value == '') {
                    showError("Cannot run generate batch, no model selected.");
                    return;
                }
                this.doGenerate();
            });
        };
        this.mainDiv = registerNewTool('image_batcher', 'Image Edit Batcher', 'Run Batch', doGenWrapper);
        this.mainDiv.innerHTML = `The Image Batcher tool lets you run a batch of images from an arbitrary local file folder through SD and export to another folder. Use the settings below to pick which folders, and which values the images shall be fed as inputs to, then click the primary Generate button above.<br><b>IMPORTANT:</b> make sure the parameters you're using are enabled. If you're using batched Inits, you need the Init Image parameter group enabled!<br>`
            + makeTextInput(null, 'ext_image_batcher_inputfolder', '', 'Input Folder', 'Folder path for input images.', '', 'normal', 'Folder path for input images.\nThis folder should contain a non-recursive single layer of image files (png/jpg).', false, true, true)
            + makeTextInput(null, 'ext_image_batcher_outputfolder', '', 'Output Folder', 'Folder path for image output.', '', 'normal', 'Folder path for image output.\nIt is highly recommended that this is an empty folder.', false, true, true)
            + makeCheckboxInput(null, 'ext_image_batcher_use_as_init', '', 'Use As Init', 'Whether to use the image as the Init Image parameter.', true, false, true, true)
            + makeCheckboxInput(null, 'ext_image_batcher_use_as_controlnet', '', 'Use As ControlNet Input', 'Whether to use the image as input to ControlNet (only applies if a ControlNet model is enabled).', true, false, true, true)
            + makeCheckboxInput(null, 'ext_image_batcher_use_as_revision', '', 'Use As Image Prompt', 'Whether to use the image as an Image Prompting input.', false, false, true, true)
            + makeCheckboxInput(null, 'ext_image_batcher_append_filename_to_prompt', '', 'Append Filename to Prompt', 'Whether to append the filename to the prompt.', false, false, true, true)
            + makeGenericPopover('ext_image_batcher_res_mode', 'Resolution', 'Dropdown', `Choose how the batcher sets generation resolution.<ul><li><b>From Parameter:</b> Keep the current width and height from the main parameter panel.</li><li><b>From Image:</b> Use each input image's current resolution directly.</li><li><b>Scale To Model:</b> Resize the output resolution to fit the selected model's preferred pixel count while keeping aspect ratio.</li><li><b>Scale To Model Or Above:</b> Like Scale To Model, but never shrink below the input image's current size.</li><li><b>Scale Input To Side Length:</b> Resize the input image so its total pixel count approximates side length squared (e.g. ~1024x1024 pixels at side length 1024), maintaining the original aspect ratio.</li></ul>`, '')
            + `<div style="display:flex;align-items:flex-start;gap:6px;flex-direction:column;"><span style="display:inline-flex;align-items:center;gap:6px;">Resolution: <span class="auto-input-qbutton info-popover-button" onclick="doPopover('ext_image_batcher_res_mode', arguments[0])">?</span><select id="ext_image_batcher_res_mode"><option>From Parameter</option><option>From Image</option><option>Scale To Model</option><option>Scale To Model Or Above</option><option>Scale Input To Side Length</option></select></span><span id="ext_image_batcher_side_length_wrap" style="display:none;flex-direction:column;align-items:flex-start;gap:8px;">`
            + makeCheckboxInput(null, 'ext_image_batcher_use_same_side_length', '', 'Use same side length for input and output', 'When checked, the output resolution matches the scaled input resolution exactly. When unchecked, the output resolution is independently scaled to the Output Side Length squared, maintaining the same aspect ratio.', true, false, true, true)
            + `<span style="display:inline-flex;align-items:center;gap:4px;">Input Side Length: <input type="range" id="ext_image_batcher_input_side_length" min="64" max="4096" step="64" value="1024" style="width:240px;"><input type="number" id="ext_image_batcher_input_side_length_display" min="64" max="4096" step="64" value="1024" style="width:72px;"></span><span id="ext_image_batcher_output_side_length_wrap" style="display:none;align-items:center;gap:4px;">Output Side Length: <input type="range" id="ext_image_batcher_output_side_length" min="64" max="4096" step="64" value="1024" style="width:240px;"><input type="number" id="ext_image_batcher_output_side_length_display" min="64" max="4096" step="64" value="1024" style="width:72px;"></span></span></div>`;
        document.getElementById('ext_image_batcher_res_mode').addEventListener('change', () => {
            this.updateSideLengthModeVisibility();
        });
        document.getElementById('ext_image_batcher_use_same_side_length').addEventListener('change', () => {
            this.updateSideLengthModeVisibility();
        });
        this.syncSideLengthInputs('ext_image_batcher_input_side_length');
        this.syncSideLengthInputs('ext_image_batcher_output_side_length');
        this.updateSideLengthModeVisibility();
        toolSelector.addEventListener('change', () => {
            if (toolSelector.value == 'image_batcher') {
                showRevisionInputs();
            }
            else {
                autoRevealRevision();
            }
        });
        revisionRevealerSources.push(() => {
            return toolSelector.value == 'image_batcher';
        });
    }
}

let extensionImageBatcher = new ImageBatcherClass();
sessionReadyCallbacks.push(() => {
    extensionImageBatcher.register();
});
