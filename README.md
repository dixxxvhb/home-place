# Saturday Morning

A walkable place built entirely in code: the house I grew up in, its yard, the shop, the arena and the horse pastures, on a clear July Saturday a little before eight in the morning.

Every shape, texture, light and sound is generated in the browser with Three.js and the Web Audio API. There are no downloaded models, images or audio files. The only outside data is a coarse elevation grid (USGS 3DEP) that shapes the ground and the mountains on the horizon, and the layout was measured off aerial photos.

## Run it

```
npm install
npm run dev
```

Open http://127.0.0.1:5236. Desktop: click to walk in, W A S D to walk, mouse to look. Phone: left thumb walks, right thumb looks.

`npm run shot -- lawn,house --fps` renders fixed viewpoints with Playwright into `shots/`.
