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

The initial set is 50 hand-curated major UK cities and towns, each tagged with a rough population. To expand to a comprehensive list (and add difficulty tiers based on population), the [ONS Index of Place Names](https://geoportal.statistics.gov.uk/datasets/8f8b561f256b40c3a6df71e400bb54f0/about) is a good source — convert to the same `{name, lat, lng, population}` shape and replace `data/places.json`.

## Credits

Map data © [Natural Earth](https://www.naturalearthdata.com/) (public domain). Map rendering by [Leaflet](https://leafletjs.com/).
