const READ_ACTIONS = new Set(["list", "unlock", "lock", "adminList"]);
const RETRY_DELAYS_MS = [500, 1000, 2000];
const ATTEMPT_TIMEOUT_MS = 60000;

export const CATEGORIES = [
  { key: "chibi", label: "Chibi Art" },
  { key: "art", label: "Art" },
  { key: "sheets", label: "Character Sheets" },
];

export function scriptUrl() {
  const url = typeof window.APPS_SCRIPT_URL === "string" ? window.APPS_SCRIPT_URL.trim() : "";
  if (!url || url === "PASTE_EXEC_URL_HERE") return "";
  return url;
}

export function configured() {
  return scriptUrl() !== "";
}

export async function postToDrive(payload) {
  const read = READ_ACTIONS.has(payload && payload.action);
  const attempts = read ? 4 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);
    try {
      return await requestOnce(payload);
    } catch (err) {
      if (err && err.scriptResponse) throw err;
    }
  }
  throw new Error(read
    ? "Google's servers didn't respond. Please try again in a moment."
    : "Google didn't respond properly. The change may or may not have gone through, so refresh the list before trying again.");
}

async function requestOnce(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(scriptUrl(), {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = JSON.parse(await response.text());
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") throw new Error("unreadable");
    if (data.ok === false || !response.ok) {
      const error = new Error(data.error || "The request was rejected.");
      error.scriptResponse = true;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
