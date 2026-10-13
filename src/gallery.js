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
  loop.scroller.querySelectorAll(".tile").forEach((t) => { if (t._a) setAmount(t, t._a); });
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
  let delta = 0;
  if (top < h * 0.5) delta = h;
  else if (top > h * 1.5 && top + h <= max + 1) delta = -h;
  else if (top > max - 2) delta = -h;
  if (!delta) return;
  const tiles = Array.from(s.querySelectorAll(".tile"));
  const per = loop.list.length;
  const shift = delta > 0 ? per : -per;
  const active = tiles.filter((t) => t._a > 0 || t === loop.hoverTile);
  if (!active.length || active.some((t) => !tiles[tiles.indexOf(t) + shift])) {
    loop.pos += delta;
    s.scrollTop = top + delta;
    return;
  }
  const anchor = popAnchor(loop, tiles);
  const rel = anchor.offsetTop - top;
  const amounts = active.map((t) => [tiles.indexOf(t) + shift, t._a || 0]);
  active.forEach((t) => setAmount(t, 0));
  amounts.forEach(([i, a]) => setAmount(tiles[i], a));
  if (loop.hoverTile) loop.hoverTile = tiles[tiles.indexOf(loop.hoverTile) + shift];
  const newAnchor = tiles[tiles.indexOf(anchor) + shift];
  const newTop = newAnchor.offsetTop - rel;
  loop.pos += newTop - top;
  s.scrollTop = newTop;
}

const POP_EXTRA = 0.65;
const POP_TIME = 0.25;
let mouseX = null;
let mouseY = null;

function setAmount(tile, a) {
  tile._a = a;
  if (a <= 0.0005) {
    tile._a = 0;
    tile.style.transform = "";
    tile.style.marginTop = "";
    tile.style.marginBottom = "";
    tile.classList.remove("popped");
    return;
  }
  const m = POP_EXTRA * tile.offsetHeight / 2 * a;
  tile.style.transform = `scale(${1 + POP_EXTRA * a})`;
  tile.style.marginTop = `${m}px`;
  tile.style.marginBottom = `${m}px`;
  tile.classList.toggle("popped", a > 0.5);
}

function popAnchor(loop, tiles) {
  if (loop.hoverTile) return loop.hoverTile;
  let best = null;
  for (const t of tiles) if (t._a > 0 && (!best || t._a > best._a)) best = t;
  return best;
}

function updateHover() {
  let tile = null;
  if (mouseX !== null && loopActive()) {
    const el = document.elementFromPoint(mouseX, mouseY);
    tile = el && el.closest ? el.closest(".scroller .tile") : null;
  }
  for (const loop of loops) loop.hoverTile = tile && loop.scroller.contains(tile) ? tile : null;
}

function popStep(loop, dt) {
  const s = loop.scroller;
  const tiles = Array.from(s.querySelectorAll(".tile"));
  const active = tiles.filter((t) => t._a > 0 || t === loop.hoverTile);
  if (!active.length) return;
  const anchor = popAnchor(loop, tiles);
  const before = anchor.offsetTop;
  const top = s.scrollTop;
  const k = Math.min(1, dt / POP_TIME * 1.6);
  for (const t of active) {
    const goal = t === loop.hoverTile ? 1 : 0;
    let a = (t._a || 0) + (goal - (t._a || 0)) * (1 - Math.pow(1 - k, 2));
    if (Math.abs(goal - a) < 0.002) a = goal;
    if (dt === 0 && reducedQuery.matches) a = goal;
    setAmount(t, a);
  }
  const diff = anchor.offsetTop - before;
  if (diff) {
    loop.pos += diff;
    s.scrollTop = top + diff;
  }
}

function interact(loop) {
  loop.lastInteract = performance.now();
  loop.pos = loop.scroller.scrollTop;
}

function setupLoop(scroller, list, label, speed) {
  const loop = { scroller, base: Math.abs(speed), hoverTile: null, list, label, speed, copies: 1, copyHeight: 0, pos: 0, hover: false, vel: 0, lastInteract: -Infinity, current: 0 };
  scroller.addEventListener("scroll", () => {
    if (!loop.copyHeight) return;
    if (Math.abs(scroller.scrollTop - loop.pos) > 1.5) loop.lastInteract = performance.now();
    loop.pos = scroller.scrollTop;
    wrap(loop);
  }, { passive: true });
  scroller.addEventListener("wheel", (e) => { if (!loopActive() || !loop.copyHeight) { interact(loop); return; } e.preventDefault(); const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1; if (e.deltaY) loop.speed = Math.sign(e.deltaY) * loop.base; loop.vel += e.deltaY * unit * 9; loop.vel = Math.max(-6000, Math.min(6000, loop.vel)); loop.pos = scroller.scrollTop; loop.lastInteract = performance.now(); }, { passive: false });
  scroller.addEventListener("touchstart", (e) => { loop.touchY = e.touches[0].clientY; interact(loop); }, { passive: true });
  scroller.addEventListener("touchmove", (e) => { const y = e.touches[0].clientY; if (loop.touchY != null && y !== loop.touchY) loop.speed = Math.sign(loop.touchY - y) * loop.base; loop.touchY = y; interact(loop); }, { passive: true });
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
  updateHover();
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
      updateHover();
      popStep(loop, dt);
      continue;
    }
    loop.vel = 0;
    if (loop.scroller.querySelector(".tile.popped")) loop.lastInteract = Math.max(loop.lastInteract, now - RESUME_DELAY);
    const idle = now - loop.lastInteract;
    let target = 0;
    if (allowed && idle > RESUME_DELAY) {
      target = loop.speed * Math.min(1, (idle - RESUME_DELAY) / EASE_TIME);
    }
    loop.current = target;
    if (!target) { popStep(loop, dt); continue; }
    loop.pos += target * dt;
    const s = loop.scroller;
    const whole = Math.round(loop.pos);
    if (whole !== s.scrollTop) s.scrollTop = whole;
    wrap(loop);
    updateHover();
    popStep(loop, dt);
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

document.addEventListener("pointermove", (e) => {
  if (e.pointerType && e.pointerType !== "mouse") { mouseX = null; mouseY = null; return; }
  mouseX = e.clientX;
  mouseY = e.clientY;
});
document.addEventListener("pointerover", (e) => {
  if (e.pointerType && e.pointerType !== "mouse") return;
  mouseX = e.clientX;
  mouseY = e.clientY;
});
document.documentElement.addEventListener("pointerleave", () => { mouseX = null; mouseY = null; });
window.addEventListener("blur", () => { mouseX = null; mouseY = null; });
