import { CATEGORIES, configured, postToDrive } from "./api.js";

const MAX_EDGE = 2560;
const CHUNK_CHARS = 4 * 1024 * 1024;
const TOKEN_KEY = "oki093-token";
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem(TOKEN_KEY) || "";
let items = [];
let pending = [];
let busy = false;

const categorySelect = $("category");
for (const cat of CATEGORIES) categorySelect.add(new Option(cat.label, cat.key));

function setStatus(el, text, error) {
  el.textContent = text || "";
  el.classList.toggle("error", Boolean(error));
}

function show(view) {
  $("login").classList.toggle("hidden", view !== "login");
  $("dash").classList.toggle("hidden", view !== "dash");
}

async function call(payload) {
  try {
    return await postToDrive({ ...payload, token });
  } catch (err) {
    if (/session expired/i.test(err.message)) {
      token = "";
      sessionStorage.removeItem(TOKEN_KEY);
      show("login");
      setStatus($("loginStatus"), "Your session expired. Please unlock again.");
    }
    throw err;
  }
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("button");
  button.disabled = true;
  setStatus($("loginStatus"), "Checking…");
  try {
    const data = await postToDrive({ action: "unlock", password: $("password").value });
    token = data.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    $("password").value = "";
    setStatus($("loginStatus"), "");
    show("dash");
    refresh();
  } catch (err) {
    setStatus($("loginStatus"), err.message, true);
  } finally {
    button.disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  const old = token;
  token = "";
  sessionStorage.removeItem(TOKEN_KEY);
  show("login");
  try {
    await postToDrive({ action: "lock", token: old });
  } catch {
  }
});

const drop = $("drop");
drop.addEventListener("click", () => $("picker").click());
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  addFiles(e.dataTransfer.files);
});
$("picker").addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});

function addFiles(fileList) {
  for (const file of Array.from(fileList || [])) {
    if (!file.type.startsWith("image/")) continue;
    pending.push({ file, title: "", preview: URL.createObjectURL(file) });
  }
  renderPending();
}

function renderPending() {
  const box = $("pending");
  box.innerHTML = "";
  pending.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "pending-item";
    const img = document.createElement("img");
    img.src = entry.preview;
    const input = document.createElement("input");
    input.placeholder = "Title (optional)";
    input.value = entry.title;
    input.addEventListener("input", () => { entry.title = input.value; });
    const name = document.createElement("span");
    name.className = "status";
    name.textContent = entry.file.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.disabled = busy;
    remove.addEventListener("click", () => {
      URL.revokeObjectURL(entry.preview);
      pending.splice(i, 1);
      renderPending();
    });
    row.append(img, input, name, remove);
    box.appendChild(row);
  });
  $("uploadBtn").disabled = busy || !pending.length;
  $("clearBtn").disabled = busy || !pending.length;
}

$("clearBtn").addEventListener("click", () => {
  pending.forEach((entry) => URL.revokeObjectURL(entry.preview));
  pending = [];
  renderPending();
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read " + file.name)); };
    img.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function prepare(file) {
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const long = Math.max(w, h);
  if (long <= MAX_EDGE || file.type === "image/gif" || file.type === "image/svg+xml") {
    return { blob: file, mime: file.type, w, h };
  }
  const scale = MAX_EDGE / long;
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, nw, nh);
  let mime = file.type === "image/png" ? "image/png" : "image/webp";
  let blob = await canvasBlob(canvas, mime, 0.92);
  if (!blob || blob.type !== mime) {
    mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    blob = await canvasBlob(canvas, mime, 0.92);
  }
  if (!blob) return { blob: file, mime: file.type, w, h };
  return { blob, mime, w: nw, h: nh };
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsDataURL(blob);
  });
}

function setBar(fraction) {
  $("bar").style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + "%";
}

$("uploadBtn").addEventListener("click", async () => {
  if (busy || !pending.length) return;
  busy = true;
  renderPending();
  const category = categorySelect.value;
  const queue = pending.slice().reverse();
  const total = queue.length;
  let done = 0;
  const failed = [];
  for (const entry of queue) {
    setStatus($("uploadStatus"), `Uploading ${done + 1} of ${total}: ${entry.file.name}`);
    try {
      const prepared = await prepare(entry.file);
      const data = await toBase64(prepared.blob);
      const chunks = [];
      for (let i = 0; i < data.length; i += CHUNK_CHARS) chunks.push(data.slice(i, i + CHUNK_CHARS));
      const meta = {
        category,
        title: entry.title.trim(),
        name: entry.file.name,
        mime: prepared.mime,
        w: prepared.w,
        h: prepared.h,
      };
      if (chunks.length <= 1) {
        await call({ action: "upload", ...meta, data });
      } else {
        const uploadId = crypto.randomUUID().replace(/-/g, "");
        for (let i = 0; i < chunks.length; i += 1) {
          await call({ action: "uploadChunk", uploadId, index: i, data: chunks[i] });
          setBar((done + (i + 1) / (chunks.length + 1)) / total);
        }
        await call({ action: "upload", ...meta, uploadId, chunkCount: chunks.length });
      }
      URL.revokeObjectURL(entry.preview);
      pending.splice(pending.indexOf(entry), 1);
    } catch (err) {
      failed.push(`${entry.file.name}: ${err.message}`);
      if (!token) break;
    }
    done += 1;
    setBar(done / total);
  }
  busy = false;
  renderPending();
  setStatus($("uploadStatus"), failed.length ? "Some uploads failed. " + failed.join(" · ") : `Uploaded ${total} image${total === 1 ? "" : "s"}.`, failed.length > 0);
  setTimeout(() => setBar(0), 1500);
  refresh();
});

$("refresh").addEventListener("click", () => refresh());

async function refresh() {
  setStatus($("listStatus"), "Loading…");
  try {
    const data = await call({ action: "adminList" });
    items = Array.isArray(data.items) ? data.items : [];
    setStatus($("listStatus"), "");
    renderItems();
  } catch (err) {
    setStatus($("listStatus"), err.message, true);
  }
}

async function mutate(payload, label) {
  setStatus($("listStatus"), label);
  document.querySelectorAll("#items button, #items select").forEach((el) => { el.disabled = true; });
  try {
    const data = await call(payload);
    items = Array.isArray(data.items) ? data.items : items;
    setStatus($("listStatus"), "Saved.");
  } catch (err) {
    setStatus($("listStatus"), err.message, true);
  }
  renderItems();
}

function renderItems() {
  const box = $("items");
  box.innerHTML = "";
  for (const cat of CATEGORIES) {
    const list = items.filter((item) => item.category === cat.key);
    const head = document.createElement("div");
    head.className = "cat-head";
    head.textContent = `${cat.label} (${list.length})`;
    box.appendChild(head);
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "status";
      empty.textContent = "No images yet.";
      box.appendChild(empty);
    }
    list.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "item";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = item.url;
      img.alt = "";
      const title = document.createElement("input");
      title.className = "title";
      title.placeholder = "Title (optional)";
      title.value = item.title || "";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save title";
      save.addEventListener("click", () => mutate({ action: "rename", id: item.id, title: title.value.trim() }, "Saving title…"));
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "↑";
      up.disabled = i === 0;
      up.addEventListener("click", () => mutate({ action: "reorder", id: item.id, direction: -1 }, "Moving…"));
      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "↓";
      down.disabled = i === list.length - 1;
      down.addEventListener("click", () => mutate({ action: "reorder", id: item.id, direction: 1 }, "Moving…"));
      const move = document.createElement("select");
      for (const c of CATEGORIES) move.add(new Option(c.label, c.key, false, c.key === item.category));
      move.addEventListener("change", () => mutate({ action: "move", id: item.id, category: move.value }, "Moving…"));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        if (confirm("Delete this image? This can't be undone from the site.")) {
          mutate({ action: "delete", id: item.id }, "Deleting…");
        }
      });
      row.append(img, title, save, up, down, move, del);
      box.appendChild(row);
    });
  }
}

if (!configured()) {
  $("notConnected").classList.remove("hidden");
} else if (token) {
  show("dash");
  refresh();
} else {
  show("login");
}
