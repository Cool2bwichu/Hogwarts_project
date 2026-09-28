// A small line-icon set, drawn for the atlas (24×24, 1.6 stroke).
const S = (d, extra = '') => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICONS = {
  crest: `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M4 22V11l2-2v-3h2v3h2V8h2V4l1-2 1 2v4h2v1h2V6h2v3l2 2v11"/><path d="M4 22h18"/><path d="M11 22v-4a2 2 0 0 1 4 0v4"/><path d="M7.5 14v2M18.5 14v2M13 11v2"/></svg>`,
  sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  sunset: S('<path d="M4 18h16M7 14a5 5 0 0 1 10 0"/><path d="M12 4v4M5 8l1.6 1.6M19 8l-1.6 1.6"/><path d="M8 21h8"/>'),
  moon: S('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
  cloud: S('<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18Z"/>'),
  mist: S('<path d="M4 9h16M3 13h14M6 17h14M8 5h8"/>'),
  rain: S('<path d="M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14Z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
  snow: S('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M10 5l2 2 2-2M10 19l2-2 2 2"/>'),
  storm: S('<path d="M7 13h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 6 3.5 3.5 0 0 0 7 13Z"/><path d="M12 14l-2 4h4l-2 4"/>'),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
  book: S('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>'),
  home: S('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  minus: S('<path d="M5 12h14"/>'),
  tag: S('<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8" r="1.2"/>'),
  lens: S('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/><path d="M10.5 6.5v8M6.5 10.5h8" stroke-opacity=".55"/>'),
  camera: S('<path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/>'),
  expand: S('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  play: S('<path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" stroke="none"/>'),
  pause: S('<path d="M8 5v14M16 5v14" stroke-width="2.4"/>'),
  next: S('<path d="M6 5.5v13l9-6.5-9-6.5ZM18 5v14"/>'),
  prev: S('<path d="M18 5.5v13l-9-6.5 9-6.5ZM6 5v14"/>'),
  orbit: S('<ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 5v9"/><path d="M9 7.5 12 4l3 3.5"/>'),
  walk: S('<circle cx="13" cy="4.5" r="1.8"/><path d="M11 21l2-6-2.5-3 1-4.5L8 9.5 7 13"/><path d="M11.5 7.5l3 3 3 .5M13 15l3 6"/>'),
  fly: S('<path d="M3 13c4-1 6-5 9-9 1 4 0 7-2 9 3 0 6-1 11-4-2 5-6 8-11 8l-3 3-1-3-3-1 0-3Z"/>'),
  map: S('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/>'),
  sliders: S('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  up: S('<path d="M6 15l6-6 6 6"/>'),
  down: S('<path d="M6 9l6 6 6-6"/>'),
  pin: S('<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z"/><circle cx="12" cy="10" r="2.2"/>'),
  sound: S('<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
};

export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const name = el.getAttribute('data-icon');
    if (ICONS[name] && !el.dataset.hydrated) {
      el.insertAdjacentHTML('afterbegin', ICONS[name]);
      el.dataset.hydrated = '1';
    }
  }
}
