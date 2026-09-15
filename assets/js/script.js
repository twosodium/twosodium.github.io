'use strict';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('load', function () { window.scrollTo(0, 0); });

const filterBtn = document.querySelectorAll("[data-filter-btn]");
const filterItems = document.querySelectorAll("[data-filter-item]");

// Show only the project items matching the selected category.
const filterFunc = function (selectedValue) {
  for (let i = 0; i < filterItems.length; i++) {
    if (selectedValue === "all" || selectedValue === filterItems[i].dataset.category) {
      filterItems[i].classList.add("active");
    } else {
      filterItems[i].classList.remove("active");
    }
  }
}

let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i++) {
  filterBtn[i].addEventListener("click", function () {
    let selectedValue = this.innerText.toLowerCase();
    filterFunc(selectedValue);

    lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;
  });
}

const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function () {
    for (let i = 0; i < pages.length; i++) {
      if (this.innerHTML.toLowerCase() === pages[i].dataset.page) {
        pages[i].classList.add("active");
        navigationLinks[i].classList.add("active");
        window.scrollTo(0, 0);
      } else {
        pages[i].classList.remove("active");
        navigationLinks[i].classList.remove("active");
      }
    }
    document.body.classList.toggle("on-portfolio", this.innerHTML.trim().toLowerCase() === "portfolio");
  });
}

// Recolor the profile photo with the exact blue->white duotone the hero background uses.
(function () {
  var img = document.querySelector('.pfp img');
  if (!img) return;
  var DARK = [0.357, 0.424, 1.0], LIGHT = [1.0, 1.0, 1.0], CONTRAST = 1.75, BRIGHT = -0.2;
  var done = false;

  // Map each pixel's luminance through the duotone ramp and rewrite the image.
  function apply() {
    if (done) return;
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var id;
    try { id = ctx.getImageData(0, 0, w, h); } catch (e) { return; }
    var d = id.data;
    for (var i = 0; i < d.length; i += 4) {
      var lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      var t = (lum - 0.5) * CONTRAST + 0.5 + BRIGHT;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      d[i] = (DARK[0] + (LIGHT[0] - DARK[0]) * t) * 255;
      d[i + 1] = (DARK[1] + (LIGHT[1] - DARK[1]) * t) * 255;
      d[i + 2] = (DARK[2] + (LIGHT[2] - DARK[2]) * t) * 255;
    }
    ctx.putImageData(id, 0, 0);
    done = true;
    img.src = c.toDataURL();
  }

  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener('load', apply);
})();
