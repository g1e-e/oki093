var FOLDER_NAME = "oki093";
var TMP_FOLDER_NAME = "oki093 uploads tmp";
var FOLDER_ID_KEY = "FOLDER_ID";
var TMP_FOLDER_ID_KEY = "TMP_FOLDER_ID";
var INDEX_FILE_ID_KEY = "INDEX_FILE_ID";
var INDEX_FILE_NAME = "index.json";
var PASSWORD_KEY = "ADMIN_PASSWORD";
var FAIL_KEY = "ADMIN_FAILS";
var LOCK_KEY = "ADMIN_LOCK_UNTIL";
var MAX_FAILS = 5;
var WINDOW_MS = 15 * 60 * 1000;
var ADMIN_TOKEN_TTL = 7200;
var LIST_CACHE_KEY = "list:v1";
var CACHE_TTL = 21600;
var CACHE_VALUE_LIMIT = 90000;
var CATEGORIES = ["chibi", "art", "sheets"];
var MAX_IMAGE_BYTES = 45 * 1024 * 1024;
var MAX_CHUNKS = 15;
var ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "list") return jsonResponse(handleList());
  return jsonResponse({ ok: true });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Empty request." });
    }
    var body = JSON.parse(e.postData.contents);
    if (body.action === "list") return jsonResponse(handleList());
    if (body.action === "unlock") return jsonResponse(handleUnlock(body));
    if (body.action === "lock") return jsonResponse(handleLock(body));
    var auth = requireToken(body.token);
    if (!auth.ok) return jsonResponse(auth);
    if (body.action === "adminList") return jsonResponse({ ok: true, items: publicItems(readIndex().items) });
    if (body.action === "uploadChunk") return jsonResponse(handleUploadChunk(body));
    if (body.action === "upload") return jsonResponse(handleUpload(body));
    if (body.action === "delete") return jsonResponse(handleDelete(body));
    if (body.action === "move") return jsonResponse(handleMove(body));
    if (body.action === "reorder") return jsonResponse(handleReorder(body));
    if (body.action === "rename") return jsonResponse(handleRename(body));
    return jsonResponse({ ok: false, error: "Unknown action." });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Something went wrong: " + (err && err.message ? err.message : err) });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleList() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(LIST_CACHE_KEY);
  if (cached) {
    try {
      return { ok: true, items: JSON.parse(cached) };
    } catch (err) {
    }
  }
  var items = publicItems(readIndex().items);
  var text = JSON.stringify(items);
  if (text.length < CACHE_VALUE_LIMIT) cache.put(LIST_CACHE_KEY, text, CACHE_TTL);
  return { ok: true, items: items };
}

function publicItems(items) {
  return items.map(function (item) {
    return {
      id: item.id,
      category: item.category,
      title: item.title || "",
      url: "https://lh3.googleusercontent.com/d/" + item.fileId,
      w: item.w || 0,
      h: item.h || 0
    };
  });
}

function invalidateList() {
  CacheService.getScriptCache().remove(LIST_CACHE_KEY);
}

function handleUploadChunk(body) {
  var uploadId = String(body.uploadId || "");
  var index = Number(body.index);
  if (!/^[A-Za-z0-9]{16,64}$/.test(uploadId)) return { ok: false, error: "Bad upload id." };
  if (!(index >= 0 && index < MAX_CHUNKS && Math.floor(index) === index)) return { ok: false, error: "Bad chunk index." };
  var data = String(body.data || "");
  if (!data) return { ok: false, error: "Empty chunk." };
  var tmp = getTmpFolder();
  var name = uploadId + "." + index;
  var existing = tmp.getFilesByName(name);
  while (existing.hasNext()) existing.next().setTrashed(true);
  tmp.createFile(name, data, MimeType.PLAIN_TEXT);
  return { ok: true };
}

function handleUpload(body) {
  var category = String(body.category || "");
  if (CATEGORIES.indexOf(category) < 0) return { ok: false, error: "Pick a category." };
  var mime = String(body.mime || "");
  if (ALLOWED_MIME.indexOf(mime) < 0) return { ok: false, error: "Unsupported image type." };
  var bytes;
  if (body.uploadId) {
    bytes = assembleChunks(String(body.uploadId), Number(body.chunkCount));
    if (!bytes) return { ok: false, error: "Upload pieces are missing. Please try again." };
  } else {
    bytes = Utilities.base64Decode(String(body.data || ""));
  }
  if (!bytes.length) return { ok: false, error: "Empty image." };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "Image is too large." };
  var ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mime];
  var id = Utilities.getUuid().replace(/-/g, "");
  var blob = Utilities.newBlob(bytes, mime, id + "." + ext);
  var file = getFolder().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var item = {
    id: id,
    fileId: file.getId(),
    category: category,
    title: cleanTitle(body.title),
    w: Math.max(0, Math.round(Number(body.w) || 0)),
    h: Math.max(0, Math.round(Number(body.h) || 0)),
    created: Date.now()
  };
  return withIndex(function (index) {
    index.items.unshift(item);
    return true;
  });
}

function assembleChunks(uploadId, count) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(uploadId)) return null;
  if (!(count >= 1 && count <= MAX_CHUNKS)) return null;
  var tmp = getTmpFolder();
  var parts = [];
  var files = [];
  for (var i = 0; i < count; i++) {
    var it = tmp.getFilesByName(uploadId + "." + i);
    if (!it.hasNext()) return null;
    var f = it.next();
    files.push(f);
    parts.push(f.getBlob().getDataAsString());
  }
  var bytes = Utilities.base64Decode(parts.join(""));
  files.forEach(function (f) {
    try {
      f.setTrashed(true);
    } catch (err) {
    }
  });
  return bytes;
}

function handleDelete(body) {
  var removed = null;
  var result = withIndex(function (index) {
    var i = findIndex(index.items, body.id);
    if (i < 0) return false;
    removed = index.items.splice(i, 1)[0];
    return true;
  });
  if (result.ok && removed) {
    try {
      DriveApp.getFileById(removed.fileId).setTrashed(true);
    } catch (err) {
    }
  }
  return result;
}

function handleMove(body) {
  var category = String(body.category || "");
  if (CATEGORIES.indexOf(category) < 0) return { ok: false, error: "Unknown category." };
  return withIndex(function (index) {
    var i = findIndex(index.items, body.id);
    if (i < 0) return false;
    var item = index.items.splice(i, 1)[0];
    item.category = category;
    index.items.unshift(item);
    return true;
  });
}

function handleReorder(body) {
  var direction = Number(body.direction) < 0 ? -1 : 1;
  return withIndex(function (index) {
    var i = findIndex(index.items, body.id);
    if (i < 0) return false;
    var category = index.items[i].category;
    var j = i + direction;
    while (j >= 0 && j < index.items.length && index.items[j].category !== category) j += direction;
    if (j < 0 || j >= index.items.length) return true;
    var tmp = index.items[i];
    index.items[i] = index.items[j];
    index.items[j] = tmp;
    return true;
  });
}

function handleRename(body) {
  return withIndex(function (index) {
    var i = findIndex(index.items, body.id);
    if (i < 0) return false;
    index.items[i].title = cleanTitle(body.title);
    return true;
  });
}

function cleanTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function findIndex(items, id) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === id) return i;
  }
  return -1;
}

function withIndex(mutator) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return { ok: false, error: "The gallery is busy. Try again in a moment." };
  }
  try {
    var index = readIndex();
    var found = mutator(index);
    if (!found) return { ok: false, error: "That image no longer exists. Refresh the list." };
    writeIndex(index);
    invalidateList();
    return { ok: true, items: publicItems(index.items) };
  } finally {
    lock.releaseLock();
  }
}

function getIndexFile() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(INDEX_FILE_ID_KEY);
  if (id) {
    try {
      var existing = DriveApp.getFileById(id);
      if (!existing.isTrashed()) return existing;
    } catch (err) {
    }
  }
  var folder = getFolder();
  var files = folder.getFilesByName(INDEX_FILE_NAME);
  var file = files.hasNext() ? files.next() : folder.createFile(INDEX_FILE_NAME, JSON.stringify({ items: [] }), MimeType.PLAIN_TEXT);
  props.setProperty(INDEX_FILE_ID_KEY, file.getId());
  return file;
}

function readIndex() {
  try {
    var parsed = JSON.parse(getIndexFile().getBlob().getDataAsString());
    if (parsed && Array.isArray(parsed.items)) return parsed;
  } catch (err) {
  }
  return { items: [] };
}

function writeIndex(index) {
  getIndexFile().setContent(JSON.stringify(index));
}

function getFolder() {
  return getNamedFolder(FOLDER_NAME, FOLDER_ID_KEY);
}

function getTmpFolder() {
  return getNamedFolder(TMP_FOLDER_NAME, TMP_FOLDER_ID_KEY);
}

function getNamedFolder(name, propKey) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(propKey);
  if (id) {
    try {
      var existing = DriveApp.getFolderById(id);
      if (!existing.isTrashed()) return existing;
    } catch (err) {
    }
  }
  var folders = DriveApp.getRootFolder().getFoldersByName(name);
  var folder = folders.hasNext() ? folders.next() : DriveApp.getRootFolder().createFolder(name);
  props.setProperty(propKey, folder.getId());
  return folder;
}

function authorize(password) {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var lockUntil = Number(props.getProperty(LOCK_KEY) || "0");
  if (lockUntil > now) return { ok: false, error: "Too many attempts, try again later" };
  var expected = props.getProperty(PASSWORD_KEY);
  if (!expected) return { ok: false, error: "Admin password is not set" };
  if (constantTimeEquals(String(password || ""), String(expected))) {
    props.deleteProperty(FAIL_KEY);
    return { ok: true };
  }
  return recordFailedPassword(now);
}

function recordFailedPassword(now) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: "Try again in a moment." };
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var lockUntil = Number(props.getProperty(LOCK_KEY) || "0");
    if (lockUntil > Date.now()) return { ok: false, error: "Too many attempts, try again later" };
    var fails = [];
    try {
      fails = JSON.parse(props.getProperty(FAIL_KEY) || "[]");
    } catch (err) {
      fails = [];
    }
    if (!Array.isArray(fails)) fails = [];
    fails = fails.filter(function (time) {
      return now - Number(time) < WINDOW_MS;
    });
    fails.push(now);
    if (fails.length >= MAX_FAILS) {
      props.setProperty(LOCK_KEY, String(now + WINDOW_MS));
      props.deleteProperty(FAIL_KEY);
      return { ok: false, error: "Too many attempts, try again later" };
    }
    props.setProperty(FAIL_KEY, JSON.stringify(fails));
    return { ok: false, error: "Wrong password" };
  } finally {
    lock.releaseLock();
  }
}

function handleUnlock(body) {
  var auth = authorize(body.password);
  if (!auth.ok) return auth;
  var token = randomToken(48);
  CacheService.getScriptCache().put(tokenKey(token), "1", ADMIN_TOKEN_TTL);
  return { ok: true, token: token };
}

function handleLock(body) {
  if (body.token) CacheService.getScriptCache().remove(tokenKey(body.token));
  return { ok: true };
}

function requireToken(token) {
  var value = String(token || "");
  if (value.length < 32) return { ok: false, error: "Admin session expired. Unlock again." };
  var cache = CacheService.getScriptCache();
  var key = tokenKey(value);
  if (!cache.get(key)) return { ok: false, error: "Admin session expired. Unlock again." };
  cache.put(key, "1", ADMIN_TOKEN_TTL);
  return { ok: true };
}

function tokenKey(token) {
  return "admintok:" + String(token || "");
}

function constantTimeEquals(left, right) {
  var a = String(left);
  var b = String(right);
  var length = Math.max(a.length, b.length);
  var diff = a.length === b.length ? 0 : 1;
  for (var i = 0; i < length; i++) {
    var ca = i < a.length ? a.charCodeAt(i) : 0;
    var cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function randomToken(length) {
  var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  var span = alphabet.length * Math.floor(256 / alphabet.length);
  var out = "";
  var guard = 0;
  while (out.length < length && guard < 24) {
    guard++;
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + ":" + out + ":" + guard,
      Utilities.Charset.UTF_8
    );
    for (var i = 0; i < digest.length && out.length < length; i++) {
      var b = digest[i] < 0 ? digest[i] + 256 : digest[i];
      if (b >= span) continue;
      out += alphabet.charAt(b % alphabet.length);
    }
  }
  return out;
}
