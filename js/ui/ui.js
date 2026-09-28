// The atlas interface: field guide, evidence cards, light & weather, options,
// the accuracy lens legend, the guided flight, map floors and the About page.

import { hydrateIcons, ICONS } from './icons.js';
import { PLACES, CATEGORIES, TIERS, TIER_INDEX, BOOKS, TOUR } from '../data/places.js';
import { FLOORS, ROOMS, UNPLACED } from '../data/floors.js';
import { TIME_PRESETS, WEATHER, SOLAR_NOON } from '../engine/atmosphere.js';
import { TIERS as QUALITY } from '../engine/renderer.js';
import { PROV_COLORS } from '../engine/shared.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function citeTitle(cite) {
  const key = cite.match(/^[A-Za-z]+/)?.[0];
  return BOOKS[key] ? `${BOOKS[key]}${cite.slice(key.length) ? `, chapter ${cite.slice(key.length).replace(/^[\s–-]+/, '')}` : ''}` : cite;
}

function timeText(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function phaseName(el, hour) {
  const am = hour < SOLAR_NOON;
  if (el < -6) return { name: 'Moonlight', icon: 'moon' };
  if (el < -1) return { name: am ? 'Before dawn' : 'Blue hour', icon: 'moon' };
  if (el < 9) return { name: am ? 'First light' : 'Golden hour', icon: 'sunset' };
  // The Highland sun stays high for hours around noon, so go by the clock.
  if (Math.abs(hour - SOLAR_NOON) > 1.5) return { name: am ? 'Morning' : 'Afternoon', icon: 'sun' };
  return { name: 'Midday', icon: 'sun' };
}

export function createUI(app) {
  hydrateIcons();
  const state = { selected: null, filter: 'all', query: '', tourOn: false, tourIndex: 0, tourPaused: false, tourTimer: 0, dwell: 0, floor: null };
  const toast = (msg) => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('show'), 2600);
  };

  // ── Field guide ─────────────────────────────────────────────────────────
  $('guide-count').textContent = PLACES.length;
  const filters = $('guide-filters');
  filters.innerHTML = [{ id: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label.replace(/^The /, '').replace(/^./, (m) => m.toUpperCase()) }))]
    .map((f) => `<button class="chip" data-filter="${f.id}" aria-pressed="${f.id === 'all'}">${esc(f.label)}</button>`).join('');
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    state.filter = b.dataset.filter;
    filters.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  });
  $('guide-search').addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); renderList(); });

  function tierDots(p) {
    const seen = [...new Set(p.evidence.map((e) => e.tier))].sort((a, b) => TIER_INDEX[a] - TIER_INDEX[b]);
    return `<span class="tier-dots" aria-hidden="true">${seen.map((t) => `<i class="tier-dot" style="background:${PROV_COLORS[TIER_INDEX[t]]}"></i>`).join('')}</span>`;
  }

  function renderList() {
    const list = $('guide-list');
    const q = state.query;
    let html = '';
    let n = 0;
    for (const c of CATEGORIES) {
      if (state.filter !== 'all' && state.filter !== c.id) continue;
      const items = PLACES.filter((p) => p.cat === c.id && (!q || `${p.name} ${p.tagline} ${p.summary}`.toLowerCase().includes(q)));
      if (!items.length) continue;
      html += `<li><h3>${esc(c.label)}</h3></li>`;
      for (const p of items) {
        const idx = PLACES.indexOf(p) + 1;
        n++;
        html += `<li><button class="place-item" data-place="${p.id}" aria-current="${state.selected === p.id}">
          <span class="num">${String(idx).padStart(2, '0')}</span>
          <span><span class="nm">${esc(p.name)}</span><span class="tg">${esc(p.tagline)}</span></span>
          ${tierDots(p)}</button></li>`;
      }
    }
    if (!n) html = `<li style="padding:12px 14px;color:var(--muted)">No place matches “${esc(state.query)}”. Try “tower”, “lake” or “Hagrid”.</li>`;
    list.innerHTML = html;
  }
  $('guide-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-place]');
    if (b) select(b.dataset.place, { fly: true });
  });
  const openGuide = (open) => {
    $('guide').hidden = !open;
    $('btn-guide').hidden = open;
    $('btn-guide').setAttribute('aria-expanded', String(open));
    if (open) { renderList(); if (matchMedia('(min-width: 761px)').matches) $('guide-search').focus({ preventScroll: true }); }
  };
  $('btn-guide').addEventListener('click', () => { openGuide(true); closeCard(); });
  $('guide-close').addEventListener('click', () => openGuide(false));

  // ── Place card ──────────────────────────────────────────────────────────
  function renderCard(p) {
    const idx = PLACES.indexOf(p) + 1;
    const cat = CATEGORIES.find((c) => c.id === p.cat);
    const ev = p.evidence.map((e) => `<li><span class="tier ${e.tier}" title="${esc(TIERS[TIER_INDEX[e.tier]].note)}">${esc(TIERS[TIER_INDEX[e.tier]].short)}</span>
      <div><p>${esc(e.text)}</p><cite title="${esc(citeTitle(e.cite))}">${esc(e.cite === 'Atlas' ? 'Our design' : citeTitle(e.cite))}</cite></div></li>`).join('');
    const card = $('card');
    card.innerHTML = `<div class="card-scroll">
      <div class="card-top"><span class="eyebrow">${String(idx).padStart(2, '0')} · ${esc(cat.label)}</span>
        <button class="icon-btn" id="card-close" aria-label="Close" data-icon="close"></button></div>
      <h2>${esc(p.name)}</h2>
      <p class="tagline">${esc(p.tagline)}</p>
      <p class="summary">${esc(p.summary)}</p>
      <div class="card-actions">
        <button class="btn primary" data-act="fly"><span data-icon="pin"></span>Fly there</button>
        ${p.walk ? '<button class="btn" data-act="walk"><span data-icon="walk"></span>Walk here</button>' : ''}
        <button class="btn" data-act="map"><span data-icon="map"></span>On the map</button>
      </div>
      <div class="section-title"><h3>How we know</h3><small>strongest evidence first</small></div>
      <ul class="evidence">${ev}</ul>
      ${p.films ? `<div class="section-title"><h3>On screen</h3></div><p class="note"><strong>Film-only</strong>${esc(p.films)}</p>` : ''}
      ${p.story ? `<div class="section-title"><h3>The story here</h3><small>${esc(p.storyCite ? citeTitle(p.storyCite.split(',')[0]) : '')}</small></div>
        <div class="story" id="story"><button class="story-veil" id="story-veil">Reveal · contains plot spoilers <span data-icon="down"></span></button></div>` : ''}
      ${p.sources?.length ? `<div class="section-title"><h3>Read the sources</h3></div><ul class="sources">${p.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul>` : ''}
    </div>`;
    hydrateIcons(card);
    card.hidden = false;
    card.querySelector('#card-close').addEventListener('click', () => { closeCard(); app.highlight(null); });
    card.querySelector('[data-act="fly"]').addEventListener('click', () => app.flyToPlace(p.id));
    card.querySelector('[data-act="walk"]')?.addEventListener('click', () => { app.walkToPlace(p.id); setModeUI('walk'); });
    card.querySelector('[data-act="map"]').addEventListener('click', () => { setMode('map'); app.map.focusPlace?.(p.id); });
    card.querySelector('#story-veil')?.addEventListener('click', () => {
      $('story').innerHTML = `<p>${esc(p.story)}</p>`;
    });
  }

  function closeCard() {
    $('card').hidden = true;
    state.selected = null;
    renderList();
  }

  function select(id, { fly = false } = {}) {
    const p = PLACES.find((x) => x.id === id);
    if (!p) return;
    state.selected = id;
    if (!matchMedia('(min-width: 761px)').matches) openGuide(false);
    renderCard(p);
    renderList();
    app.highlight(id);
    if (fly && app.mode !== 'map') app.flyToPlace(id);
  }

  // ── Light & weather ─────────────────────────────────────────────────────
  const atmoPanel = $('atmo-panel');
  const weatherIcon = { clear: 'sun', mist: 'mist', rain: 'rain', snow: 'snow', storm: 'storm' };
  atmoPanel.innerHTML = `<h3>Light & atmosphere</h3>
    <div class="eyebrow" style="margin-bottom:8px">Time of day</div>
    <div class="grid-chips" id="time-chips">${TIME_PRESETS.map((t) => `<button class="chip" data-hour="${t.hour}">${esc(t.label)}</button>`).join('')}</div>
    <div class="slider-row"><span data-icon="moon"></span><input type="range" id="hour" min="0" max="23.98" step="0.02" aria-label="Time of day"><output id="hour-out"></output></div>
    <div class="switch-row"><span>Let the day unfold<small>A day passes in about four minutes</small></span><button class="switch" id="sw-animate" role="switch" aria-checked="false" aria-label="Let the day unfold"></button></div>
    <div class="divider"></div>
    <div class="eyebrow" style="margin-bottom:8px">Weather</div>
    <div class="grid-chips" id="weather-chips">${WEATHER.map((w) => `<button class="chip" data-weather="${w.id}"><span data-icon="${weatherIcon[w.id]}"></span>${esc(w.label.replace('Highland ', '').replace(/^./, (c) => c.toUpperCase()))}</button>`).join('')}</div>`;
  hydrateIcons(atmoPanel);
  const place = (panel, anchor, align = 'right') => {
    const r = anchor.getBoundingClientRect();
    panel.style.top = `${r.bottom + 8}px`;
    if (align === 'right') { panel.style.right = `${Math.max(16, innerWidth - r.right)}px`; panel.style.left = 'auto'; panel.style.bottom = 'auto'; }
  };
  const togglePopover = (panel, btn, show) => {
    const open = show ?? panel.hidden;
    for (const p of [atmoPanel, $('opts-panel')]) if (p !== panel) p.hidden = true;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    return open;
  };
  $('btn-atmo').addEventListener('click', (e) => {
    e.stopPropagation();
    if (togglePopover(atmoPanel, $('btn-atmo'))) { place(atmoPanel, $('btn-atmo')); syncAtmo(); }
  });
  atmoPanel.addEventListener('click', (e) => {
    e.stopPropagation();
    const h = e.target.closest('[data-hour]');
    if (h) { app.setHour(parseFloat(h.dataset.hour)); app.setAnimate(false); syncAtmo(); }
    const w = e.target.closest('[data-weather]');
    if (w) { app.setWeather(w.dataset.weather); syncAtmo(); }
  });
  $('hour').addEventListener('input', (e) => { app.setHour(parseFloat(e.target.value), true); app.setAnimate(false); syncAtmo(); });
  $('sw-animate').addEventListener('click', () => { app.setAnimate(!app.animate); syncAtmo(); });
  function syncAtmo() {
    $('hour').value = app.atmo.targetHour;
    $('hour-out').textContent = timeText(app.atmo.targetHour);
    $('sw-animate').setAttribute('aria-checked', String(app.animate));
    atmoPanel.querySelectorAll('[data-weather]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.weather === app.atmo.weather)));
    atmoPanel.querySelectorAll('[data-hour]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(parseFloat(b.dataset.hour) - app.atmo.targetHour) < 0.05)));
  }

  // ── Options ─────────────────────────────────────────────────────────────
  const opts = $('opts-panel');
  function renderOptions() {
    opts.innerHTML = `<h3>Make it yours</h3>
      <div class="eyebrow" style="margin-bottom:8px">Detail & performance</div>
      <div class="tiers-list" role="radiogroup" aria-label="Detail">${Object.entries(QUALITY).map(([id, t]) => `<button class="tier-opt" role="radio" data-tier="${id}" aria-checked="${app.tierId === id}"><strong>${t.label}</strong><span>${id === app.autoTier ? '<small style="grid-column:auto">suggested</small>' : ''}</span><small>${esc(t.note)}</small></button>`).join('')}</div>
      <div class="divider"></div>
      <div class="switch-row"><span>Place names<small>Labels on the landscape</small></span><button class="switch" id="sw-labels" role="switch" aria-checked="${app.labelsOn}" aria-label="Place names"></button></div>
      <div class="switch-row"><span>Soundscape<small>Wind, rain and the odd owl</small></span><button class="switch" id="sw-sound" role="switch" aria-checked="${app.soundOn}" aria-label="Soundscape"></button></div>
      <div class="switch-row"><span>Brisk pace<small>Faster walking and flight</small></span><button class="switch" id="sw-fast" role="switch" aria-checked="${app.fast}" aria-label="Brisk pace"></button></div>
      <p style="margin:10px 0 0;color:var(--muted);font-size:12.5px" id="perf-line"></p>`;
  }
  $('btn-options').addEventListener('click', (e) => {
    e.stopPropagation();
    renderOptions();
    if (togglePopover(opts, $('btn-options'))) {
      const r = $('btn-options').getBoundingClientRect();
      opts.style.top = 'auto';
      opts.style.bottom = `${innerHeight - r.top + 8}px`;
      opts.style.right = `${Math.max(16, innerWidth - r.right)}px`;
      opts.style.left = 'auto';
    }
  });
  opts.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = e.target.closest('[data-tier]');
    if (t) { app.setTier(t.dataset.tier); renderOptions(); toast(`${QUALITY[t.dataset.tier].label} detail. Rebuilding the world for it…`); }
    if (e.target.closest('#sw-labels')) { app.setLabels(!app.labelsOn); renderOptions(); syncRail(); }
    if (e.target.closest('#sw-sound')) { app.setSound(!app.soundOn); renderOptions(); }
    if (e.target.closest('#sw-fast')) { app.setFast(!app.fast); renderOptions(); }
  });
  document.addEventListener('click', () => { atmoPanel.hidden = true; opts.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      atmoPanel.hidden = true; opts.hidden = true;
      if (!$('card').hidden) closeCard();
      else if (state.tourOn) stopTour();
    }
  });

  // ── Rail ────────────────────────────────────────────────────────────────
  const syncRail = () => {
    $('btn-labels').setAttribute('aria-pressed', String(app.labelsOn));
    $('btn-lens').setAttribute('aria-pressed', String(app.lensOn));
    $('legend').hidden = !app.lensOn || app.mode === 'map';
  };
  $('btn-home').addEventListener('click', () => { if (app.mode !== 'explore') setMode('explore'); app.overview(); closeCard(); });
  $('btn-overview').addEventListener('click', () => { if (app.mode !== 'explore') setMode('explore'); app.overview(); });
  $('btn-zin').addEventListener('click', () => app.zoom(0.7));
  $('btn-zout').addEventListener('click', () => app.zoom(1.45));
  $('btn-labels').addEventListener('click', () => { app.setLabels(!app.labelsOn); syncRail(); });
  $('btn-lens').addEventListener('click', () => {
    app.setLens(!app.lensOn);
    syncRail();
    toast(app.lensOn ? 'Accuracy lens on: everything is coloured by its source.' : 'Accuracy lens off.');
  });
  $('btn-full').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { toast('Full screen isn’t available here.'); }
  });
  $('btn-postcard').addEventListener('click', () => {
    const url = app.postcard();
    const body = $('postcard-body');
    const now = app.atmo;
    body.innerHTML = `<button class="icon-btn dialog-close" data-close aria-label="Close" data-icon="close"></button>
      <span class="eyebrow">A postcard from Hogwarts</span>
      <h2>${esc(phaseName(now.elevation, now.hour).name)}, ${esc(WEATHER.find((w) => w.id === now.weather).label.toLowerCase())}</h2>
      <img class="postcard-img" src="${url}" alt="The current view of Hogwarts">
      <p style="color:var(--muted);font-size:13.5px;margin:10px 0 0">Right-click or long-press the picture to save it.</p>`;
    hydrateIcons(body);
    $('postcard').showModal();
  });
  for (const id of ['postcard', 'about']) {
    $(id).addEventListener('click', (e) => { if (e.target === $(id) || e.target.closest('[data-close]')) $(id).close(); });
  }

  // Lens legend.
  $('legend-rows').innerHTML = TIERS.slice(0, 4).map((t, i) => `<button class="legend-row" data-lens="${i}" aria-pressed="false"><i style="background:${i === 3 ? `repeating-linear-gradient(135deg, ${PROV_COLORS[3]} 0 4px, #a9a79f 4px 6px)` : PROV_COLORS[i]}"></i><span>${esc(t.label)}</span><small>${esc(t.note)}</small></button>`).join('')
    + `<p style="margin:10px 8px 0;font-size:12.5px;color:var(--muted)">${esc(TIERS[4].label)}: ${esc(TIERS[4].note)}</p>`;
  $('legend-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lens]');
    if (!b) return;
    const i = parseInt(b.dataset.lens, 10);
    const on = b.getAttribute('aria-pressed') !== 'true';
    $('legend-rows').querySelectorAll('[data-lens]').forEach((x) => x.setAttribute('aria-pressed', String(on && x === b)));
    app.setLensFocus(on ? i : -1);
  });

  // ── Modes ───────────────────────────────────────────────────────────────
  const hints = {
    explore: 'Drag to orbit · right-drag or Shift-drag to pan · scroll to zoom · double-click to fly there',
    walk: 'Eye level, 1.7 m · drag to look · W A S D or arrows to walk · Shift to hurry',
    fly: 'Drag to look · W A S D to fly · Q / E to sink and climb · scroll for speed',
    map: 'Drag to pan · scroll or pinch to zoom · select a name to read about it',
  };
  function setModeUI(m) {
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    document.body.classList.toggle('mode-map', m === 'map');
    $('hint-text').textContent = hints[m];
    $('scale').hidden = m !== 'explore';
    const touch = matchMedia('(pointer: coarse)').matches;
    $('joystick').hidden = !(touch && (m === 'walk' || m === 'fly'));
    $('updown').hidden = !(touch && m === 'fly');
    $('mapview').hidden = m !== 'map';
    $('floorbar').hidden = m !== 'map';
    $('floorpanel').hidden = m !== 'map' || !state.floor;
    // The guided flight is offered from Explore; elsewhere it would cover the joystick.
    $('tour-card').hidden = m !== 'explore' || state.tourOn || state.tourDismissed;
    syncRail();
  }
  function setMode(m) {
    if (state.tourOn && m !== 'explore') stopTour();
    app.setMode(m);
    setModeUI(m);
    if (m === 'map') app.map.open();
  }
  document.querySelector('.modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });

  // ── Map floors ──────────────────────────────────────────────────────────
  const floorbar = $('floorbar');
  floorbar.innerHTML = `<div class="fl-label">Floor</div><button class="fl" data-floor="" aria-pressed="true" title="The grounds">·</button>${[...FLOORS].reverse().map((f) => `<button class="fl" data-floor="${f.id}" aria-pressed="false" title="${esc(f.label)}">${f.short}</button>`).join('')}`;
  floorbar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-floor]');
    if (!b) return;
    state.floor = b.dataset.floor || null;
    floorbar.querySelectorAll('[data-floor]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    app.map.setFloor(state.floor);
    renderFloor();
  });
  function renderFloor() {
    const panel = $('floorpanel');
    if (!state.floor) { panel.hidden = true; return; }
    const f = FLOORS.find((x) => x.id === state.floor);
    const rooms = ROOMS.filter((r) => r.floor === state.floor);
    panel.hidden = false;
    panel.innerHTML = `<span class="eyebrow">Inside the castle</span><h3>${esc(f.label)}</h3>
      <p>The floor comes from the books; where each room sits inside the plan is our placement unless its marker has a solid ring.</p>
      ${rooms.length ? rooms.map((r, i) => `<div class="room"><span class="tier ${r.tier}">${i + 1}</span><h4>${esc(r.name)}</h4><p>${esc(r.note)}</p><cite>${esc(r.cite.split(/[;,]/).map((c) => citeTitle(c.trim())).join(' · '))}</cite></div>`).join('')
        : '<div class="room"><span class="tier interpreted">–</span><h4>Nothing named</h4><p>The novels name no room on this floor.</p></div>'}
      ${state.floor === 'g' || state.floor === '4' ? `<div class="section-title"><h3>Never pinned to a floor</h3></div>${UNPLACED.map((u) => `<div class="room"><span class="tier interpreted">?</span><h4>${esc(u.name)}</h4><cite>${esc(citeTitle(u.cite))}</cite></div>`).join('')}` : ''}`;
  }

  // ── Guided flight ───────────────────────────────────────────────────────
  $('tour-start').addEventListener('click', startTour);
  $('tour-dismiss').addEventListener('click', () => { state.tourDismissed = true; $('tour-card').hidden = true; });
  function startTour() {
    if (app.mode !== 'explore') setMode('explore');
    state.tourOn = true;
    state.tourPaused = false;
    state.tourIndex = 0;
    $('tour-card').hidden = true;
    closeCard();
    openGuide(false);
    goStop(0);
  }
  function stopTour() {
    state.tourOn = false;
    $('tour-live').hidden = true;
    $('tour-card').hidden = state.tourDismissed || app.mode !== 'explore';
    app.highlight(null);
  }
  function goStop(i) {
    state.tourIndex = (i + TOUR.length) % TOUR.length;
    const stop = TOUR[state.tourIndex];
    const p = PLACES.find((x) => x.id === stop.id);
    state.dwell = 0;
    app.flyToPlace(p.id, { tour: true });
    app.highlight(p.id);
    const live = $('tour-live');
    live.hidden = false;
    live.innerHTML = `<div class="eyebrow"><span>The guided flight · ${state.tourIndex + 1} of ${TOUR.length}</span><button class="icon-btn" id="tour-x" aria-label="End the guided flight" data-icon="close" style="width:28px;height:28px;margin:-8px -6px 0 0"></button></div>
      <h3>${esc(p.name)}</h3><p>${esc(p.tagline)}. ${esc(p.summary.split('. ')[0])}.</p>
      <div class="row"><button class="icon-btn" id="tour-prev" aria-label="Previous stop" data-icon="prev"></button>
        <button class="icon-btn" id="tour-pause" aria-label="${state.tourPaused ? 'Continue' : 'Pause'}" data-icon="${state.tourPaused ? 'play' : 'pause'}"></button>
        <button class="icon-btn" id="tour-next" aria-label="Next stop" data-icon="next"></button>
        <div class="bar"><i id="tour-bar"></i></div>
        <button class="btn" id="tour-more">Read more</button></div>`;
    hydrateIcons(live);
    live.querySelector('#tour-x').onclick = stopTour;
    live.querySelector('#tour-prev').onclick = () => goStop(state.tourIndex - 1);
    live.querySelector('#tour-next').onclick = () => goStop(state.tourIndex + 1);
    live.querySelector('#tour-pause').onclick = () => { state.tourPaused = !state.tourPaused; goStopRefresh(); };
    live.querySelector('#tour-more').onclick = () => { state.tourPaused = true; goStopRefresh(); select(p.id); };
  }
  function goStopRefresh() {
    const b = $('tour-pause');
    if (!b) return;
    b.innerHTML = state.tourPaused ? ICONS.play : ICONS.pause;
    b.setAttribute('aria-label', state.tourPaused ? 'Continue' : 'Pause');
  }

  // ── About ───────────────────────────────────────────────────────────────
  $('btn-info').addEventListener('click', () => {
    const body = $('about-body');
    body.innerHTML = `<button class="icon-btn dialog-close" data-close aria-label="Close" data-icon="close"></button>
      <span class="eyebrow">About the atlas</span>
      <h2>Hogwarts, as the sources describe it</h2>
      <p>This atlas lays out the castle and its grounds from the most direct evidence there is: the annotated sketch J.K. Rowling drew for her editor (now in the British Library), and what the seven novels actually say. Where the sources are silent, the atlas has to invent, and says so.</p>
      <h3>Reading the evidence</h3>
      <ul>${TIERS.map((t) => `<li><span class="tier ${t.id}" style="vertical-align:1px">${esc(t.short)}</span> <strong>${esc(t.label)}.</strong> ${esc(t.note)}</li>`).join('')}</ul>
      <p>Turn on the <strong>accuracy lens</strong> (the magnifier on the right) to colour the whole world by its source. The <strong>Map</strong> view has a floor switch that shows every room the books place on each floor.</p>
      <h3>What comes from Rowling’s sketch</h3>
      <p>North is at the top of her sketch. The castle stands on a high cliff above the lake. Its front entrance faces north, where a tree-lined drive leads to the Hogsmeade road. The station is on the far side of the lake, and carriages go round the water. The Quidditch stadium is north-west, with changing rooms either side. Hagrid’s cabin and the pumpkin patch are at the edge of the forest, north-east. The Whomping Willow stands out on the lawns. The vegetable garden and the greenhouses are east of the castle by the water.</p>
      <h3>Scale</h3>
      <p>One unit is one metre. The Quidditch pitch uses the rulebook’s 500 × 180 feet and its hoops are 50 feet high. The rest of the plan is scaled from the sketch at that ratio, so distances are consistent but not canonical.</p>
      <h3>Controls</h3>
      <div class="keys"><span><kbd>Drag</kbd></span><span>Orbit, or look around when walking or flying</span>
        <span><kbd>Scroll</kbd></span><span>Zoom toward the cursor</span>
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Walk or fly</span>
        <span><kbd>Q</kbd><kbd>E</kbd></span><span>Sink and climb in flight</span>
        <span><kbd>Esc</kbd></span><span>Close a card or end the tour</span></div>
      <h3>Sources & credits</h3>
      <ul><li><a href="https://artsandculture.google.com/asset/sketch-of-hogwarts-by-j-k-rowling/6QEJy8kFibqARg" target="_blank" rel="noopener">Sketch of Hogwarts by J.K. Rowling · British Library</a></li>
        <li><a href="https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/hogwarts-grounds/" target="_blank" rel="noopener">Hogwarts grounds · Harry Potter Lexicon</a></li>
        <li><a href="https://www.harrypotter.com/fact-file/locations/hogwarts" target="_blank" rel="noopener">Hogwarts · Wizarding World</a></li></ul>
      <p style="color:var(--muted);font-size:13.5px">An unofficial fan atlas. Every description is written in our own words; chapter references follow the Lexicon’s abbreviations (PS7 is <em>Philosopher’s Stone</em>, chapter 7).</p>`;
    hydrateIcons(body);
    $('about').showModal();
  });

  // ── Touch joystick ──────────────────────────────────────────────────────
  {
    const js = $('joystick'), knob = $('knob');
    let id = null;
    const move = (e) => {
      const r = js.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
      app.rig.moveInput.set(x, -y);
    };
    js.addEventListener('pointerdown', (e) => { id = e.pointerId; js.setPointerCapture(id); move(e); e.stopPropagation(); });
    js.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = () => { id = null; knob.style.transform = ''; app.rig.moveInput.set(0, 0); };
    js.addEventListener('pointerup', end);
    js.addEventListener('pointercancel', end);
    const hold = (btn, v) => {
      btn.addEventListener('pointerdown', () => { app.rig.vertical = v; });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => { app.rig.vertical = 0; });
    };
    hold($('btn-up'), 1);
    hold($('btn-down'), -1);
  }

  $('compass').addEventListener('click', () => app.faceNorth());

  // ── Per-frame ───────────────────────────────────────────────────────────
  let atmoKey = '';
  function frame(dt) {
    const a = app.atmo;
    const ph = phaseName(a.elevation, a.hour);
    const key = `${ph.name}|${a.weather}|${timeText(a.hour)}`;
    if (key !== atmoKey) {
      atmoKey = key;
      $('atmo-name').textContent = ph.name;
      $('atmo-sub').textContent = `${WEATHER.find((w) => w.id === a.weather).label} · ${timeText(a.hour)}`;
      const g = $('atmo-glyph');
      if (g.dataset.icon !== ph.icon) { g.dataset.icon = ph.icon; g.innerHTML = ICONS[ph.icon]; }
      if (!atmoPanel.hidden) { $('hour-out').textContent = timeText(a.targetHour); if (app.animate) $('hour').value = a.hour; }
    }
    $('compass-rose').style.transform = `rotate(${(app.rig.heading() * 180) / Math.PI}deg)`;
    if (app.mode === 'explore') {
      const mpp = app.metresPerPixel();
      const nice = [5, 10, 20, 50, 100, 200, 500, 1000];
      const m = nice.find((n) => n / mpp > 70) || 1000;
      $('scale-bar').style.width = `${Math.round(m / mpp)}px`;
      $('scale-text').textContent = m >= 1000 ? `${m / 1000} km` : `${m} m`;
    }
    if (state.tourOn && !state.tourPaused && !app.isFlying()) {
      const stop = TOUR[state.tourIndex];
      state.dwell += dt;
      const bar = $('tour-bar');
      if (bar) bar.style.width = `${Math.min(100, (state.dwell / stop.dwell) * 100)}%`;
      if (state.dwell > stop.dwell) {
        if (state.tourIndex === TOUR.length - 1) { stopTour(); toast('Journey complete. The grounds are yours to explore.'); app.overview(); }
        else goStop(state.tourIndex + 1);
      }
    }
  }

  renderList();
  setModeUI('explore');
  syncRail();
  return { frame, select, setModeUI, toast, stopTour, get touring() { return state.tourOn; }, syncRail };
}
