import { CATEGORIES, configured, postToDrive } from "./api.js";

const notice = document.getElementById("notice");
const columnsEl = document.getElementById("columns");
const lightbox = document.getElementById("lightbox");
const lbImg = lightbox.querySelector("img");
const lbCaption = lightbox.querySelector("figcaption");
let current = { list: [], index: 0 };

function showNotice(text, error) {
  notice.textContent = text;
  notice.classList.toggle("error", Boolean(error));
  notice.classList.remove("hidden");
}

function render(items) {
  columnsEl.innerHTML = "";
  for (const cat of CATEGORIES) {
    const list = items.filter((item) => item.category === cat.key);
    const col = document.createElement("section");
    col.className = "column";
    const h = document.createElement("h2");
    h.textContent = cat.label;
    col.appendChild(h);
    const scroller = document.createElement("div");
    scroller.className = "scroller";
    col.appendChild(scroller);
    scroller.addEventListener("scroll", schedule, { passive: true });
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nothing here yet.";
      scroller.appendChild(empty);
    }
    list.forEach((item, index) => {
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.type = "button";
      tile.setAttribute("aria-label", item.title || cat.label);
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = item.title || "";
      if (item.w && item.h) {
        img.width = item.w;
        img.height = item.h;
      }
      img.addEventListener("load", () => { img.classList.add("loaded"); schedule(); });
      img.src = item.url;
      tile.appendChild(img);
      if (item.title) {
        const cap = document.createElement("span");
        cap.className = "caption";
        cap.textContent = item.title;
        tile.appendChild(cap);
      }
      tile.addEventListener("click", () => openLightbox(list, index));
      scroller.appendChild(tile);
    });
    columnsEl.appendChild(col);
  }
  notice.classList.add("hidden");
  columnsEl.classList.remove("hidden");
  schedule();
}

const mobileQuery = window.matchMedia("(max-width: 800px)");
let frame = 0;

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

function update() {
  frame = 0;
  const mobile = mobileQuery.matches;
  for (const scroller of columnsEl.querySelectorAll(".scroller")) {
    const tiles = scroller.querySelectorAll(".tile");
    if (mobile) {
      tiles.forEach((t) => { t.style.removeProperty("--s"); t.style.removeProperty("--o"); t.classList.remove("focus"); });
      continue;
    }
    const box = scroller.getBoundingClientRect();
    const center = box.top + box.height / 2;
    const half = Math.max(box.height / 2, 1);
    let best = null;
    let bestDist = Infinity;
    tiles.forEach((t) => {
      const r = t.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - center);
      const k = Math.min(d / half, 1);
      t.style.setProperty("--s", (1.04 - 0.12 * k).toFixed(4));
      t.style.setProperty("--o", (1 - 0.4 * k).toFixed(4));
      if (d < bestDist) { bestDist = d; best = t; }
    });
    tiles.forEach((t) => t.classList.toggle("focus", t === best));
    if (best) best.style.setProperty("--s", "1.08");
  }
}

window.addEventListener("resize", schedule);
mobileQuery.addEventListener("change", schedule);

function openLightbox(list, index) {
  current = { list, index };
  showCurrent();
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}

function showCurrent() {
  const item = current.list[current.index];
  lbImg.src = item.url;
  lbImg.alt = item.title || "";
  lbCaption.textContent = item.title || "";
  const multi = current.list.length > 1;
  lightbox.querySelector(".lb-prev").classList.toggle("hidden", !multi);
  lightbox.querySelector(".lb-next").classList.toggle("hidden", !multi);
}

function step(delta) {
  if (!lightbox.classList.contains("open") || current.list.length < 2) return;
  current.index = (current.index + delta + current.list.length) % current.list.length;
  showCurrent();
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lbImg.removeAttribute("src");
}

lightbox.querySelector(".lb-close").addEventListener("click", closeLightbox);
lightbox.querySelector(".lb-prev").addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
lightbox.querySelector(".lb-next").addEventListener("click", (e) => { e.stopPropagation(); step(1); });
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox || e.target.tagName === "FIGURE") closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});

async function load() {
  if (!configured()) {
    showNotice("The gallery isn't connected yet. Check back soon.");
    return;
  }
  try {
    const data = await postToDrive({ action: "list" });
    render(Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    showNotice("The gallery couldn't load right now. Please refresh in a moment.", true);
  }
}

load();
