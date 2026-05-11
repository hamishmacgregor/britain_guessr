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

`data/places.json` is built from official 2021 Census sources:

- **England & Wales:** ONS *Towns and Cities, Census 2021* built-up area populations, joined to coordinates from the ONS *Index of Place Names 2024*.
- **Scotland:** NRS *Settlements and Localities mid-2020 estimates*, with coordinates from the same IPN file.
- **Northern Ireland:** NISRA *Census 2021 person and household estimates for settlements* (CT0046), with coordinates from GeoNames `cities15000` and a small hand-curated fallback for places under the GeoNames threshold (Armagh, Dungannon, etc.).
- **London** is added manually with its Census 2021 population (it isn't in the ONS BUA file).

The source spreadsheets/CSV live under `raw_data/` so the join is reproducible.

Each entry:

```jsonc
{
  "name": "Manchester",
  "lat": 53.4781,
  "lng": -2.2452,
  "population": 470405,
  "country": "England",         // England | Scotland | Wales | Northern Ireland
  "difficulty": "easy",         // easy (≥150k) | medium (≥50k) | hard (≥15k)
  "bua_size": "Major",          // ONS BUA size classification (E&W only)
  "region": "North West",
  "source_code": "E63004124",   // ONS BUA / NRS settlement / NISRA settlement code
  "coord_source": "IPN",
  "exclude": true,               // optional; the game skips entries with this set
  "exclude_reason": "duplicate name (appears 2 times)"
}
```

Entries are pre-flagged with `exclude: true` when they share a name with another active entry (e.g. Newport in Wales vs Newport on the Isle of Wight; Bangor in NI vs Bangor in Wales). They remain in the file for transparency — the game ignores them.

## Credits

Map data © [Natural Earth](https://www.naturalearthdata.com/) (public domain). Place data from [ONS](https://www.ons.gov.uk/) (Open Government Licence v3), [NRS](https://www.nrscotland.gov.uk/) (OGL), [NISRA](https://www.nisra.gov.uk/) (OGL), and [GeoNames](https://www.geonames.org/) (CC BY 4.0). Map rendering by [Leaflet](https://leafletjs.com/).
