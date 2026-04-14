/**
 * Suggested optional overrides for multi-select tools:
 * - isAvailable(context)
 * - getActionLabel(items, context)
 * - getSelectionHint(items, context)
 * - getConfirmMessage(items, context)
 */
class MultiSelectTool {
    constructor(id, label, description = '') {
        this.id = id;
        this.label = label;
        this.description = description;
        this.manager = null;
    }

    register(manager) {
        this.manager = manager;
        manager.registerTool(this);
        return this;
    }

    isAvailable(context) {
        return true;
    }

    getActionLabel(items, context) {
        return this.label;
    }

    getSelectionHint(items, context) {
        return this.description;
    }

    getConfirmMessage(items, context) {
        return null;
    }

    evaluateSelection(items, context) {
        return {
            state: 'invalid',
            reason: `${this.label} has not implemented evaluateSelection().`
        };
    }

    normalizeSelection(items, context) {
        return items;
    }

    execute(items, context) {
    }

    cleanup(context) {
    }
}

/** Central helper class for batch multi-select mode and tool execution. */
class MultiSelectManager {
    constructor() {
        this.panel = getRequiredElementById('multiselect_tools_panel');
        this.summary = getRequiredElementById('multiselect_tools_summary');
        this.hint = getRequiredElementById('multiselect_tools_hint');
        this.list = getRequiredElementById('multiselect_tools_list');
        this.batch = getRequiredElementById('current_image_batch');
        this.tools = [];
        this.selectedItems = [];
        this.isActive = false;
        this.render();
    }

    registerTool(tool) {
        let existingIndex = this.tools.findIndex(existing => existing.id == tool.id);
        if (existingIndex >= 0) {
            this.tools.splice(existingIndex, 1, tool);
        }
        else {
            this.tools.push(tool);
        }
        tool.manager = this;
        this.render();
    }

    getContext(items = this.selectedItems) {
        return {
            manager: this,
            batch: this.batch,
            isActive: this.isActive,
            selectedCount: items.length
        };
    }

    getSelectionKey(itemOrDiv) {
        if (itemOrDiv.dataset) {
            return `${itemOrDiv.dataset.batch_id || ''}::${itemOrDiv.dataset.src || ''}`;
        }
        return `${itemOrDiv.batchId || ''}::${itemOrDiv.src || ''}`;
    }

    getMediaType(src) {
        if (isAudioExt(src)) {
            return 'audio';
        }
        if (isVideoExt(src)) {
            return 'video';
        }
        return 'image';
    }

    buildSelectionItem(div) {
        return {
            key: this.getSelectionKey(div),
            src: div.dataset.src,
            metadata: div.dataset.metadata || '',
            batchId: div.dataset.batch_id || '',
            requestId: div.dataset.request_id || '',
            previewText: div.dataset.preview_text || '',
            mediaType: this.getMediaType(div.dataset.src),
            element: div
        };
    }

    hasSelectableBatchItems() {
        for (let block of this.batch.getElementsByClassName('image-block')) {
            if (block.dataset.is_placeholder == 'true') {
                continue;
            }
            if (block.dataset.src) {
                return true;
            }
        }
        return false;
    }

    toggle() {
        if (this.isActive) {
            this.deactivate();
        }
        else {
            this.activate();
        }
    }

    activate() {
        if (this.isActive) {
            return;
        }
        if (!this.hasSelectableBatchItems()) {
            doNoticePopover('No images, videos, or audio in batch to multi-select.', 'notice-pop-red');
            return;
        }
        this.isActive = true;
        this.render();
    }

    deactivate() {
        if (!this.isActive) {
            return;
        }
        this.cleanupAllTools();
        this.isActive = false;
        this.selectedItems = [];
        this.render();
    }

    clearSelection() {
        this.cleanupAllTools();
        this.selectedItems = [];
        this.render();
    }

    onBatchCleared() {
        this.cleanupAllTools();
        this.selectedItems = [];
        this.render();
    }

    pruneSelection() {
        let pruned = false;
        this.selectedItems = this.selectedItems.filter(item => {
            let keep = item.element && item.element.isConnected && item.element.dataset && item.element.dataset.src == item.src;
            if (!keep) {
                pruned = true;
            }
            return keep;
        });
        return pruned;
    }

    handleBatchClick(div) {
        if (!this.isActive) {
            return false;
        }
        if (!div || !div.dataset || !div.dataset.src) {
            return true;
        }
        if (div.dataset.is_placeholder == 'true') {
            doNoticePopover('Wait for generation to finish before selecting it.', 'notice-pop-red');
            return true;
        }
        this.cleanupAllTools();
        let key = this.getSelectionKey(div);
        let existingIndex = this.selectedItems.findIndex(item => item.key == key);
        if (existingIndex >= 0) {
            this.selectedItems.splice(existingIndex, 1);
        }
        else {
            this.selectedItems.push(this.buildSelectionItem(div));
        }
        this.render();
        return true;
    }

    refreshBatchSelections() {
        let selectedKeys = new Set(this.selectedItems.map(item => item.key));
        for (let block of this.batch.getElementsByClassName('image-block')) {
            block.classList.toggle('image-block-multiselect-selected', selectedKeys.has(this.getSelectionKey(block)));
        }
    }

    normalizeEvaluation(evaluation) {
        if (!evaluation || typeof evaluation != 'object') {
            return { state: 'invalid', reason: 'Selection is not valid for this tool.' };
        }
        let state = evaluation.state;
        if (state != 'ready' && state != 'partial' && state != 'invalid') {
            state = 'invalid';
        }
        return {
            state,
            reason: evaluation.reason || ''
        };
    }

    getEvaluationForTool(tool, items = this.selectedItems) {
        let context = this.getContext(items);
        if (tool.isAvailable(context) == false) {
            return null;
        }
        let rawItems = [...items];
        let evaluation = this.normalizeEvaluation(tool.evaluateSelection(rawItems, context));
        let normalizedItems = rawItems;
        if (evaluation.state == 'ready') {
            normalizedItems = tool.normalizeSelection([...rawItems], context);
            if (!Array.isArray(normalizedItems)) {
                normalizedItems = rawItems;
            }
        }
        return {
            tool,
            items: normalizedItems,
            rawItems,
            context,
            state: evaluation.state,
            reason: evaluation.reason
        };
    }

    handleToolClick(tool) {
        let evaluation = this.getEvaluationForTool(tool);
        if (!evaluation) {
            return;
        }
        if (evaluation.state != 'ready') {
            doNoticePopover(evaluation.reason || 'Selection is not ready for this tool.', evaluation.state == 'invalid' ? 'notice-pop-red' : '');
            return;
        }
        let confirmMessage = tool.getConfirmMessage(evaluation.items, evaluation.context);
        if (confirmMessage && !confirm(confirmMessage)) {
            return;
        }
        try {
            tool.execute(evaluation.items, evaluation.context);
        }
        catch (error) {
            console.error(`Error running multi-select tool '${tool.id}':`, error);
            showError(`Failed to run multi-select tool '${tool.label}': ${error}`);
        }
        this.render();
    }

    cleanupAllTools() {
        let context = this.getContext();
        for (let tool of this.tools) {
            try {
                tool.cleanup(context);
            }
            catch (error) {
                console.error(`Error cleaning up multi-select tool '${tool.id}':`, error);
            }
        }
    }

    render() {
        if (this.pruneSelection()) {
            this.cleanupAllTools();
        }
        this.panel.classList.toggle('multiselect-tools-panel-visible', this.isActive);
        this.batch.classList.toggle('current-image-batch-multiselect-active', this.isActive);
        this.refreshBatchSelections();
        if (!this.isActive) {
            this.summary.textContent = '';
            this.hint.textContent = '';
            this.list.innerHTML = '';
            return;
        }
        let itemCount = this.selectedItems.length;
        this.summary.textContent = `${itemCount} item${itemCount == 1 ? '' : 's'} selected`;
        this.list.innerHTML = '';
        let readyTools = 0;
        for (let tool of this.tools) {
            let evaluation = this.getEvaluationForTool(tool);
            if (!evaluation) {
                continue;
            }
            if (evaluation.state == 'ready') {
                readyTools++;
            }
            let entry = createDiv(null, 'multiselect-tool-entry');
            let button = document.createElement('button');
            button.type = 'button';
            button.className = 'basic-button multiselect-tool-button';
            if (evaluation.state != 'ready') {
                button.classList.add('multiselect-tool-button-disabled');
            }
            button.textContent = tool.getActionLabel(evaluation.items, evaluation.context);
            button.title = tool.description || evaluation.reason || '';
            button.addEventListener('click', () => this.handleToolClick(tool));
            entry.appendChild(button);
            let note = createDiv(null, 'multiselect-tool-note');
            note.textContent = evaluation.reason || tool.getSelectionHint(evaluation.items, evaluation.context) || '';
            entry.appendChild(note);
            this.list.appendChild(entry);
        }
        if (itemCount == 0) {
            this.hint.textContent = 'Select batch items, then choose a tool.';
        }
        else if (readyTools > 0) {
            this.hint.textContent = `${readyTools} tool${readyTools == 1 ? '' : 's'} ready for the current selection.`;
        }
        else {
            this.hint.textContent = 'Update the selection to enable a tool.';
        }
    }
}

let multiSelectManager = new MultiSelectManager();

function toggleMultiSelectMode() {
    hidePopover('quicktools');
    multiSelectManager.toggle();
}

function clearMultiSelectSelection() {
    multiSelectManager.clearSelection();
}
