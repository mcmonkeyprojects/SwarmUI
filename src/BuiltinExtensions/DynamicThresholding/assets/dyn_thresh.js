postParamBuildSteps.push(() => {
    let dynThreshGroup = document.getElementById('input_group_content_dynamicthresholding');
    if (dynThreshGroup && !currentBackendFeatureSet.includes('dynamic_thresholding')) {
        dynThreshGroup.append(createDiv(`dynamic_thresholding_install_button`, 'keep_group_visible', `<button class="basic-button" onclick="installFeatureById('dynamic_thresholding', 'dynamic_thresholding_install_button')">Install Dynamic Thresholding</button>`));
    }
});
