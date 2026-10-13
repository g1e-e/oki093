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

const loops = [];
const mobileQuery = window.matchMedia("(max-width: 800px)");
const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const SPEEDS = [22 * 0.9, -22, 22 * 1.1];
const RESUME_DELAY = 250;
const EASE_TIME = 500;

function makeTile(item, index, list, label) {
  const tile = document.createElement("button");
  tile.className = "tile";
  tile.type = "button";
  tile.setAttribute("aria-label", item.title || label);
  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = item.title || "";
  if (item.w && item.h) {
    img.width = item.w;
    img.height = item.h;
  }
  img.addEventListener("load", () => {
    img.classList.add("loaded");
    scheduleMeasure();
  });
  img.src = item.url;
  tile.appendChild(img);
  if (item.title) {
    const cap = document.createElement("span");
    cap.className = "caption";
    cap.textContent = item.title;
    tile.appendChild(cap);
  }
  tile.addEventListener("click", () => openLightbox(list, index));
  return tile;
}

function makeCopy(loop, clone) {
  const copy = document.createElement("div");
  copy.className = "loop-copy";
  if (clone) copy.setAttribute("aria-hidden", "true");
  loop.list.forEach((item, index) => {
    const tile = makeTile(item, index, loop.list, loop.label);
    if (clone) tile.tabIndex = -1;
    copy.appendChild(tile);
  });
  return copy;
}

function loopActive() {
  return !mobileQuery.matches;
}

function buildCopies(loop) {
  const s = loop.scroller;
  s.innerHTML = "";
  s.appendChild(makeCopy(loop, false));
  loop.copies = 1;
  loop.copyHeight = 0;
  if (!loopActive()) return;
  for (let i = 0; i < 2; i++) {
    s.appendChild(makeCopy(loop, true));
    loop.copies++;
  }
  measure(loop);
}

function measure(loop) {
  const s = loop.scroller;
  if (!loopActive() || loop.copies < 2) { loop.copyHeight = 0; return; }
  const first = s.children[0];
  const second = s.children[1];
  const h = second.offsetTop - first.offsetTop;
  if (h <= 0) return;
  while (loop.copies < 40 && h * loop.copies < Math.max(s.clientHeight * 3, h * 3)) {
    s.appendChild(makeCopy(loop, true));
    loop.copies++;
  }
  const old = loop.copyHeight;
  loop.copyHeight = h;
  if (!old) {
    s.scrollTop = h;
    loop.pos = h;
  }
  wrap(loop);
}

let measurePending = false;
function scheduleMeasure() {
  if (measurePending) return;
  measurePending = true;
  requestAnimationFrame(() => {
    measurePending = false;
    loops.forEach(measure);
  });
}

function wrap(loop) {
  const h = loop.copyHeight;
  if (!h) return;
  const s = loop.scroller;
  const max = s.scrollHeight - s.clientHeight;
  let top = s.scrollTop;
  if (top < h * 0.5) top += h;
  else if (top > h * 1.5 && top + h <= max + 1) top -= h;
  else if (top > max - 2) top -= h;
  if (top !== s.scrollTop) {
    loop.pos += top - s.scrollTop;
    s.scrollTop = top;
  }
}

function interact(loop) {
  loop.lastInteract = performance.now();
  loop.pos = loop.scroller.scrollTop;
}

function setupLoop(scroller, list, label, speed) {
  const loop = { scroller, list, label, speed, copies: 1, copyHeight: 0, pos: 0, hover: false, vel: 0, lastInteract: -Infinity, current: 0 };
  scroller.addEventListener("scroll", () => {
    if (!loop.copyHeight) return;
    if (Math.abs(scroller.scrollTop - loop.pos) > 1.5) loop.lastInteract = performance.now();
    loop.pos = scroller.scrollTop;
    wrap(loop);
  }, { passive: true });
  scroller.addEventListener("wheel", (e) => { if (!loopActive() || !loop.copyHeight) { interact(loop); return; } e.preventDefault(); const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1; loop.vel += e.deltaY * unit * 9; loop.vel = Math.max(-6000, Math.min(6000, loop.vel)); loop.pos = scroller.scrollTop; loop.lastInteract = performance.now(); }, { passive: false });
  scroller.addEventListener("touchstart", () => interact(loop), { passive: true });
  scroller.addEventListener("touchmove", () => interact(loop), { passive: true });
  scroller.addEventListener("pointerdown", () => interact(loop));
  scroller.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") loop.hover = true; });
  scroller.addEventListener("pointerleave", () => { loop.hover = false; });
  loops.push(loop);
  buildCopies(loop);
}

let lastFrame = 0;
function tick(now) {
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
  lastFrame = now;
  const allowed = loopActive() && !reducedQuery.matches && !lightbox.classList.contains("open") && !document.hidden;
  for (const loop of loops) {
    if (!loop.copyHeight) continue;
    if (Math.abs(loop.vel) > 4) {
      loop.pos += loop.vel * dt;
      loop.vel *= Math.exp(-dt * 3.2);
      loop.lastInteract = now;
      const ws = loop.scroller;
      const w = Math.round(loop.pos);
      if (w !== ws.scrollTop) ws.scrollTop = w;
      wrap(loop);
      continue;
    }
    loop.vel = 0;
    const idle = now - loop.lastInteract;
    let target = 0;
    if (allowed && idle > RESUME_DELAY) {
      target = loop.speed * Math.min(1, (idle - RESUME_DELAY) / EASE_TIME);
    }
    loop.current = target;
    if (!target) continue;
    loop.pos += target * dt;
    const s = loop.scroller;
    const whole = Math.round(loop.pos);
    if (whole !== s.scrollTop) s.scrollTop = whole;
    wrap(loop);
  }
  requestAnimationFrame(tick);
}

function rebuildAll() {
  loops.forEach(buildCopies);
}

mobileQuery.addEventListener("change", rebuildAll);
window.addEventListener("resize", scheduleMeasure);

function render(items) {
  columnsEl.innerHTML = "";
  loops.length = 0;
  columnsEl.classList.remove("hidden");
  CATEGORIES.forEach((cat, ci) => {
    const list = items.filter((item) => item.category === cat.key);
    const col = document.createElement("section");
    col.className = "column";
    const h = document.createElement("h2");
    h.textContent = cat.label;
    col.appendChild(h);
    const scroller = document.createElement("div");
    scroller.className = "scroller";
    col.appendChild(scroller);
    columnsEl.appendChild(col);
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nothing here yet.";
      scroller.appendChild(empty);
      return;
    }
    setupLoop(scroller, list, cat.label, SPEEDS[ci % SPEEDS.length]);
  });
  notice.classList.add("hidden");
  requestAnimationFrame(tick);
}

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
