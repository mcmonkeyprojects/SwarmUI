function toggleMobileMenu() {
    document.getElementById('input_sidebar').classList.toggle('mobile-open');
    document.getElementById('simple_input_sidebar').classList.toggle('mobile-open');
}

function switchMobileTab(e) {
  const bottomTab = document.querySelectorAll('#bottombartabcollection .nav-link');
  bottomTab.forEach(tab => {if(tab.getAttribute('href') == e?.target?.value){tab.click()}})
}

let longPressTimer;
const longPressDuration = 500; // milliseconds
let isLongPress = false;

function initializeMobileUI() {
    const tabSelector = document.getElementById('mobile_tab_selector');
    document.querySelectorAll('#bottombartabcollection .nav-link').forEach(tab => {
        const option = document.createElement('option');
        option.setAttribute("data-bs-toggle", "tab")
        option.value = tab.getAttribute('href');
        option.textContent = tab.textContent;
        tabSelector.appendChild(option);
    });
    tabSelector.value = window.location.hash.split(",")[0]

    if(isLikelyMobile()){
      let bttButton = document.getElementById("btn-back-to-top");
      if (bttButton) {
        // document.querySelector(".tab-content").addEventListener("scroll", () => scrollFunction(bttButton));
        bttButton.addEventListener("click", () => backToTop());
      }
      let genButtonMobile = document.getElementById("alt_generate_button_mobile");
      genButtonMobile.addEventListener('touchstart', mobileButtonLongPress);
      genButtonMobile.addEventListener('touchend', mobileButtonLongPressEnd);
      genButtonMobile.addEventListener('mousedown', mobileButtonLongPress);
      genButtonMobile.addEventListener('mouseup', mobileButtonLongPressEnd);
      genButtonMobile.addEventListener('mouseleave', mobileButtonLongPressEnd);
    }
}

function isMobile() {
  const touchDevice = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
  const smallScreen = window.matchMedia("(max-width: 768px)").matches;
  return smallScreen && (touchDevice || true);
}

function isMobileUserAgent() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

function isLikelyMobile() {
  return isMobile() || isMobileUserAgent();
}

function scrollFunction(element) {
  if (document.querySelector(".tab-content").scrollTop > 20) {
    element.style.display = "block";
  } else {
    element.style.display = "none";
  }
}

function backToTop() {
  document.querySelector(".tab-content").scrollTop = 0;
}

const addMaximumScaleToMetaViewport = () => {
  const el = document.querySelector('meta[name=viewport]');

  if (el !== null) {
    let content = el.getAttribute('content');
    let re = /maximum\-scale=[0-9\.]+/g;

    if (re.test(content)) {
        content = content.replace(re, 'maximum-scale=1.0');
    } else {
        content = [content, 'maximum-scale=1.0'].join(', ')
    }

    el.setAttribute('content', content);
  }
};

const disableIosTextFieldZoom = addMaximumScaleToMetaViewport;

if (isIOS()) {
  disableIosTextFieldZoom();
}

function showMobileMenu() {
    // Create and show a popup menu with additional options
    const menu = document.createElement('div');
    menu.className = 'mobile-menu';
    menu.innerHTML = `
        <div style="display: flex; flex-direction: column; justify-content: space-around; align-items: center; gap: 10px;">
          <button onclick="doPopover('generate_center')">Options</button>
          <button onclick="mainGenHandler.doInterrupt()">Interrupt</button>
          <button onclick="backToTop()" id="btn-back-to-top">Top</button>
        </div>
    `;

    const button = document.getElementById('alt_generate_button_mobile');
    const rect = button.getBoundingClientRect();

    menu.style.position = 'fixed';
    menu.style.left = `${rect.left - 25}px`;
    menu.style.top = `${rect.top - 100}px`;

    document.body.appendChild(menu);

    // Close menu when clicking outside
    document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== button) {
            document.body.removeChild(menu);
            document.removeEventListener('click', closeMenu);
        }
    });
}

function mobileButtonLongPress() {
  isLongPress = false;
  longPressTimer = setTimeout(() => {
      // Show the menu with additional options
      isLongPress = true;
      showMobileMenu();
  }, longPressDuration);
}

function mobileButtonLongPressEnd(event) {
  clearTimeout(longPressTimer);
  if (isLongPress) {
    event.preventDefault();
    event.stopPropagation();
  }
  isLongPress = false;
}

document.addEventListener('DOMContentLoaded', initializeMobileUI);
