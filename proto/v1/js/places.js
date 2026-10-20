(function (CE) {
  'use strict';
  // Google Places (New)：用店名搜尋候選、取店家資料。只在使用者打字搜尋與選中候選時呼叫（計費考量）。
  // 美食地圖由 map.js 以 libraries=places 載入；沒有地圖的頁面（工具頁）用 CE.places.load(key)。
  // 失敗一律 reject，由呼叫端顯示訊息。
  const FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'nationalPhoneNumber', 'regularOpeningHours', 'googleMapsURI'];
  const E = CE.storeEdit;
  let token = null;

  const lib = () => (globalThis.google && google.maps && google.maps.places) || null;

  function available() {
    const p = lib();
    return !!(p && p.AutocompleteSuggestion && p.Place);
  }

  function need() {
    if (!available()) throw new Error('Google Places 未載入');
    return lib();
  }

  // Google 的 OpeningHours 物件 → 純資料 { periods: [{ open, close? }] }，再交給 periodsToHours
  function hoursOf(oh) {
    if (!oh || !oh.periods) return null;
    const pt = p => (p ? { day: p.day, hour: p.hour, minute: p.minute } : undefined);
    return E.periodsToHours({ periods: oh.periods.map(p => ({ open: pt(p.open), close: pt(p.close) })) });
  }

  function info(place) {
    const loc = place.location;
    return {
      placeId: place.id || '',
      name: place.displayName || '',
      address: E.cleanAddress(place.formattedAddress),
      lat: loc ? loc.lat() : null,
      lng: loc ? loc.lng() : null,
      phone: E.cleanPhone(place.nationalPhoneNumber),
      hours: hoursOf(place.regularOpeningHours),
      googleMapsUrl: E.cleanMapsUrl(place.googleMapsURI),
    };
  }

  // 回傳 Suggestion[]：{ placeId, main, secondary, raw }
  async function suggest(text, center) {
    const P = need();
    if (!token) token = new P.AutocompleteSessionToken();
    const { suggestions } = await P.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: text, sessionToken: token, locationBias: { center, radius: 2000 }, language: 'zh-TW', region: 'tw',
    });
    return suggestions.filter(s => s.placePrediction).map(s => {
      const p = s.placePrediction;
      return { placeId: p.placeId, main: p.mainText ? p.mainText.text : p.text.text, secondary: p.secondaryText ? p.secondaryText.text : '', raw: p };
    });
  }

  // 選中候選：取店家資料，並結束這次搜尋的 session（Autocomplete 不另計費）
  async function details(s) {
    need();
    const place = s.raw.toPlace();
    try {
      await place.fetchFields({ fields: FIELDS });
    } finally {
      token = null;
    }
    return info(place);
  }

  // 工具頁用：直接以文字搜尋，取第一筆；查無結果回傳 null
  async function searchText(query, center, radius) {
    const P = need();
    const { places } = await P.Place.searchByText({
      textQuery: query, fields: FIELDS, locationBias: { center, radius }, language: 'zh-TW', region: 'tw', maxResultCount: 1,
    });
    return places && places.length ? info(places[0]) : null;
  }

  // 沒有地圖的頁面載入 Maps JS（只要 places）。回傳 Promise<boolean>
  function load(key) {
    if (available()) return Promise.resolve(true);
    return new Promise(resolve => {
      if (!key) { resolve(false); return; }
      window.gm_authFailure = () => resolve(false);
      window.__cePlacesInit = () => resolve(available());
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&callback=__cePlacesInit&libraries=places&language=zh-TW&region=TW';
      s.async = true;
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  CE.places = { FIELDS, available, suggest, details, searchText, load };
})(globalThis.CE = globalThis.CE || {});
