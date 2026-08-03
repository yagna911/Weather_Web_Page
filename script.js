/* =========================================================
   STATION — weather dashboard logic
   Data source: Open-Meteo (no API key required)
   ========================================================= */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const els = {
  form: document.getElementById('searchForm'),
  input: document.getElementById('searchInput'),
  locateBtn: document.getElementById('locateBtn'),
  status: document.getElementById('statusLine'),
  dashboard: document.getElementById('dashboard'),

  locationName: document.getElementById('locationName'),
  locationSub: document.getElementById('locationSub'),
  clockTime: document.getElementById('clockTime'),

  heroIcon: document.getElementById('heroIcon'),
  heroTemp: document.getElementById('heroTemp'),
  heroDesc: document.getElementById('heroDesc'),
  heroFeels: document.getElementById('heroFeels'),
  heroHigh: document.getElementById('heroHigh'),
  heroLow: document.getElementById('heroLow'),

  humidityValue: document.getElementById('humidityValue'),
  humidityFill: document.getElementById('humidityFill'),
  windValue: document.getElementById('windValue'),
  compassNeedle: document.getElementById('compassNeedle'),
  pressureValue: document.getElementById('pressureValue'),
  sparklinePath: document.getElementById('sparklinePath'),
  uvValue: document.getElementById('uvValue'),
  uvScale: document.getElementById('uvScale'),

  hourlyTrack: document.getElementById('hourlyTrack'),
  forecastGrid: document.getElementById('forecastGrid'),
};

let clockInterval = null;
let utcOffsetSeconds = 0;

/* ---------- WMO weather code → { label, group } ---------- */

const WEATHER_CODES = {
  0: { label: 'Clear sky', group: 'clear' },
  1: { label: 'Mainly clear', group: 'clear' },
  2: { label: 'Partly cloudy', group: 'cloud' },
  3: { label: 'Overcast', group: 'cloud' },
  45: { label: 'Fog', group: 'fog' },
  48: { label: 'Rime fog', group: 'fog' },
  51: { label: 'Light drizzle', group: 'rain' },
  53: { label: 'Drizzle', group: 'rain' },
  55: { label: 'Dense drizzle', group: 'rain' },
  56: { label: 'Freezing drizzle', group: 'rain' },
  57: { label: 'Freezing drizzle', group: 'rain' },
  61: { label: 'Light rain', group: 'rain' },
  63: { label: 'Rain', group: 'rain' },
  65: { label: 'Heavy rain', group: 'rain' },
  66: { label: 'Freezing rain', group: 'rain' },
  67: { label: 'Freezing rain', group: 'rain' },
  71: { label: 'Light snow', group: 'snow' },
  73: { label: 'Snow', group: 'snow' },
  75: { label: 'Heavy snow', group: 'snow' },
  77: { label: 'Snow grains', group: 'snow' },
  80: { label: 'Rain showers', group: 'rain' },
  81: { label: 'Rain showers', group: 'rain' },
  82: { label: 'Violent showers', group: 'rain' },
  85: { label: 'Snow showers', group: 'snow' },
  86: { label: 'Snow showers', group: 'snow' },
  95: { label: 'Thunderstorm', group: 'storm' },
  96: { label: 'Thunderstorm, hail', group: 'storm' },
  99: { label: 'Thunderstorm, hail', group: 'storm' },
};

function codeInfo(code) {
  return WEATHER_CODES[code] || { label: 'Unknown', group: 'cloud' };
}

/* ---------- Inline SVG icon set (currentColor-driven) ---------- */

function iconSvg(group) {
  const icons = {
    clear: `<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent-amber)" stroke-width="2.2" stroke-linecap="round">
      <circle cx="24" cy="24" r="9"/>
      <path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.5 9.5l4.2 4.2M34.3 34.3l4.2 4.2M9.5 38.5l4.2-4.2M34.3 13.7l4.2-4.2"/>
    </svg>`,
    cloud: `<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent-sky)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 34a8 8 0 01-1-15.9A10 10 0 0133 15a7 7 0 015 12"/>
      <path d="M14 34h20"/>
    </svg>`,
    fog: `<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent-sky)" stroke-width="2.2" stroke-linecap="round">
      <path d="M8 18h32M6 26h36M8 34h32"/>
    </svg>`,
    rain: `<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent-sky)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 28a8 8 0 01-1-15.9A10 10 0 0133 9a7 7 0 015 12"/>
      <path d="M16 34l-2 6M24 34l-2 6M32 34l-2 6"/>
    </svg>`,
    snow: `<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent-frost)" stroke-width="2.2" stroke-linecap="round">
      <path d="M15 26a8 8 0 01-1-15.9A10 10 0 0133 7a7 7 0 015 12" stroke="var(--accent-sky)"/>
      <path d="M24 32v12M18 36l6 4 6-4M18 40l6-4 6 4"/>
    </svg>`,
    storm: `<svg viewBox="0 0 48 48" fill="none" stroke="var(--accent-storm)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 24a8 8 0 01-1-15.9A10 10 0 0133 5a7 7 0 015 12"/>
      <path d="M25 27l-6 9h6l-4 8"/>
    </svg>`,
  };
  return icons[group] || icons.cloud;
}

/* ---------- Status helper ---------- */

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('is-error', isError);
}

/* ---------- Geocoding ---------- */

async function geocode(query) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Geocoding request failed');
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`No location found for "${query}"`);
  }
  const r = data.results[0];
  return {
    name: r.name,
    admin: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
  };
}

async function reverseFromCoords(lat, lon) {
  // Open-Meteo has no reverse geocoder; label generically and let the
  // forecast response's timezone stand in for locale context.
  return { name: 'Current location', admin: '', country: '', lat, lon };
}

/* ---------- Forecast ---------- */

async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
    hourly: 'temperature_2m,weather_code,surface_pressure',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,uv_index_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '6',
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if (!res.ok) throw new Error('Forecast request failed');
  return res.json();
}

/* ---------- Rendering ---------- */

function renderLocation(loc, tz) {
  const sub = [loc.admin, loc.country].filter(Boolean).join(', ') || tz;
  els.locationName.textContent = loc.name;
  els.locationSub.textContent = sub;
}

function startClock(utcOffsetSec) {
  utcOffsetSeconds = utcOffsetSec;
  if (clockInterval) clearInterval(clockInterval);
  const tick = () => {
    const nowUtcMs = Date.now();
    const local = new Date(nowUtcMs + utcOffsetSeconds * 1000);
    const hh = String(local.getUTCHours()).padStart(2, '0');
    const mm = String(local.getUTCMinutes()).padStart(2, '0');
    els.clockTime.textContent = `${hh}:${mm}`;
  };
  tick();
  clockInterval = setInterval(tick, 1000 * 15);
}

function renderHero(current, daily) {
  const info = codeInfo(current.weather_code);
  els.heroIcon.innerHTML = iconSvg(info.group);
  els.heroTemp.textContent = `${Math.round(current.temperature_2m)}°`;
  els.heroDesc.textContent = info.label;
  els.heroFeels.innerHTML = `Feels like <span>${Math.round(current.apparent_temperature)}°</span> · H <span>${Math.round(daily.temperature_2m_max[0])}°</span> L <span>${Math.round(daily.temperature_2m_min[0])}°</span>`;
}

function renderInstruments(current, hourlyPressures) {
  // humidity
  const h = Math.round(current.relative_humidity_2m);
  els.humidityValue.textContent = `${h}%`;
  requestAnimationFrame(() => { els.humidityFill.style.width = `${h}%`; });

  // wind + compass
  els.windValue.textContent = `${Math.round(current.wind_speed_10m)} mph`;
  els.compassNeedle.setAttribute('transform', `rotate(${current.wind_direction_10m} 40 40)`);

  // pressure + sparkline (last ~24 readings)
  els.pressureValue.textContent = `${Math.round(current.surface_pressure)} hPa`;
  drawSparkline(hourlyPressures.slice(0, 24));

  // uv (from daily max, closest thing to "now" without a dedicated current field)
  const uv = window.__uvToday;
  if (uv !== undefined) {
    els.uvValue.textContent = uv.toFixed(1);
    els.uvScale.textContent = uvLabel(uv);
  }
}

function uvLabel(uv) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

function drawSparkline(values) {
  if (!values.length) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 120, h = 30, pad = 3;
  const step = (w - pad * 2) / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  els.sparklinePath.setAttribute('points', points);
}

function renderHourly(hourly, currentTime) {
  els.hourlyTrack.innerHTML = '';
  const nowIdx = hourly.time.findIndex(t => t === currentTime);
  const startIdx = nowIdx === -1 ? 0 : nowIdx;
  const slice = hourly.time.slice(startIdx, startIdx + 24);

  slice.forEach((iso, i) => {
    const idx = startIdx + i;
    const date = new Date(iso);
    const hourLabel = i === 0 ? 'Now' : formatHour(date);
    const info = codeInfo(hourly.weather_code[idx]);
    const temp = Math.round(hourly.temperature_2m[idx]);

    const card = document.createElement('div');
    card.className = 'hour-card' + (i === 0 ? ' is-now' : '');
    card.innerHTML = `
      <span class="hour-time">${hourLabel}</span>
      <span class="hour-icon">${iconSvg(info.group)}</span>
      <span class="hour-temp">${temp}°</span>
    `;
    els.hourlyTrack.appendChild(card);
  });
}

function formatHour(date) {
  let h = date.getUTCHours() % 12;
  if (h === 0) h = 12;
  const ampm = date.getUTCHours() < 12 ? 'AM' : 'PM';
  return `${h}${ampm}`;
}

function renderForecast(daily) {
  els.forecastGrid.innerHTML = '';
  daily.time.forEach((iso, i) => {
    const date = new Date(iso);
    const dayName = i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const info = codeInfo(daily.weather_code[i]);
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `
      <span class="day-name">${dayName.toUpperCase()}</span>
      <span class="day-icon">${iconSvg(info.group)}</span>
      <span class="day-temps">
        <span class="day-high">${Math.round(daily.temperature_2m_max[i])}°</span>
        <span class="day-low">${Math.round(daily.temperature_2m_min[i])}°</span>
      </span>
    `;
    els.forecastGrid.appendChild(card);
  });
}

/* ---------- Orchestration ---------- */

async function loadWeatherFor(loc) {
  setStatus('Fetching forecast…');
  const data = await fetchForecast(loc.lat, loc.lon);

  window.__uvToday = data.daily.uv_index_max ? data.daily.uv_index_max[0] : undefined;

  renderLocation(loc, data.timezone);
  startClock(data.utc_offset_seconds);
  renderHero(data.current, data.daily);
  renderInstruments(data.current, data.hourly.surface_pressure);
  renderHourly(data.hourly, data.current.time);
  renderForecast(data.daily);

  els.dashboard.hidden = false;
  setStatus('');
}

async function handleSearch(query) {
  try {
    setStatus(`Locating "${query}"…`);
    const loc = await geocode(query);
    await loadWeatherFor(loc);
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', true);
  }
}

async function handleGeolocate() {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported by this browser.', true);
    return;
  }
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const loc = await reverseFromCoords(pos.coords.latitude, pos.coords.longitude);
        await loadWeatherFor(loc);
      } catch (err) {
        setStatus(err.message || 'Could not load weather for your location.', true);
      }
    },
    () => setStatus('Location access was denied.', true)
  );
}

/* ---------- Events ---------- */

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (q) handleSearch(q);
});

els.locateBtn.addEventListener('click', handleGeolocate);

/* ---------- Initial load ---------- */

handleSearch('New York');
