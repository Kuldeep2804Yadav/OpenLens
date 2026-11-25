'use strict';

const endpoint = 'https://commons.wikimedia.org/w/api.php';
const defaultQuery = 'Alpine lake';
const storageKey = 'openlens-saved-v1';
const pageSize = 16;
const supportedMime = new Set(['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']);
const licenseHosts = new Set(['creativecommons.org','www.creativecommons.org','www.gnu.org','gnu.org','commons.wikimedia.org']);
const mediaHosts = new Set(['upload.wikimedia.org','thumb.wikimedia.org']);
const filePageHosts = new Set(['commons.wikimedia.org']);
const icons = {
  lens:'<circle cx="12" cy="12" r="7.8"/><circle cx="12" cy="12" r="3.1"/><path d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  bookmark:'<path d="M6 4h12v16l-6-4-6 4z"/>',
  search:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const find = selector => document.querySelector(selector);
const queryInput = find('#query');
const resultGrid = find('#results');
const loadButton = find('#more');
const preview = find('#preview');
const previewContent = find('#preview-content');
const notice = find('#notice');
const esc = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

let query = '';
let orientation = 'all';
let mode = 'explore';
let results = new Map();
let cursor = null;
let request = null;
let pending = false;
let failure = '';
let hasFailedPage = false;
let noticeTimer;
let activeItem = null;

function safeUrl(raw,hosts) {
  try {
    if (typeof raw !== 'string') return '';
    const link = new URL(raw.startsWith('//') ? 'https:'+raw : raw);
    return link.protocol === 'https:' && hosts.has(link.hostname) && !link.username && !link.password && !link.port ? link.href : '';
  } catch {
    return '';
  }
}

function plainText(raw,limit) {
  const template = document.createElement('template');
  template.innerHTML = String(raw ?? '');
  return template.content.textContent.replace(/\s+/g,' ').trim().slice(0,limit);
}

function validateItem(data) {
  if (!data || !Number.isSafeInteger(data.id) || data.id < 1 ||
    typeof data.title !== 'string' || !Number.isFinite(data.width) || !Number.isFinite(data.height) ||
    data.width < 1 || data.height < 1) return null;
  const thumbnail = safeUrl(data.thumbnail,mediaHosts);
  const original = safeUrl(data.original,mediaHosts);
  const source = safeUrl(data.source,filePageHosts);
  if (!thumbnail || !original || !source) return null;
  return {
    id:data.id,title:data.title.slice(0,240),width:data.width,height:data.height,thumbnail,original,source,
    author:String(data.author ?? '').slice(0,260),license:String(data.license ?? '').slice(0,90),
    licenseUrl:safeUrl(data.licenseUrl,licenseHosts)
  };
}

function parseResult(page) {
  const image = page?.imageinfo?.[0];
  if (!image || page.ns !== 6 || !supportedMime.has(image.mime)) return null;
  const meta = image.extmetadata ?? {};
  return validateItem({
    id:page.pageid,title:page.title.replace(/^File:/i,'').replace(/\.(jpe?g|png|webp|gif|svg)$/i,'').replaceAll('_',' '),
    width:image.width,height:image.height,thumbnail:image.thumburl,original:image.url,source:image.descriptionurl,
    author:plainText(meta.Artist?.value,260),license:plainText(meta.LicenseShortName?.value,90),licenseUrl:meta.LicenseUrl?.value
  });
}

function loadSaved() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    return new Map((Array.isArray(data) ? data : []).map(validateItem).filter(Boolean).map(item => [item.id,item]));
  } catch {
    return new Map();
  }
}
const saved = loadSaved();

function showNotice(message) {
  clearTimeout(noticeTimer);
  (preview.open ? preview : document.body).append(notice);
  notice.textContent = message;
  noticeTimer = setTimeout(() => { notice.textContent = ''; },3200);
}

function toggleSaved(item) {
  const removed = saved.delete(item.id);
  if (!removed) saved.set(item.id,item);
  try {
    localStorage.setItem(storageKey,JSON.stringify([...saved.values()]));
    showNotice(removed ? 'Image removed from saved collection.' : 'Image saved to your collection.');
  } catch {
    showNotice('Updated for this session. Browser storage is unavailable.');
  }
  render();
  if (preview.open) updatePreviewButton();
}

function orientationOf(item) {
  if (item.width === item.height) return 'square';
  return item.width > item.height ? 'landscape' : 'portrait';
}

function card(item,index) {
  const active = saved.has(item.id);
  const title = esc(item.title);
  return `<article class="result">
    <button class="image-button" data-open="${item.id}" aria-label="Preview ${title}"><img src="${esc(item.thumbnail)}" alt="" ${index < 4 ? 'loading="eager"' : 'loading="lazy"'} decoding="async"></button>
    <button class="icon-button bookmark" data-save="${item.id}" aria-label="Save ${title}" aria-pressed="${active}">${icon('bookmark')}</button>
    <div class="result-meta"><button class="result-title" data-open="${item.id}" title="${title}">${title}</button>
    <p class="result-license">${esc(item.license || 'See source for license')}</p></div>
    </article>`;
}

function render() {
  const collection = mode === 'saved';
  const data = [...(collection ? saved : results).values()];
  const visible = data.filter(item => orientation === 'all' || orientationOf(item) === orientation);
  find('#saved-count').textContent = saved.size;
  find('#explore').setAttribute('aria-pressed',String(!collection));
  find('#collection').setAttribute('aria-pressed',String(collection));
  find('#gallery-title').textContent = collection ? 'Saved images' : 'Explore images';
  find('#result-description').textContent = collection ? `${visible.length} of ${data.length} saved` :
    query ? `${pending && !data.length ? 'Searching for' : visible.length+' loaded for'} “${query}”` : 'Search the Commons collection.';
  resultGrid.setAttribute('aria-busy',String(!collection && pending));
  document.querySelectorAll('[data-orientation]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.orientation === orientation)));
  loadButton.hidden = collection || (!cursor && !hasFailedPage);
  loadButton.disabled = pending;
  loadButton.textContent = pending ? 'Loading images…' : hasFailedPage ? 'Retry loading more' : 'Load more images';

  if (visible.length) {
    const pageError = !collection && hasFailedPage ? `<div class="empty"><p>${esc(failure)}</p></div>` : '';
    resultGrid.innerHTML = visible.map(card).join('')+pageError;
    return;
  }
  const message = collection ? (saved.size ? 'No saved images match this orientation.' : 'No saved images yet. Use a bookmark button to save one.') :
    pending ? 'Finding images on Wikimedia Commons…' : failure || (data.length || cursor
    ? 'No loaded images match this orientation. Try another filter or load more.'
    : 'No matching images. Try a different search term.');
  resultGrid.innerHTML = `<div class="empty"><p>${esc(message)}</p>${!collection && failure && !hasFailedPage ? '<button class="button outline" id="retry">Retry search</button>' : ''}</div>`;
}

function requestUrl(next) {
  const params = new URLSearchParams({
    action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:String(pageSize),
    prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'500',
    iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl',
    format:'json',formatversion:'2',origin:'*',...next
  });
  return `${endpoint}?${params}`;
}

async function fetchPage(append = false) {
  request?.abort();
  const control = new AbortController();
  request = control;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; control.abort(); },14000);
  pending = true;
  failure = '';
  hasFailedPage = false;
  render();
  try {
    const response = await fetch(requestUrl(append ? cursor : null),{ signal:control.signal,credentials:'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.code);
    if (request !== control) return;
    const pages = [...(data.query?.pages ?? [])].sort((a,b) => (a.index ?? 0)-(b.index ?? 0));
    for (const page of pages) {
      const item = parseResult(page);
      if (item && !results.has(item.id)) results.set(item.id,item);
    }
    cursor = data.continue?.gsroffset !== undefined ? { gsroffset:String(data.continue.gsroffset),continue:String(data.continue.continue ?? 'gsroffset||') } : null;
  } catch (error) {
    if (request !== control || (control.signal.aborted && !timedOut)) return;
    hasFailedPage = append;
    failure = timedOut ? 'Wikimedia Commons took too long to respond. Try again.' : 'Images could not be loaded from Wikimedia Commons. Check your connection and try again.';
  } finally {
    clearTimeout(timeout);
    if (request === control) {
      pending = false;
      request = null;
      render();
    }
  }
}

function searchImages(value,{scroll = true} = {}) {
  const term = value.trim().slice(0,100);
  if (!term) return;
  queryInput.setCustomValidity('');
  queryInput.value = term;
  query = term;
  mode = 'explore';
  orientation = 'all';
  results = new Map();
  cursor = null;
  fetchPage();
  if (scroll) find('#gallery').scrollIntoView({block:'start'});
}

function updatePreviewButton() {
  const button = find('#preview-bookmark');
  const isSaved = saved.has(activeItem.id);
  button.setAttribute('aria-pressed',String(isSaved));
  button.innerHTML = `${icon('bookmark')} ${isSaved ? 'Remove from saved' : 'Save image'}`;
}

function openPreview(item) {
  activeItem = item;
  find('#preview-title').textContent = item.title;
  const license = esc(item.license || 'See source file page');
  previewContent.innerHTML = `<img src="${esc(item.thumbnail)}" alt="${esc(item.title)}">
    <div class="details"><dl><dt>Original dimensions</dt><dd>${item.width} × ${item.height} px</dd>
    <dt>Creator</dt><dd>${esc(item.author || 'See source file page')}</dd>
    <dt>License</dt><dd>${item.licenseUrl ? `<a href="${esc(item.licenseUrl)}" target="_blank" rel="noopener noreferrer">${license}</a>` : license}</dd></dl>
    <p>Check the source file page for full attribution and reuse terms.</p>
    <div class="detail-actions"><a class="button primary" href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">View source</a>
    <a class="button outline" href="${esc(item.original)}" target="_blank" rel="noopener noreferrer">Open original</a></div>
    <div class="detail-actions"><button class="button outline" id="preview-bookmark" type="button"></button></div></div>`;
  updatePreviewButton();
  find('#preview-bookmark').addEventListener('click',() => toggleSaved(item));
  preview.showModal();
  find('#close-preview').focus();
}

document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
find('#search-form').addEventListener('submit',event => {
  event.preventDefault();
  if (!queryInput.value.trim()) {
    queryInput.setCustomValidity('Enter a search term.');
    queryInput.reportValidity();
    return;
  }
  searchImages(queryInput.value);
});
queryInput.addEventListener('input',() => queryInput.setCustomValidity(''));
find('#more').addEventListener('click',() => { if (cursor && !pending) fetchPage(true); });
find('#close-preview').addEventListener('click',() => preview.close());
preview.addEventListener('close',() => {
  notice.textContent = '';
  document.body.append(notice);
  const id = activeItem?.id;
  activeItem = null;
  if (id) (resultGrid.querySelector(`[data-open="${id}"]`) ?? find(mode === 'saved' ? '#collection' : '#explore')).focus({preventScroll:true});
});

document.addEventListener('click',event => {
  const topic = event.target.closest('[data-topic]');
  if (topic) searchImages(topic.dataset.topic);
  const filter = event.target.closest('[data-orientation]');
  if (filter) {
    orientation = filter.dataset.orientation;
    render();
  }
  const view = event.target.closest('#explore,#collection');
  if (view) {
    mode = view.id === 'collection' ? 'saved' : 'explore';
    orientation = 'all';
    render();
    find('#gallery').scrollIntoView({block:'start'});
  }
  const target = event.target.closest('[data-open],[data-save],#retry');
  if (!target) return;
  if (target.id === 'retry') {
    fetchPage();
    return;
  }
  const id = Number(target.dataset.open ?? target.dataset.save);
  const item = (mode === 'saved' ? saved : results).get(id);
  if (!item) return;
  if (target.hasAttribute('data-open')) openPreview(item);
  else {
    toggleSaved(item);
    (resultGrid.querySelector(`[data-save="${id}"]`) ?? find('#collection')).focus({preventScroll:true});
  }
});

searchImages(defaultQuery,{scroll:false});
