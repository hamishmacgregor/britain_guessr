(() => {
  'use strict';

  const ROUNDS = 10;
  const UK_BOUNDS = L.latLngBounds([49.7, -8.8], [61.0, 2.0]);

  const styles = getComputedStyle(document.documentElement);
  const css = (name) => styles.getPropertyValue(name).trim();

  const state = {
    places: [],
    queue: [],
    roundIndex: 0,
    totalKm: 0,
    breakdown: [],
    awaitingGuess: false,
    guessLayer: null,
    answerLayer: null,
    lineLayer: null,
  };

  const el = {
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen'),
    end: document.getElementById('end-screen'),
    startBtn: document.getElementById('start-btn'),
    nextBtn: document.getElementById('next-btn'),
    restartBtn: document.getElementById('restart-btn'),
    roundCounter: document.getElementById('round-counter'),
    totalSoFar: document.getElementById('total-so-far'),
    placeName: document.getElementById('place-name'),
    hint: document.getElementById('hint'),
    resultReadout: document.getElementById('result-readout'),
    distanceReadout: document.getElementById('distance-readout'),
    breakdown: document.getElementById('breakdown'),
    finalTotal: document.getElementById('final-total'),
  };

  let map;

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatKm(km) {
    if (km < 10) return km.toFixed(1) + ' km';
    return Math.round(km).toLocaleString() + ' km';
  }

  function divIcon(className) {
    return L.divIcon({
      className: '',
      html: `<div class="${className}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  async function initMap() {
    map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
      maxBounds: UK_BOUNDS.pad(0.3),
      maxBoundsViscosity: 0.9,
      minZoom: 5,
      maxZoom: 9,
    });
    map.fitBounds(UK_BOUNDS);

    const [outline, rivers] = await Promise.all([
      fetch('data/uk_outline.geojson').then((r) => r.json()),
      fetch('data/uk_rivers.geojson').then((r) => r.json()),
    ]);

    L.geoJSON(outline, {
      style: {
        color: css('--land-stroke'),
        weight: 1,
        fillColor: css('--land'),
        fillOpacity: 1,
      },
      interactive: false,
    }).addTo(map);

    L.geoJSON(rivers, {
      style: {
        color: css('--river'),
        weight: 1.2,
        opacity: 0.85,
      },
      interactive: false,
    }).addTo(map);

    map.on('click', onMapClick);
  }

  function clearRoundLayers() {
    for (const key of ['guessLayer', 'answerLayer', 'lineLayer']) {
      if (state[key]) {
        map.removeLayer(state[key]);
        state[key] = null;
      }
    }
  }

  function onMapClick(e) {
    if (!state.awaitingGuess) return;
    state.awaitingGuess = false;

    const guess = { lat: e.latlng.lat, lng: e.latlng.lng };
    const truth = state.queue[state.roundIndex];
    const km = haversineKm(guess, truth);

    state.totalKm += km;
    state.breakdown.push({ name: truth.name, km });

    state.guessLayer = L.marker([guess.lat, guess.lng], {
      icon: divIcon('guess-marker'),
      interactive: false,
    }).addTo(map);
    state.answerLayer = L.marker([truth.lat, truth.lng], {
      icon: divIcon('answer-marker'),
      interactive: false,
    })
      .bindTooltip(truth.name, { permanent: true, direction: 'top', offset: [0, -8] })
      .addTo(map);
    state.lineLayer = L.polyline(
      [
        [guess.lat, guess.lng],
        [truth.lat, truth.lng],
      ],
      { color: css('--accent'), weight: 2, dashArray: '4 4', interactive: false }
    ).addTo(map);

    const padded = L.latLngBounds([guess.lat, guess.lng], [truth.lat, truth.lng]).pad(0.4);
    map.fitBounds(padded, { animate: true, maxZoom: 9 });

    el.distanceReadout.textContent = formatKm(km);
    el.resultReadout.classList.remove('hidden');
    el.hint.classList.add('hidden');
    el.totalSoFar.textContent = formatKm(state.totalKm);

    const isLast = state.roundIndex >= state.queue.length - 1;
    el.nextBtn.textContent = isLast ? 'See results' : 'Next';
    el.nextBtn.classList.remove('hidden');
  }

  function startRound() {
    clearRoundLayers();
    el.resultReadout.classList.add('hidden');
    el.nextBtn.classList.add('hidden');
    el.hint.classList.remove('hidden');

    const place = state.queue[state.roundIndex];
    el.placeName.textContent = place.name;
    el.roundCounter.textContent = `${state.roundIndex + 1} / ${state.queue.length}`;
    el.totalSoFar.textContent = formatKm(state.totalKm);

    map.fitBounds(UK_BOUNDS, { animate: true });
    state.awaitingGuess = true;
  }

  function nextRound() {
    state.roundIndex += 1;
    if (state.roundIndex >= state.queue.length) {
      showEndScreen();
    } else {
      startRound();
    }
  }

  function showEndScreen() {
    el.game.classList.add('hidden');
    el.end.classList.remove('hidden');
    el.finalTotal.textContent = Math.round(state.totalKm).toLocaleString();
    el.breakdown.innerHTML = '';
    for (const row of state.breakdown) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="place"></span><span class="dist"></span>`;
      li.querySelector('.place').textContent = row.name;
      li.querySelector('.dist').textContent = formatKm(row.km);
      el.breakdown.appendChild(li);
    }
  }

  function startGame() {
    state.queue = shuffle(state.places).slice(0, ROUNDS);
    state.roundIndex = 0;
    state.totalKm = 0;
    state.breakdown = [];
    clearRoundLayers();

    el.start.classList.add('hidden');
    el.end.classList.add('hidden');
    el.game.classList.remove('hidden');

    // Leaflet needs a size invalidation after the container becomes visible.
    setTimeout(() => map.invalidateSize(), 0);

    startRound();
  }

  async function boot() {
    const placesRes = await fetch('data/places.json');
    state.places = await placesRes.json();
    await initMap();

    el.startBtn.addEventListener('click', startGame);
    el.nextBtn.addEventListener('click', nextRound);
    el.restartBtn.addEventListener('click', startGame);
  }

  boot().catch((err) => {
    console.error(err);
    document.body.innerHTML =
      '<div style="padding:2rem;font-family:sans-serif">Failed to load game data.</div>';
  });
})();
