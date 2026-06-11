/* ═════════════════════════════════════════════
   NookResonance — js/modals/lightbox.js
   ライトボックス（画像拡大・ナビ対応）
   ═════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// ズーム・パン状態
// ─────────────────────────────────────────────
function _lbApply() {
  const img = document.getElementById('lightboxImg');
  if (!img) return;
  if (_lbScale <= 1) { _lbX=0; _lbY=0; }
  img.style.transform = `translate(${_lbX}px,${_lbY}px) scale(${_lbScale})`;
  img.style.cursor = _lbScale > 1 ? 'grab' : 'zoom-in';
}
function _lbReset() { _lbScale=1; _lbX=0; _lbY=0; _lbApply(); }
function _lbDist(t) {
  const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY;
  return Math.sqrt(dx*dx+dy*dy);
}

// ─────────────────────────────────────────────
// ピンチ・ダブルタップ・パンジェスチャー
// ─────────────────────────────────────────────
function _lbBindGestures(img) {
  img.addEventListener('click', e => {
    const now = Date.now();
    if (now - _lbLastTap < 300) {
      if (_lbScale > 1) { _lbReset(); }
      else {
        const r=img.getBoundingClientRect();
        _lbScale=2.5; _lbX=-(e.clientX-r.left-r.width/2)*1.5; _lbY=-(e.clientY-r.top-r.height/2)*1.5;
        _lbApply();
      }
      _lbLastTap=0;
    } else { _lbLastTap=now; }
  });
  img.addEventListener('touchstart', e => {
    if (e.touches.length===2) { e.preventDefault(); _lbPinchDist=_lbDist(e.touches); _lbPinchScale=_lbScale; _lbPanStart=null; }
    else if (e.touches.length===1 && _lbScale>1) { _lbPanStart={x:e.touches[0].clientX,y:e.touches[0].clientY}; _lbPanOrigin={x:_lbX,y:_lbY}; }
  }, {passive:false});
  img.addEventListener('touchmove', e => {
    if (e.touches.length===2 && _lbPinchDist) { e.preventDefault(); _lbScale=Math.min(5,Math.max(1,_lbPinchScale*_lbDist(e.touches)/_lbPinchDist)); _lbApply(); }
    else if (e.touches.length===1 && _lbPanStart && _lbScale>1) { e.preventDefault(); _lbX=_lbPanOrigin.x+(e.touches[0].clientX-_lbPanStart.x); _lbY=_lbPanOrigin.y+(e.touches[0].clientY-_lbPanStart.y); _lbApply(); }
  }, {passive:false});
  img.addEventListener('touchend', e => {
    if (e.touches.length<2) _lbPinchDist=null;
    if (!e.touches.length) _lbPanStart=null;
    if (_lbScale<1) { _lbScale=1; _lbApply(); }
  });
}

// ─────────────────────────────────────────────
// ナビ状態
// ─────────────────────────────────────────────
let _lbImages    = [];   // { url } の配列
let _lbIdx       = 0;
let _lbOnNavigate = null;

async function _lbLoadImg(imgEl, dlEl, idx) {
  const entry = _lbImages[idx];
  if (!entry) return;
  if (!entry.blobUrl) {
    try {
      const r = await fetch(entry.url, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
      if (r.ok) entry.blobUrl = URL.createObjectURL(await r.blob());
    } catch {}
  }
  if (!entry.blobUrl) return;
  imgEl.src = entry.blobUrl;
  if (dlEl) {
    dlEl.href = entry.blobUrl;
    try {
      const fname = new URL(entry.url, location.origin).searchParams.get('filename');
      if (fname) dlEl.download = fname;
    } catch {}
  }
}

function _lbPreload(idx) {
  [-1, 1].forEach(d => {
    const i = idx + d;
    if (i >= 0 && i < _lbImages.length && !_lbImages[i].blobUrl) {
      fetch(_lbImages[i].url, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } })
        .then(r => r.ok ? r.blob() : null)
        .then(blob => { if (blob) _lbImages[i].blobUrl = URL.createObjectURL(blob); })
        .catch(() => {});
    }
  });
}

function _lbNavigate(delta) {
  const next = _lbIdx + delta;
  if (next < 0 || next >= _lbImages.length) return;

  const img = document.getElementById('lightboxImg');
  if (!img) return;

  // ズームしている場合はナビせず
  if (_lbScale > 1) return;

  const outX = delta > 0 ? '-100%' : '100%';
  const inX  = delta > 0 ? '100%'  : '-100%';
  img.style.transition = 'transform 0.18s ease';
  img.style.transform  = `translateX(${outX})`;

  setTimeout(async () => {
    _lbIdx = next;
    _lbReset();
    img.style.transition = 'none';
    img.style.transform  = `translateX(${inX})`;
    await _lbLoadImg(img, document.getElementById('lightboxDl'), _lbIdx);
    _lbUpdateNav();
    if (_lbOnNavigate) _lbOnNavigate(_lbIdx);
    requestAnimationFrame(() => {
      img.style.transition = 'transform 0.18s ease';
      img.style.transform  = 'translateX(0)';
      _lbPreload(_lbIdx);
    });
  }, 180);
}

function _lbUpdateNav() {
  const hasNav = _lbImages.length > 1;
  const prev = document.getElementById('lightboxPrev');
  const next = document.getElementById('lightboxNext');
  const count = document.getElementById('lightboxCount');
  if (prev)  { prev.style.display  = hasNav && _lbIdx > 0 ? '' : 'none'; }
  if (next)  { next.style.display  = hasNav && _lbIdx < _lbImages.length - 1 ? '' : 'none'; }
  if (count) { count.style.display = hasNav ? '' : 'none'; count.textContent = `${_lbIdx + 1} / ${_lbImages.length}`; }
}

// ─────────────────────────────────────────────
// openLightbox(url, opts?)
// opts: { images: [{url}], idx: number, onNavigate: (idx) => void }
// ─────────────────────────────────────────────
function openLightbox(url, opts = {}) {
  if (_anchorSelectMode) return;

  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.style.cssText = 'position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);overflow:hidden;';
    lb.innerHTML = `
      <img id="lightboxImg" alt="Full size" style="max-width:100%;max-height:100%;object-fit:contain;transform-origin:center;transition:transform 0.1s;">
      <button id="lightboxClose" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;">✕</button>
      <button id="lightboxPrev" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;width:40px;height:40px;border-radius:50%;font-size:20px;cursor:pointer;display:none;">‹</button>
      <button id="lightboxNext" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;width:40px;height:40px;border-radius:50%;font-size:20px;cursor:pointer;display:none;">›</button>
      <div id="lightboxCount" style="position:absolute;bottom:56px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.6);font-size:12px;display:none;"></div>
      <a id="lightboxDl" download style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.15);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;text-decoration:none;">⬇ 保存</a>
    `;
    document.body.appendChild(lb);

    lb.addEventListener('click', e => { if (e.target===lb && _lbScale<=1) closeLightbox(); });
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('lightboxPrev').addEventListener('click', () => _lbNavigate(-1));
    document.getElementById('lightboxNext').addEventListener('click', () => _lbNavigate(+1));
    _lbBindGestures(document.getElementById('lightboxImg'));

    // キーボード
    document._lbKeyHandler = e => {
      if (lb.style.display === 'none') return;
      if (e.key === 'ArrowLeft')  _lbNavigate(-1);
      if (e.key === 'ArrowRight') _lbNavigate(+1);
      if (e.key === 'Escape')     closeLightbox();
    };
    document.addEventListener('keydown', document._lbKeyHandler);

    // スワイプ（ズーム中は無効）
    let swipeStartX = 0;
    lb.addEventListener('touchstart', e => {
      if (_lbScale > 1) return;
      swipeStartX = e.touches[0].clientX;
    }, { passive: true });
    lb.addEventListener('touchend', e => {
      if (_lbScale > 1) return;
      const dx = e.changedTouches[0].clientX - swipeStartX;
      if (Math.abs(dx) > 50) _lbNavigate(dx < 0 ? +1 : -1);
    }, { passive: true });
  }

  // ナビ状態セット
  if (opts.images && opts.images.length > 0) {
    _lbImages     = opts.images;
    _lbIdx        = opts.idx ?? 0;
    _lbOnNavigate = opts.onNavigate ?? null;
  } else {
    _lbImages     = [{ url }];
    _lbIdx        = 0;
    _lbOnNavigate = null;
  }

  _lbReset();
  const img = document.getElementById('lightboxImg');
  img.style.transition = 'none';
  img.style.transform  = 'translateX(0)';
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _lbUpdateNav();
  _lbLoadImg(img, document.getElementById('lightboxDl'), _lbIdx);

  // 前後プリロード
  _lbPreload(_lbIdx);
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
  _lbReset();
  _lbImages.forEach(e => { if (e.blobUrl) URL.revokeObjectURL(e.blobUrl); });
  _lbImages = [];
  _lbOnNavigate = null;
  document.body.style.overflow = '';
}
