// TODO

let all_metadata = {};

function getScoreFor(img) {
    let meta = all_metadata[img] || {};
    return ((meta['sui_image_params'] || {})['scoring'] || {})['average'] || ((meta['sui_extra_data'] || {})['scoring'] || {})['average'] || null;
}

function getMetadataScriptFor(slashed) {
    return `${slashed}.metadata.js`;
}

function getMetadataForImage(img) {
    let data = all_metadata[img.dataset.img_path];
    if (!data) {
        return "";
    }
    return formatMetadata(data);
}

function formatMetadata(metadata) {
    if (!metadata || !metadata['sui_image_params']) {
        return '';
    }
    let result = '';
    function appendObject(obj) {
        for (let key of Object.keys(obj)) {
            let val = obj[key];
            if (val) {
                if (typeof val == 'object') {
                    result += `${key}: `;
                    appendObject(val);
                    result += `, `;
                }
                else {
                    result += `${key}: ${val}, `;
                }
            }
        }
    };
    appendObject(metadata.sui_image_params);
    if ('sui_extra_data' in metadata) {
        appendObject(metadata.sui_extra_data);
    }
    return result;
}
