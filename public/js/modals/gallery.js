/* ═════════════════════════════════════════════
   NookResonance — gallery.js
   ギャラリー（キャラクターごとの思い出アルバム）
   ═════════════════════════════════════════════ */

let _galleryImages      = [];
let _galleryCarouselIdx = 0;

async function openGallery() {
  if (!activeChar) { showToast(t('chat.no_char', 'キャラクターを選択してください')); return; }
  if (!isRestEnabled()) { showToast(t('toast.login_required', 'ログインが必要です')); return; }

  openModal('galleryOverlay');
  const titleEl = document.getElementById('galleryTitle');
  if (titleEl) titleEl.textContent = t('gallery.title', "{name}'s Gallery").replace('{name}', activeChar.name);
  _renderGalleryLoading();

  try {
    const [comfyRes, cacheRes] = await Promise.all([
      restGet(`images/count/${activeChar.id}`),
      restGet(`images/cache/count/${activeChar.id}`),
    ]);

    const comfyCount = comfyRes.count ?? 0;
    const cacheCount = cacheRes.count ?? 0;

    if (comfyCount === 0 || comfyCount === cacheCount) {
      await _loadGalleryImages();
    } else {
      _renderGallerySyncing(cacheCount, comfyCount);
      await restPost(`images/sync/${activeChar.id}`, {});
      await _pollUntilSynced(comfyCount);
      await _loadGalleryImages();
    }
  } catch(e) {
    _renderGalleryError(e.message);
  }
}

async function _pollUntilSynced(targetCount, maxRetry = 20) {
  for (let i = 0; i < maxRetry; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await restGet(`images/cache/count/${activeChar.id}`);
      if ((res.count ?? 0) >= targetCount) return;
    } catch(e) { /* 続行 */ }
  }
}

async function _loadGalleryImages() {
  const list = await restGet(`images/${activeChar.id}`);
  _galleryImages      = list;
  _galleryCarouselIdx = 0;
  _renderGallery();
}

function formatGalleryImageCount(count) {
  const n = Number(count) || 0;
  if (isEnglishMode()) {
    return (n === 1 ? t('gallery.image_count_one', '{count} image') : t('gallery.image_count', '{count} images')).replace('{count}', n);
  }
  return `${n}枚`;
}

function _renderGallery() {
  const body = document.getElementById('galleryBody');
  if (!body) return;

  if (!_galleryImages.length) {
    body.innerHTML = `
      <div style="text-align:center;padding:48px 16px;color:var(--text-pale);">
        <div style="font-size:40px;margin-bottom:12px;">📷</div>
        <div>${t('gallery.empty', 'まだ画像がありません')}</div>
      </div>`;
    return;
  }

  body.innerHTML = '';

  const carouselEl = document.createElement('div');
  carouselEl.className = 'gallery-carousel-wrap';
  carouselEl.innerHTML = `
    <div class="gallery-carousel-outer" id="galleryCarouselOuter">
      <div class="gallery-carousel-track" id="galleryCarouselTrack"></div>
    </div>
    <div class="gallery-carousel-dots" id="galleryCarouselDots"></div>
  `;
  body.appendChild(carouselEl);

  const track = carouselEl.querySelector('#galleryCarouselTrack');
  const dots  = carouselEl.querySelector('#galleryCarouselDots');

  _galleryImages.forEach((img, idx) => {
    const slide = document.createElement('div');
    slide.className = 'gallery-carousel-slide';
    const el = document.createElement('img');
    el.loading = 'lazy';
    el.alt     = t('gallery.image_alt', '画像 {index}').replace('{index}', idx + 1);
    el.addEventListener('click', () => openGalleryLightbox(idx));
    _observeGalleryImg(el, img.thumb_url || '');
    slide.appendChild(el);
    track.appendChild(slide);

    const dot = document.createElement('div');
    dot.className = 'gallery-carousel-dot' + (idx === 0 ? ' active' : '');
    dot.addEventListener('click', () => _galleryCarouselGoTo(idx));
    dots.appendChild(dot);
  });

  _galleryCarouselGoTo(0);
  _initGalleryCarouselSwipe(carouselEl.querySelector('#galleryCarouselOuter'));

  const gridWrap = document.createElement('div');
  gridWrap.innerHTML = `
    <div class="gallery-grid-header">${t('gallery.all_images', 'すべての画像')} <span style="color:var(--text-pale);font-size:11px;">${formatGalleryImageCount(_galleryImages.length)}</span></div>
    <div class="gallery-grid" id="galleryGrid"></div>
  `;
  body.appendChild(gridWrap);

  const grid = gridWrap.querySelector('#galleryGrid');
  _galleryImages.forEach((img, idx) => {
    const cell = document.createElement('div');
    cell.className = 'gallery-thumb';
    cell.style.position = 'relative';
    const imgEl = document.createElement('img');
    imgEl.alt     = t('gallery.image_alt', '画像 {index}').replace('{index}', idx + 1);
    imgEl.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:1;';
    overlay.addEventListener('click', () => _galleryCarouselGoTo(idx));
    _bindGalleryThumbLongPress(overlay, img, idx);
    _observeGalleryImg(imgEl, img.thumb_url || '');
    cell.appendChild(imgEl);
    cell.appendChild(overlay);
    grid.appendChild(cell);
  });
}

function _bindGalleryThumbLongPress(el, img, idx) {
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const x = e.clientX || e.touches?.[0]?.clientX || 100;
    const y = e.clientY || e.touches?.[0]?.clientY || 100;
    showCtxMenu(x, y, [
      { icon: '🗑', label: t('delete', '削除'), action: () => _deleteGalleryImage(img, idx) },
    ]);
  };

  el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); handler(e); });

  let timer, longPressed = false;
  el.addEventListener('touchstart', e => {
    longPressed = false;
    timer = setTimeout(() => { longPressed = true; handler(e); }, 600);
  }, { passive: true });
  el.addEventListener('touchend', e => {
    clearTimeout(timer);
    if (longPressed) { e.preventDefault(); longPressed = false; }
  });
  el.addEventListener('touchmove', () => { clearTimeout(timer); longPressed = false; });
  el.addEventListener('click', e => { if (_ctxMenu) e.stopPropagation(); });
}

async function _deleteGalleryImage(img, idx) {
  if (!activeChar) return;
  if (!confirm(t('confirm_delete', 'この画像を削除しますか？'))) return;
  try {
    await restDelete(`images/${activeChar.id}/${img.filename}`);
    _galleryImages.splice(idx, 1);
    _renderGallery();
    showToast(t('toast.deleted', '削除しました'));
  } catch(e) {
    showToast('❌ ' + t('delete_failed', '削除失敗: ') + e.message.slice(0, 40));
  }
}

function openGalleryLightbox(idx) {
  const images = _galleryImages.map(img => ({ url: img.image_url || img.thumb_url || '' }));
  openLightbox(images[idx].url, {
    images,
    idx,
    onNavigate: (newIdx) => _galleryCarouselGoTo(newIdx),
  });
}

let _galleryObserver = null;
function _observeGalleryImg(el, src) {
  if (!src) return;
  if (!_galleryObserver) {
    _galleryObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.onerror = () => {
              if (img.src.endsWith('.jpg')) img.src = img.src.replace(/\.jpg$/i, '.png');
              img.onerror = null;
            };
            delete img.dataset.src;
            _galleryObserver.unobserve(img);
          }
        }
      });
    }, { rootMargin: '100px' });
  }
  el.dataset.src = src;
  _galleryObserver.observe(el);
}

function _galleryCarouselGoTo(idx) {
  const track = document.getElementById('galleryCarouselTrack');
  if (!track) return;
  _galleryCarouselIdx = Math.max(0, Math.min(idx, track.children.length - 1));
  track.style.transform = `translateX(-${_galleryCarouselIdx * 100}%)`;
  document.querySelectorAll('.gallery-carousel-dot').forEach((d, i) => {
    d.classList.toggle('active', i === _galleryCarouselIdx);
  });
}

function _initGalleryCarouselSwipe(outer) {
  if (!outer) return;
  let startX = 0, dragging = false, dx = 0;
  outer.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX; dragging = true; dx = 0;
    const track = document.getElementById('galleryCarouselTrack');
    if (track) track.style.transition = 'none';
  }, { passive: true });
  outer.addEventListener('touchmove', e => {
    if (!dragging) return;
    dx = e.touches[0].clientX - startX;
    const track = document.getElementById('galleryCarouselTrack');
    if (track) {
      track.style.transform = `translateX(calc(${-_galleryCarouselIdx * 100}% + ${dx}px))`;
    }
  }, { passive: true });
  outer.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const track = document.getElementById('galleryCarouselTrack');
    if (track) track.style.transition = '';
    if (dx < -40) _galleryCarouselGoTo(_galleryCarouselIdx + 1);
    else if (dx > 40) _galleryCarouselGoTo(_galleryCarouselIdx - 1);
    else _galleryCarouselGoTo(_galleryCarouselIdx);
  });
}

function _renderGalleryLoading() {
  const body = document.getElementById('galleryBody');
  if (body) body.innerHTML = `
    <div style="text-align:center;padding:48px 16px;color:var(--text-pale);">
      <div style="font-size:13px;">${t('gallery.loading', '読み込み中…')}</div>
    </div>`;
}
function _renderGallerySyncing(cacheCount, comfyCount) {
  const body = document.getElementById('galleryBody');
  if (body) body.innerHTML = `
    <div style="text-align:center;padding:48px 16px;color:var(--text-pale);">
      <div style="font-size:13px;margin-bottom:8px;">${t('gallery.syncing', '同期中… ({cache} / {total})').replace('{cache}', cacheCount).replace('{total}', comfyCount)}</div>
      <div style="font-size:11px;">${t('gallery.wait', 'しばらくお待ちください')}</div>
    </div>`;
}
function _renderGalleryError(msg) {
  const body = document.getElementById('galleryBody');
  if (body) body.innerHTML = `
    <div style="text-align:center;padding:48px 16px;color:var(--text-pale);">
      <div style="font-size:13px;color:var(--accent);">❌ ${escHtml(msg.slice(0, 60))}</div>
    </div>`;
}
