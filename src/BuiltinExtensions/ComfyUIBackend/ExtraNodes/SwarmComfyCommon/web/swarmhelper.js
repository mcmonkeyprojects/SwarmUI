import { api } from '../../scripts/api.js';
import { app } from '../../scripts/app.js';

window.swarmApiDirect = api;

let swarmSaveNodes = ['SwarmSaveImageWS', 'SwarmSaveAnimatedWebpWS', 'SwarmSaveAnimationWS'];
let swarmExecutingNode = null;

function swarmSniffMime(bytes) {
    let ascii = (start, len) => String.fromCharCode(...bytes.slice(start, start + len));
    if (ascii(0, 4) == 'RIFF' && ascii(8, 4) == 'WEBP') {
        return 'image/webp';
    }
    if (ascii(0, 3) == 'GIF') {
        return 'image/gif';
    }
    if (ascii(4, 4) == 'ftyp') {
        return 'video/mp4';
    }
    if (bytes[0] == 0x1A && bytes[1] == 0x45 && bytes[2] == 0xDF && bytes[3] == 0xA3) {
        return 'video/webm';
    }
    return null;
}

function swarmShowPreview(node, blob, isVideo) {
    let widget = node.widgets?.find(w => w.name == 'swarm_ws_preview');
    if (!widget) {
        let container = document.createElement('div');
        container.classList.add('comfy-img-preview');
        widget = node.addDOMWidget('swarm_ws_preview', 'swarm_ws_preview', container, { canvasOnly: true, hideOnZoom: false });
        widget.serialize = false;
        widget.computeLayoutSize = () => ({ minWidth: 0, minHeight: widget.swarmMinHeight || 256 });
    }
    let element = document.createElement(isVideo ? 'video' : 'img');
    if (isVideo) {
        element.muted = true;
        element.autoplay = true;
        element.loop = true;
        element.playsInline = true;
        element.controls = true;
    }
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.objectFit = 'contain';
    element.onload = element.onloadedmetadata = () => {
        let width = element.videoWidth || element.naturalWidth;
        let height = element.videoHeight || element.naturalHeight;
        widget.swarmMinHeight = height * Math.min(1, (node.size[0] || 256) / width);
        node.graph?.setDirtyCanvas(true);
    };
    let old = widget.element.firstChild;
    if (old) {
        URL.revokeObjectURL(old.src);
    }
    element.src = URL.createObjectURL(blob);
    widget.element.replaceChildren(element);
    delete app.nodePreviewImages?.[node.id];
}

api.addEventListener('executing', ({ detail }) => {
    swarmExecutingNode = detail?.display_node ?? detail?.node ?? detail;
});

api.addEventListener('b_preview', async ({ detail }) => {
    let node = app.graph.getNodeById(swarmExecutingNode);
    if (!node || !swarmSaveNodes.includes(node.comfyClass)) {
        return;
    }
    let head = new Uint8Array(await detail.slice(0, 12).arrayBuffer());
    let mime = swarmSniffMime(head) ?? detail.type;
    swarmShowPreview(node, detail.slice(0, detail.size, mime), mime.startsWith('video/'));
});
