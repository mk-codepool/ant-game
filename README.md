# AntGame

AntGame is a Babylon.js + Angular sandbox for RTS-style simulation. The map now has a dedicated tile API for terrain edits and spatial calculations.

## Run

```bash
npm install
npm start
```

## Tile System

Tile logic is implemented in:
- `src/app/game-engine/world-map/tile-system.ts`
- `src/app/game-engine/world-map/main.ts`

Current defaults:
- world size: `4000 x 4000` units
- tile size: `20` units
- grid: `200 x 200` tiles

Main API surface on `GE.world.terrain`:
- `getTileAtWorld(x, y)`
- `getTileCenter(tx, ty)`
- `getTileNeighbors(tx, ty, includeDiagonals?)`
- `forEachTileInWorldRect(x1, y1, x2, y2, callback)`
- `setTileBiome(tx, ty, biome, emitChange?)`
- `paintBiomeCircle(centerX, centerY, radius, biome)`
- `findTilePath(startTile, endTile, options?)`
- `findWorldPath(startX, startY, endX, endY, options?)`

Existing APIs still work:
- `setPixelBiome(px, py, biome)`
- `getPixelCell(px, py)`

Pathfinding (`easystarjs`) defaults:
- walkable biomes: `GRASS`, `SAND`
- blocked biome: `WATER`
- diagonals: enabled by default (set `allowDiagonals: false` to disable)

## RTS-Oriented Dependencies

Declared in `package.json`:
- `@babylonjs/materials` (grid/shader helpers)
- `@babylonjs/addons` (navigation plugin entrypoint)
- `easystarjs` (tile-based A* pathfinding)

Install command:

```bash
npm install @babylonjs/materials @babylonjs/addons easystarjs
```

## Notes

- Autosave restore now keeps terrain dimensions and tile system dimensions synchronized via `setCellSize(...)` + `setMapDimensions(...)`.
- The renderer keeps biome texture and chessboard overlay; camera centering uses restored terrain dimensions.
