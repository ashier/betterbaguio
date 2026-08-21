(function () {
  'use strict';

  var hero = document.querySelector('[data-weather-hero]');
  var summary = document.querySelector('[data-weather-summary]');
  if (!hero || !summary) return;

  var CACHE_KEY = 'betterbaguio_weather_v1';
  var CACHE_TTL = 10 * 60 * 1000;
  var BAGUIO = { latitude: 16.4041, longitude: 120.6014 };
  var API = 'https://api.open-meteo.com/v1/forecast';
  var temperature = summary.querySelector('[data-weather-temperature]');
  var condition = summary.querySelector('[data-weather-condition]');
  var symbol = summary.querySelector('[data-weather-symbol]');
  var details = summary.querySelector('[data-weather-details]');
  var controls = document.querySelector('[data-weather-controls]');
  var previewButtons = controls ? controls.querySelectorAll('[data-weather-preview-mode]') : [];
  var requestVersion = 0;

  var CONDITIONS = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Dense drizzle',
    56: 'Freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    66: 'Freezing rain',
    67: 'Heavy freezing rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light rain showers',
    81: 'Rain showers',
    82: 'Heavy rain showers',
    85: 'Light snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Severe thunderstorm with hail'
  };

  function visualState(code) {
    if (code === 0 || code === 1) return 'clear';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 99)) return 'rain';
    return 'cloudy';
  }

  function weatherSymbol(code, isDay) {
    var state = visualState(code);
    if (state === 'clear') return isDay ? '☀' : '◐';
    if (state === 'fog') return '≋';
    if (state === 'rain') return code >= 95 ? 'ϟ' : '☂';
    return '☁';
  }

  function formatPhtTime(iso) {
    if (!iso || iso.indexOf('T') === -1) return '';
    var parts = iso.split('T')[1].split(':');
    var hour = Number(parts[0]);
    var minute = parts[1];
    var suffix = hour >= 12 ? 'PM' : 'AM';
    var displayHour = hour % 12 || 12;
    return displayHour + ':' + minute + ' ' + suffix + ' PHT';
  }

  function rounded(value) {
    return typeof value === 'number' && isFinite(value) ? Math.round(value) : null;
  }

  function setState(state, isDay) {
    hero.setAttribute('data-weather-state', state);
    hero.classList.toggle('is-weather-night', !isDay);
  }

  function render(data, freshness) {
    var current = data.current || {};
    var daily = data.daily || {};
    var code = Number(current.weather_code);
    var isDay = current.is_day !== 0;
    var temp = rounded(current.temperature_2m);
    var feels = rounded(current.apparent_temperature);
    var high = rounded(daily.temperature_2m_max && daily.temperature_2m_max[0]);
    var low = rounded(daily.temperature_2m_min && daily.temperature_2m_min[0]);
    var humidity = rounded(current.relative_humidity_2m);
    var state = visualState(code);
    var pieces = [];

    setState(state, isDay);
    symbol.textContent = weatherSymbol(code, isDay);
    temperature.textContent = temp === null ? 'Baguio weather' : temp + '°C';
    condition.textContent = CONDITIONS[code] || 'Current conditions';

    if (high !== null && low !== null) pieces.push('H ' + high + '° · L ' + low + '°');
    if (feels !== null) pieces.push('Feels ' + feels + '°');
    if (humidity !== null) pieces.push(humidity + '% humidity');

    var updated = formatPhtTime(current.time);
    var sourceLabel = freshness === 'stale' ? 'Recently reported' : 'As of';
    if (freshness === 'preview') sourceLabel = 'Preview';
    details.innerHTML = pieces.join('<span aria-hidden="true"> · </span>') +
      (pieces.length ? '<br>' : '') +
      '<small>' + sourceLabel + (updated ? ' ' + updated : '') +
      (freshness === 'preview' ? '' : ' · <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo</a>') + '</small>';
  }

  function renderUnavailable() {
    setState('loading', true);
    symbol.textContent = '◌';
    temperature.textContent = 'Weather unavailable';
    condition.textContent = 'Live Baguio conditions could not be loaded.';
    details.innerHTML = '<small><a href="https://www.pagasa.dost.gov.ph/" target="_blank" rel="noopener">Check PAGASA</a></small>';
  }

  function readCache(allowExpired) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || !entry.data || !entry.savedAt) return null;
      if (!allowExpired && Date.now() - entry.savedAt > CACHE_TTL) return null;
      return entry.data;
    } catch (error) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: data }));
    } catch (error) {
      /* Weather still works when storage is unavailable. */
    }
  }

  function previewData(state) {
    var codes = { clear: 0, cloudy: 3, rain: 63, fog: 45 };
    if (!(state in codes)) return null;
    var now = new Date();
    var localTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
    return {
      current: { temperature_2m: 18, apparent_temperature: 18, relative_humidity_2m: 88, weather_code: codes[state], is_day: 1, time: '2026-01-01T' + localTime },
      daily: { temperature_2m_max: [21], temperature_2m_min: [15] }
    };
  }

  function setActiveControl(mode) {
    Array.prototype.forEach.call(previewButtons, function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-weather-preview-mode') === mode ? 'true' : 'false');
    });
  }

  async function fetchWeather() {
    var params = new URLSearchParams({
      latitude: BAGUIO.latitude,
      longitude: BAGUIO.longitude,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,precipitation,cloud_cover,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'Asia/Manila',
      forecast_days: 1
    });
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch(API + '?' + params.toString(), { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Weather request failed: ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function showLive() {
    var version = ++requestVersion;
    setActiveControl('live');
    var fresh = readCache(false);
    if (fresh) render(fresh, 'fresh');

    try {
      var live = await fetchWeather();
      if (version !== requestVersion) return;
      writeCache(live);
      render(live, 'fresh');
    } catch (error) {
      if (version !== requestVersion || fresh) return;
      var stale = readCache(true);
      if (stale) render(stale, 'stale');
      else renderUnavailable();
    }
  }

  function showPreview(state) {
    var sample = previewData(state);
    if (!sample) return;
    requestVersion += 1;
    setActiveControl(state);
    render(sample, 'preview');
  }

  function start() {
    var preview = null;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      preview = new URLSearchParams(location.search).get('weather-preview');
    }
    if (preview === 'unavailable') {
      renderUnavailable();
      return;
    }
    var sample = previewData(preview);
    if (sample) {
      showPreview(preview);
      return;
    }

    showLive();
  }

  Array.prototype.forEach.call(previewButtons, function (button) {
    button.addEventListener('click', function () {
      var mode = button.getAttribute('data-weather-preview-mode');
      if (mode === 'live') showLive();
      else showPreview(mode);
    });
  });

  start();
})();
