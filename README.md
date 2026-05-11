# Britain Guessr

A small browser game: a UK place name appears, you click on the map to guess where it is, and you're scored on total distance across 10 rounds. Lowest wins.

## Run locally

The page uses `fetch()` to load data files, so you need a local web server (it won't work via `file://`):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push to GitHub.
2. Repo → Settings → Pages → Source: `Deploy from a branch`, Branch: `main` (or whichever branch), folder `/ (root)`.
3. Wait a minute. The game will be live at `https://<user>.github.io/britain_guessr/`.

No build step. All assets are static.

## File layout

```
index.html              # markup, loads Leaflet from CDN
style.css               # responsive layout + map styling
game.js                 # game loop, scoring, map setup
data/places.json        # places (name, lat, lng, population)
data/uk_outline.geojson # UK boundary (Natural Earth 1:50m, simplified)
data/uk_rivers.geojson  # major rivers in UK bbox (Natural Earth 1:10m)
```

## Place data

`data/places.json` is derived from [GeoNames](https://www.geonames.org/) `cities15000` (all populated places with population ≥ 15,000), filtered to the UK. Each entry has:

```jsonc
{
  "name": "Manchester",
  "lat": 53.48095,
  "lng": -2.23743,
  "population": 395515,
  "country": "England",       // England | Scotland | Wales | Northern Ireland
  "difficulty": "easy",       // easy (≥150k) | medium (≥50k) | hard (≥15k)
  "geonameid": 2643123,
  "fcode": "PPLA2",
  "exclude": true,             // optional; if set, the game skips this entry
  "exclude_reason": "duplicate name (...)"
}
```

Entries are pre-flagged with `exclude: true` when they are subdivisions of larger cities (e.g. Chelsea, Battersea) or share a name with another place in the dataset (e.g. Bangor in Wales vs Bangor in NI). They remain in the file for transparency — the game ignores them.

## Credits

Map data © [Natural Earth](https://www.naturalearthdata.com/) (public domain). Place data from [GeoNames](https://www.geonames.org/) (CC BY 4.0). Map rendering by [Leaflet](https://leafletjs.com/).
