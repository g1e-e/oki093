const files = ['index.html', 'admin.html', 'style.css', 'config.js', 'src/gallery.js', 'src/admin.js', 'src/api.js', 'src/reload.js'];

async function hardReload(button) {
  button.disabled = true;
  button.classList.add('spinning');
  const base = new URL('./', location.href);
  await Promise.allSettled(files.map(f => fetch(new URL(f, base), { cache: 'reload' })));
  const url = new URL(location.href);
  url.searchParams.set('v', Date.now());
  location.replace(url);
}

const button = document.createElement('button');
button.type = 'button';
button.className = 'reload-btn';
button.title = 'Refresh to latest version';
button.setAttribute('aria-label', 'Refresh to latest version');
button.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
button.addEventListener('click', () => hardReload(button));
document.body.appendChild(button);
