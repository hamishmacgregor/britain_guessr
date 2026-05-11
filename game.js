(() => {
  'use strict';

  const ROUNDS = 10;
  const UK_BOUNDS = L.latLngBounds([49.7, -8.8], [61.0, 2.0]);

  // Cumulative tiers: harder difficulty includes all easier-tier places too.
  const DIFFICULTY_INCLUDES = {
    easy: new Set(['easy']),
    medium: new Set(['easy', 'medium']),
    hard: new Set(['easy', 'medium', 'hard']),
  };

  const styles = getComputedStyle(document.documentElement);
  const css = (name) => styles.getPropertyValue(name).trim();

  const state = {
    places: [],
    queue: [],
    roundIndex: 0,
    totalKm: 0,
    rounds: [],
    awaitingGuess: false,
    difficulty: 'medium',
    // Current round's transient layers (cleared on "Next").
    currentGuessLayer: null,
    currentAnswerLayer: null,
    currentLineLayer: null,
    // Persistent layers from completed rounds.
    pastLayers: [],
    // Optional overlay layers (rivers / motorways).
    riversGeoLayer: null,
    motorwaysGeoLayer: null,
  };

  const el = {
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen'),
    startBtn: document.getElementById('start-btn'),
    nextBtn: document.getElementById('next-btn'),
    viewResultsBtn: document.getElementById('view-results-btn'),
    backMenuBtn: document.getElementById('back-menu-btn'),
    quitBtn: document.getElementById('quit-btn'),
    showRivers: document.getElementById('show-rivers'),
    showMotorways: document.getElementById('show-motorways'),
    roundCounter: document.getElementById('round-counter'),
    totalSoFar: document.getElementById('total-so-far'),
    placeName: document.getElementById('place-name'),
    placePopulation: document.getElementById('place-population'),
    hint: document.getElementById('hint'),
    resultReadout: document.getElementById('result-readout'),
    distanceReadout: document.getElementById('distance-readout'),
    finalTotal: document.getElementById('final-total'),
    promptPlaying: document.getElementById('prompt-playing'),
    promptResults: document.getElementById('prompt-results'),
    difficultyBtns: document.querySelectorAll('.difficulty-btn'),
    resultsOverlay: document.getElementById('results-overlay'),
    resultsList: document.getElementById('results-list'),
    resultsTotalKm: document.getElementById('results-total-km'),
    overlayViewMapBtn: document.getElementById('overlay-view-map-btn'),
    overlayBackMenuBtn: document.getElementById('overlay-back-menu-btn'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmQuitBtn: document.getElementById('confirm-quit-btn'),
    confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
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

  function formatPopulation(p) {
    if (!p) return '';
    if (p >= 1_000_000) return '~' + (p / 1_000_000).toFixed(p >= 10_000_000 ? 0 : 1) + 'M people';
    if (p >= 100_000) return '~' + Math.round(p / 1000) + 'k people';
    return '~' + p.toLocaleString() + ' people';
  }

  function divIcon(className, size) {
    return L.divIcon({
      className: '',
      html: `<div class="marker-dot ${className}"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  async function initMap() {
    map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
      maxBounds: UK_BOUNDS.pad(0.08),
      maxBoundsViscosity: 1.0,
      minZoom: 5,
      maxZoom: 9,
    });
    map.fitBounds(UK_BOUNDS);

    const [land, borders, rivers, motorways] = await Promise.all([
      fetch('data/uk_land.geojson').then((r) => r.json()),
      fetch('data/uk_borders.geojson').then((r) => r.json()),
      fetch('data/uk_rivers.geojson').then((r) => r.json()),
      fetch('data/uk_motorways.geojson').then((r) => r.json()),
    ]);

    // Land fill — always shown
    L.geoJSON(land, {
      style: {
        color: css('--land-stroke'),
        weight: 0.8,
        fillColor: css('--land'),
        fillOpacity: 1,
      },
      interactive: false,
    }).addTo(map);

    // National borders — always shown
    L.geoJSON(borders, {
      style: (f) => ({
        color: css('--border'),
        weight: f.properties.type === 'international' ? 1 : 0.8,
        dashArray: '4 4',
        opacity: 0.7,
        fill: false,
      }),
      interactive: false,
    }).addTo(map);

    // Rivers — optional overlay
    state.riversGeoLayer = L.geoJSON(rivers, {
      style: {
        color: css('--river'),
        weight: 2,
        opacity: 0.85,
      },
      interactive: false,
    });

    // Motorways — optional overlay, rendered as yellow with thin black outline
    state.motorwaysGeoLayer = L.layerGroup([
      L.geoJSON(motorways, {
        style: { color: '#000', weight: 3.5, opacity: 0.55, fill: false },
        interactive: false,
      }),
      L.geoJSON(motorways, {
        style: { color: css('--motorway'), weight: 2, opacity: 1, fill: false },
        interactive: false,
      }),
    ]);

    map.on('click', onMapClick);
  }

  function clearCurrentLayers() {
    for (const key of ['currentGuessLayer', 'currentAnswerLayer', 'currentLineLayer']) {
      if (state[key]) {
        map.removeLayer(state[key]);
        state[key] = null;
      }
    }
  }

  function clearAllLayers() {
    clearCurrentLayers();
    for (const layer of state.pastLayers) map.removeLayer(layer);
    state.pastLayers = [];
  }

  function demoteCurrentToPast(truth) {
    // Convert the current round's answer marker into a small persistent past-answer marker.
    // Also drops the guess marker and the connecting line (they're not kept across rounds).
    if (state.currentAnswerLayer) map.removeLayer(state.currentAnswerLayer);
    if (state.currentGuessLayer) map.removeLayer(state.currentGuessLayer);
    if (state.currentLineLayer) map.removeLayer(state.currentLineLayer);
    state.currentAnswerLayer = null;
    state.currentGuessLayer = null;
    state.currentLineLayer = null;

    const m = L.marker([truth.lat, truth.lng], {
      icon: divIcon('answer-marker-past', 9),
      interactive: false,
      keyboard: false,
    })
      .bindTooltip(truth.name, {
        permanent: true,
        direction: 'right',
        offset: [6, 0],
        className: 'past-label',
      })
      .addTo(map);
    state.pastLayers.push(m);
  }

  function onMapClick(e) {
    if (!state.awaitingGuess) return;
    state.awaitingGuess = false;

    const guess = { lat: e.latlng.lat, lng: e.latlng.lng };
    const truth = state.queue[state.roundIndex];
    const km = haversineKm(guess, truth);

    state.totalKm += km;
    state.rounds.push({ truth, guess, km });

    state.currentGuessLayer = L.marker([guess.lat, guess.lng], {
      icon: divIcon('guess-marker', 14),
      interactive: false,
    }).addTo(map);
    state.currentAnswerLayer = L.marker([truth.lat, truth.lng], {
      icon: divIcon('answer-marker', 14),
      interactive: false,
    })
      .bindTooltip(truth.name, {
        permanent: true,
        direction: 'top',
        offset: [0, -8],
        className: 'current-label',
      })
      .addTo(map);
    state.currentLineLayer = L.polyline(
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
    // Demote prior round's markers (if any) before showing the new prompt.
    if (state.roundIndex > 0) {
      const prev = state.rounds[state.roundIndex - 1];
      demoteCurrentToPast(prev.truth);
    } else {
      clearCurrentLayers();
    }

    el.resultReadout.classList.add('hidden');
    el.nextBtn.classList.add('hidden');
    el.hint.classList.remove('hidden');
    el.quitBtn.classList.remove('hidden');

    const place = state.queue[state.roundIndex];
    el.placeName.textContent = place.name;
    el.placePopulation.textContent = formatPopulation(place.population);
    el.roundCounter.textContent = `${state.roundIndex + 1} / ${state.queue.length}`;
    el.totalSoFar.textContent = formatKm(state.totalKm);

    map.fitBounds(UK_BOUNDS, { animate: true });
    state.awaitingGuess = true;
  }

  function nextRound() {
    state.roundIndex += 1;
    if (state.roundIndex >= state.queue.length) {
      showResults();
    } else {
      startRound();
    }
  }

  function showResults() {
    // Drop the line + guess marker for the final round, but keep the current answer
    // visible. Then redraw every round's guess+answer+line as persistent past layers.
    if (state.currentLineLayer) { map.removeLayer(state.currentLineLayer); state.currentLineLayer = null; }
    if (state.currentAnswerLayer) { map.removeLayer(state.currentAnswerLayer); state.currentAnswerLayer = null; }
    if (state.currentGuessLayer) { map.removeLayer(state.currentGuessLayer); state.currentGuessLayer = null; }
    for (const layer of state.pastLayers) map.removeLayer(layer);
    state.pastLayers = [];

    for (const r of state.rounds) {
      const ans = L.marker([r.truth.lat, r.truth.lng], {
        icon: divIcon('answer-marker-past', 9),
        interactive: false,
      })
        .bindTooltip(r.truth.name, {
          permanent: true,
          direction: 'right',
          offset: [6, 0],
          className: 'past-label',
        })
        .addTo(map);
      const guess = L.marker([r.guess.lat, r.guess.lng], {
        icon: divIcon('guess-marker-past', 9),
        interactive: false,
      }).addTo(map);
      const line = L.polyline(
        [
          [r.guess.lat, r.guess.lng],
          [r.truth.lat, r.truth.lng],
        ],
        { color: css('--guess-past'), weight: 1.5, dashArray: '3 3', interactive: false }
      ).addTo(map);
      state.pastLayers.push(ans, guess, line);
    }

    map.fitBounds(UK_BOUNDS, { animate: true });

    // Swap header to results mode; hide playing-state footer controls.
    el.promptPlaying.classList.add('hidden');
    el.promptResults.classList.remove('hidden');
    el.finalTotal.textContent = Math.round(state.totalKm).toLocaleString();
    el.hint.classList.add('hidden');
    el.resultReadout.classList.add('hidden');
    el.nextBtn.classList.add('hidden');
    el.quitBtn.classList.add('hidden');

    // Populate and show the results overlay; map-view buttons stay hidden behind it.
    el.resultsList.innerHTML = '';
    for (const r of state.rounds) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="place"></span><span class="dist"></span>`;
      li.querySelector('.place').textContent = r.truth.name;
      li.querySelector('.dist').textContent = formatKm(r.km);
      el.resultsList.appendChild(li);
    }
    el.resultsTotalKm.textContent = formatKm(state.totalKm);
    showResultsOverlay();

    state.awaitingGuess = false;
  }

  function showResultsOverlay() {
    el.resultsOverlay.classList.remove('hidden');
    el.viewResultsBtn.classList.add('hidden');
    el.backMenuBtn.classList.add('hidden');
  }

  function hideResultsOverlay() {
    el.resultsOverlay.classList.add('hidden');
    el.viewResultsBtn.classList.remove('hidden');
    el.backMenuBtn.classList.remove('hidden');
    // Recompute map size in case overlay changed the available area.
    setTimeout(() => map.invalidateSize(), 0);
  }

  function openQuitConfirm() {
    el.confirmModal.classList.remove('hidden');
  }

  function closeQuitConfirm() {
    el.confirmModal.classList.add('hidden');
  }

  function applyOverlays() {
    if (!state.riversGeoLayer || !state.motorwaysGeoLayer) return;
    if (el.showRivers.checked) {
      if (!map.hasLayer(state.riversGeoLayer)) state.riversGeoLayer.addTo(map);
    } else {
      if (map.hasLayer(state.riversGeoLayer)) map.removeLayer(state.riversGeoLayer);
    }
    if (el.showMotorways.checked) {
      if (!map.hasLayer(state.motorwaysGeoLayer)) state.motorwaysGeoLayer.addTo(map);
    } else {
      if (map.hasLayer(state.motorwaysGeoLayer)) map.removeLayer(state.motorwaysGeoLayer);
    }
  }

  function startGame() {
    const allowed = DIFFICULTY_INCLUDES[state.difficulty] || DIFFICULTY_INCLUDES.medium;
    const pool = state.places.filter(
      (p) => !p.exclude && allowed.has(p.difficulty)
    );
    if (pool.length < ROUNDS) {
      console.warn('Place pool smaller than rounds:', pool.length);
    }
    state.queue = shuffle(pool).slice(0, ROUNDS);
    state.roundIndex = 0;
    state.totalKm = 0;
    state.rounds = [];
    clearAllLayers();

    el.start.classList.add('hidden');
    el.game.classList.remove('hidden');
    el.promptPlaying.classList.remove('hidden');
    el.promptResults.classList.add('hidden');
    el.resultsOverlay.classList.add('hidden');
    el.viewResultsBtn.classList.add('hidden');
    el.backMenuBtn.classList.add('hidden');
    el.confirmModal.classList.add('hidden');

    // Leaflet needs a size invalidation after the container becomes visible.
    setTimeout(() => { map.invalidateSize(); applyOverlays(); }, 0);

    startRound();
  }

  function removeOverlays() {
    if (state.riversGeoLayer && map.hasLayer(state.riversGeoLayer)) map.removeLayer(state.riversGeoLayer);
    if (state.motorwaysGeoLayer && map.hasLayer(state.motorwaysGeoLayer)) map.removeLayer(state.motorwaysGeoLayer);
  }

  function backToStart() {
    clearAllLayers();
    removeOverlays();
    el.resultsOverlay.classList.add('hidden');
    el.confirmModal.classList.add('hidden');
    el.viewResultsBtn.classList.add('hidden');
    el.backMenuBtn.classList.add('hidden');
    el.quitBtn.classList.add('hidden');
    el.game.classList.add('hidden');
    el.start.classList.remove('hidden');
  }

  async function boot() {
    const placesRes = await fetch('data/places.json');
    state.places = await placesRes.json();
    await initMap();

    el.difficultyBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        el.difficultyBtns.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.difficulty = btn.dataset.difficulty;
      });
    });

    el.startBtn.addEventListener('click', startGame);
    el.nextBtn.addEventListener('click', nextRound);
    el.viewResultsBtn.addEventListener('click', showResultsOverlay);
    el.overlayViewMapBtn.addEventListener('click', hideResultsOverlay);
    el.backMenuBtn.addEventListener('click', backToStart);
    el.overlayBackMenuBtn.addEventListener('click', backToStart);
    el.quitBtn.addEventListener('click', openQuitConfirm);
    el.confirmCancelBtn.addEventListener('click', closeQuitConfirm);
    el.confirmQuitBtn.addEventListener('click', () => {
      closeQuitConfirm();
      backToStart();
    });
  }

  boot().catch((err) => {
    console.error(err);
    document.body.innerHTML =
      '<div style="padding:2rem;font-family:sans-serif">Failed to load game data.</div>';
  });
})();
