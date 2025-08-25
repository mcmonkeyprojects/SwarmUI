
class SelectedLora {
    constructor(name, weight, confinement, model) {
        this.name = name;
        this.weight = weight || loraHelper.loraWeightPref[name] || 1;
        this.confinement = confinement || 0;
        this.model = model;
    }

    setWeight(weight) {
        this.weight = weight;
        loraHelper.loraWeightPref[this.name] = weight;
    }
}

/** Helper class for managing LoRA selections in the UI. */
class LoraHelper {

    /** List of currently selected LoRAs. */
    selected = [];

    /** Map of rendered LoRA names to their UI elements. */
    rendered = {};

    /** Map of LoRA names to their last-used weights. */
    loraWeightPref = {};

    /** If true, the helper is currently modifying parameters, and should not reload from parameter change events. */
    dedup = false;

    /** Get the "LoRAs" parameter input element. */
    getLorasInput() {
        return document.getElementById('input_loras');
    }

    /** Get the currently selected LoRAs from the "LoRAs" parameter input element. */
    getLoraParamSelections() {
        let loraInput = this.getLorasInput();
        if (!loraInput) {
            return [];
        }
        return [...loraInput.selectedOptions].map(option => option.value);
    }

    /** Get the "LoRA Weights" parameter type info. */
    getWeightsParam() {
        return gen_param_types.find(p => p.id == 'loraweights');
    }

    /** Get the "LoRA Weights" parameter input element. */
    getLoraWeightsInput() {
        return document.getElementById('input_loraweights');
    }

    /** Get the "LoRA Section Confinement" parameter input element. */
    getLoraConfinementInput() {
        return document.getElementById('input_lorasectionconfinement');
    }

    /** Get the container element for the bottom-bar LoRA listing UI. */
    getUIListContainer() {
        return getRequiredElementById('current_lora_list_view');
    }

    /** Load the current LoRA selections from parameter data. */
    loadFromParams() {
        if (this.dedup) {
            return;
        }
        this.selected = [];
        let loraInput = this.getLorasInput();
        let loraWeightsInput = this.getLoraWeightsInput();
        let loraConfinementInput = this.getLoraConfinementInput();
        if (!loraInput || !loraWeightsInput || !loraConfinementInput) {
            this.rebuildUI();
            return;
        }
        let loraVals = this.getLoraParamSelections();
        let weightVals = loraWeightsInput.value.split(',');
        let confinementVals = loraConfinementInput.value.split(',');
        for (let i = 0; i < loraVals.length; i++) {
            this.selected.push(new SelectedLora(loraVals[i], weightVals.length > i ? parseFloat(weightVals[i]) : null, confinementVals.length > i ? parseInt(confinementVals[i]) : null, null));
        }
        this.rebuildUI();
    }

    /** Rebuild the bottom-bar LoRA listing UI to show the currently selected LoRAs. */
    rebuildUI() {
        let toRender = this.getLorasInput() ? this.selected : [];
        let container = this.getUIListContainer();
        for (let lora of toRender) {
            let renderElem = this.rendered[lora.name];
            if (renderElem) {
                renderElem.weightInput.value = lora.weight;
            }
            else {
                let div = createDiv(null, 'preset-in-list');
                div.dataset.lora_name = lora.name;
                div.innerText = cleanModelName(lora.name);
                let weightInput = document.createElement('input');
                weightInput.className = 'lora-weight-input';
                weightInput.type = 'number';
                let weightsParam = this.getWeightsParam();
                weightInput.min = weightsParam ? weightsParam.min : -10;
                weightInput.max = weightsParam ? weightsParam.max : 10;
                weightInput.step = weightsParam ? weightsParam.step : 0.1;
                weightInput.value = lora.weight;
                weightInput.addEventListener('change', () => {
                    lora.setWeight(weightInput.value);
                    this.rebuildParams();
                });
                weightInput.addEventListener('input', () => {
                    lora.setWeight(weightInput.value);
                    this.rebuildParams();
                });
                let removeButton = createDiv(null, 'preset-remove-button');
                removeButton.innerHTML = '&times;';
                removeButton.title = "Remove this LoRA";
                removeButton.addEventListener('click', () => {
                    this.selectLora(lora);
                    sdLoraBrowser.rebuildSelectedClasses();
                });
                div.appendChild(weightInput);
                div.appendChild(removeButton);
                container.appendChild(div);
                this.rendered[lora.name] = {
                    div: div,
                    weightInput: weightInput,
                    removeButton: removeButton,
                };
            }
        }
        for (let lora of Object.keys(this.rendered)) {
            if (!this.selected.find(l => l.name == lora)) {
                this.rendered[lora].div.remove();
                delete this.rendered[lora];
            }
        }
        getRequiredElementById('current_loras_wrapper').style.display = toRender.length > 0 ? 'inline-block' : 'none';
        getRequiredElementById('lora_info_slot').innerText = ` (${toRender.length})`;
        setTimeout(() => {
            genTabLayout.reapplyPositions();
        }, 1);
    }

    /** Rebuild the LoRA parameter values to match the currently selected LoRAs. */
    rebuildParams() {
        let loraInput = this.getLorasInput();
        let loraWeightsInput = this.getLoraWeightsInput();
        let loraConfinementInput = this.getLoraConfinementInput();
        if (!loraInput || !loraWeightsInput || !loraConfinementInput) {
            return;
        }
        let loraVals = [];
        let weightVals = [];
        let confinementVals = [];
        let anyConfined = false;
        for (let lora of this.selected) {
            loraVals.push(lora.name);
            weightVals.push(lora.weight);
            confinementVals.push(lora.confinement);
            if (lora.confinement != 0) {
                anyConfined = true;
            }
        }
        this.dedup = true;
        let oldLoraVals = this.getLoraParamSelections();
        if (!arraysEqual(oldLoraVals, loraVals)) {
            $(loraInput).val(null);
            if (loraVals.length > 0) {
                $(loraInput).val(loraVals);
            }
            $(loraInput).trigger('change');
            triggerChangeFor(loraInput);
            let toggler = document.getElementById('input_loras_toggle');
            if (loraVals.length == 0 && toggler) {
                toggler.checked = false;
                triggerChangeFor(toggler);
            }
        }
        let weightStr = weightVals.join(',');
        let confinementStr = anyConfined ? confinementVals.join(',') : '';
        if (loraWeightsInput.value != weightStr) {
            loraWeightsInput.value = weightStr;
            triggerChangeFor(loraWeightsInput);
            let toggler = document.getElementById('input_loraweights_toggle');
            if (weightStr.length == 0 && toggler) {
                toggler.checked = false;
                triggerChangeFor(toggler);
            }
        }
        if (loraConfinementInput.value != confinementStr) {
            loraConfinementInput.value = confinementStr;
            triggerChangeFor(loraConfinementInput);
            let toggler = document.getElementById('input_lorasectionconfinement_toggle');
            if (confinementStr.length == 0 && toggler) {
                toggler.checked = false;
                triggerChangeFor(toggler);
            }
        }
        this.dedup = false;
    }

    /** Selects or deselects a single LoRA and broadcasts the change to parameters and UI. */
    selectLora(lora) {
        let loraInput = this.getLorasInput();
        if (!loraInput) {
            showError("Cannot set LoRAs currently. Are you using a custom workflow? LoRAs only work in the default mode.");
            return;
        }
        let name = lora;
        let data = null;
        if (name instanceof SelectedLora) {
            name = lora.name;
        }
        else if (typeof lora == 'object' && lora.name) {
            name = lora.name;
            data = lora;
        }
        name = cleanModelName(name);
        let selected = this.selected.find(l => l.name == name);
        if (selected) {
            this.selected = this.selected.filter(l => l.name != name);
        }
        else {
            this.selected.push(new SelectedLora(name, null, null, data));
        }
        this.rebuildParams();
        this.rebuildUI();
    }
    
}

loraHelper = new LoraHelper();
