# Game Engine — Agent Instructions

> This document describes the `game-engine` module located at `src/app/game-engine/`.
> Use it as ground-truth context before modifying, extending, or debugging any engine code.

---

## Architecture Overview

The engine is a **singleton** exported from `src/app/game-engine/index.ts` as `default new GameEngine()`.  
Import it everywhere with:
```ts
import GE from '../game-engine';
```

The engine is composed of three collaborating subsystems:

| Subsystem | Class/File | Responsibility |
|---|---|---|
| Core loop | `GameEngine` (`index.ts`) | `requestAnimationFrame` loop, coordinates all subsystems |
| World time | `Time` (`time.ts`) | Hierarchical tick system (small / big / epic cycles) |
| Fauna & Flora | `FaunaAndFlora` (`fauna-and-flora/index.ts`) | Manages all creatures and plants |
| Mouse | `MouseController` (`mouse-controller.ts`) | Tracks mouse position, emits RxJS observables |

---

## Core Loop (`GameEngine`)

### Lifecycle

```
new GameEngine()   →   GE.setConfig(...)   →   GE.init({ renderCallback })
```

- `setConfig({ borderX, borderY, ctx })` — must be called **before** `init()` so world borders and canvas context are set.
- `init()` calls `startEngine()` which starts the `requestAnimationFrame` loop.
- The loop calls `renderCallback()` (provided by the Angular component) then `runFrames(dt)` then `runWorldTime()`.

### Frame vs Tick

- **Frame counter** (`this.frame`) counts 0–60 then resets. Runs at animation frame rate (~60fps).
- When `frame === 60`, `worldCycle.runTik()` fires — this drives the hierarchical time system.
- `dt` (delta time in **seconds**) is passed to `faunaAndFlora.doFrameCycle(dt)` every frame.

### Pause

Set `GE._config.pause = true` to freeze the simulation without stopping `requestAnimationFrame`.

---

## Time System (`Time`)

Three nested cycles, each triggering a callback when it rolls over:

| Cycle | Max ticks | Fires callback |
|---|---|---|
| `small` | 100 | `everySmallCycle` → `faunaAndFlora.doSmallCycle()` |
| `big` | 864 | `everyBigCycle` → `faunaAndFlora.doBigCycle()` |
| `epic` | 10 | `everyEpicCycle` (currently empty) |

**Approximate real time per cycle** (assuming 60fps, tick fires every 60 frames):
- 1 small cycle ≈ 1 second of real time
- 1 big cycle = 100 small = ~100s
- 1 epic cycle = 864 big = ~24 hours (one game "day")

To hook into a cycle, pass callbacks via `GE.worldCycle.setConfig({ everySmallCycle, everyBigCycle, everyEpicCycle })`.

---

## Fauna & Flora (`FaunaAndFlora`)

### Storage

```ts
_creatures: Map<number, Creature>   // keyed by auto-incrementing id
_plants:    Map<number, Plant>      // keyed by auto-incrementing id
```

Use the `.creatures` and `.plants` getters (return arrays) for read access.

### World Borders

Set via `setConfig({ worldBorders: { xStart, xEnd, yStart, yEnd } })`.  
Called automatically by `GameEngine.setConfig` when `borderX`/`borderY` are provided.

### Spawning

```ts
// Random position
faunaAndFlora.createCreature();
faunaAndFlora.createPlant();

// Exact position
faunaAndFlora.createCreature(Creature, x, y);
faunaAndFlora.createPlant(Plant, x, y);

// Custom subclass
faunaAndFlora.createCreature(MyAnt, x, y);
```

`createCreature` assigns a random `baseSpeed` in `[30, 90]` units/second.

### Creation Registries (`creaturesDef` / `plantsDef`)

These objects list known types:
```ts
creaturesDef = { creature: Creature }
plantsDef    = { plant: Plant }
```
Add entries here when introducing new creature/plant subclasses so the InfoPanel can expose them.

### Frame Cycle (`doFrameCycle`)

Called every frame with `dt`. Iterates all creatures, calls `creature.update(dt, context)` if alive, then removes consumed plants from the map.

### Small Cycle (`doSmallCycle`)

Called every ~1 second. Calls `thing.ageUp()` on all entities; removes any entity whose `lifeEnergy < -20`.

---

## Entity Hierarchy

```
Life  (life.ts)
├── Plant  (flora.ts)
└── Creature  (fauna.ts)
```

### `Life` — base class

| Property | Default | Notes |
|---|---|---|
| `id` | assigned | unique per map |
| `age` | 0 | incremented in `ageUp()` |
| `lifeEnergy` | 0 | positive = alive |
| `position` | `{x, y}` | world coords |
| `energyLossPerUnit` | 0.1 | overridden by `Creature` |

Key methods:
- `ageUp()` — increments `age`, decrements `lifeEnergy` by 1 (base; `Creature` overrides to skip energy loss)
- `modifyEnergy(amount)` — adds `amount` (can be negative)
- `consumeEnergy(actionType, data?)` — centralised energy cost gate; switch on `ActionType`
- `isDead()` — returns `lifeEnergy <= 0`

### `Plant` — flora

- Spawns with `lifeEnergy = 200`.
- `isConsumed()` delegates to `isDead()`.
- Removed from map when consumed **between** frame cycles (inside `doFrameCycle`).

### `Creature` — fauna

Additional state:
- `baseSpeed` — set at construction from random `[30, 90]`
- `target: Vector2` — current movement destination
- `vision: Vision` — 150-range, 120° cone
- `currentGoal: Goal` — decides which behavior to run (default: `SurviveGoal`)
- `currentBehavior: Behavior | null`
- `energyLossPerUnit = 0.1` per distance unit

`update(dt, context)` per frame:
1. Orient vision toward target direction
2. `currentGoal.evaluate()` → selects a `Behavior`
3. `behavior.execute()` → may update `target`
4. `this.move(dt)` → moves along target vector, consumes energy

Speed formula: `baseSpeed * log10(distance+10)/2 * randomFactor(±20%)`

---

## Behavior System

### Concepts

| Concept | Interface | Role |
|---|---|---|
| **Goal** | `Goal` | High-level objective; picks a `Behavior` each frame |
| **Behavior** | `Behavior` | Concrete action; modifies creature state |
| **Context** | `BehaviorContext` | Read-only snapshot passed each frame: `{ plants, worldBorders }` |

### Current implementations

**`SurviveGoal`** (the only goal) — priority order:
1. Adjacent plant (≤15 units) → **EatBehavior**
2. Visible plant in cone → **SeekPlantBehavior**
3. Nothing visible → **WanderBehavior**

**`SeekPlantBehavior`** — sets `creature.target` to the nearest visible plant.

**`EatBehavior`** — calls `creature.eat(plant)` on first adjacent plant; transfers all plant energy.

**`WanderBehavior`** — sets a new random target every 2 seconds or when target is reached (< 5 units).

### Adding a new behavior

1. Implement the `Behavior` interface in `behavior.ts`.
2. Add entry to `BehaviourName` enum.
3. Return your behavior from a `Goal.evaluate()` method (create new goal or modify existing).
4. Assign the goal via `creature.currentGoal = new MyGoal()`.

---

## Perception (`Vision`)

```ts
new Vision(range = 150, angleInDegrees = 120)
```

- `canSee(target, position)` — range check + cone (dot-product angle) check
- `findVisiblePlants(plants, position)` — filters out dead plants, uses `canSee`
- `updateDirection(velocity)` — normalizes velocity vector to track facing direction
- `getDirectionAngle()` — returns `atan2` angle (radians), used by canvas renderer

---

## Mouse Controller (`MouseController`)

Exposes three RxJS Observables after `setConfig({ ctx })` is called:

```ts
GE.mouseController.onMouseMove  // { x, y }
GE.mouseController.onMouseUp    // { x, y }
GE.mouseController.onMouseDown  // { x, y }
```

All coords are **canvas-relative** (`offsetX/offsetY`).

Subscribe from Angular components and **unsubscribe on destroy** to avoid leaks:
```ts
private sub?: Subscription;
this.sub = GE.mouseController.onMouseDown.subscribe(({ x, y }) => { ... });
ngOnDestroy() { this.sub?.unsubscribe(); }
```

---

## Angular Integration

### `CanvasContainerComponent`

- Owns the `<canvas>` element.
- Calls `GE.setConfig({ borderX, borderY, ctx })` then starts a **second** `requestAnimationFrame` loop for **rendering only** (the draw loop is separate from the simulation loop).
- Runs outside Angular zone: `this.ngZone.runOutsideAngular(() => this.draw())`.
- Renders: vision cones → creatures (color-coded by energy HSL 0→120) → plants (green / black if dead).

### `InfoPanelComponent`

- Holds a direct reference to `GE` for template binding.
- `initBang()` — spawns 10 creatures + 10 plants at random positions.
- `setCanvasDownNewCreature(class)` / `setCanvasDownNewPlant(class)` — arms the canvas click handler.
- `getCreatureCount(alive: boolean)` / `getPlantCount(alive: boolean)` — counts living/dead entities.

---

## `ActionType` Enum

Currently only `MOVE`. Energy cost = `distance * energyLossPerUnit`.  
Planned but not yet implemented: `ATTACK`, `EAT`, `REPRODUCE`.

To add a new action:
1. Add entry to `ActionType` enum in `action-type.ts`.
2. Add a `case` in `Life.consumeEnergy()`.
3. Call `this.consumeEnergy(ActionType.MY_ACTION, data)` from the relevant method.

---

## Key Design Patterns & Conventions

| Pattern | Where used |
|---|---|
| Singleton export | `export default new GameEngine()` in `index.ts` |
| Delta-time movement | `move(dt)` — always multiply speed by `dt` for frame-rate independence |
| Goal → Behavior | `SurviveGoal` selects behaviors each frame based on perception |
| Energy gate | All energy changes go through `modifyEnergy()` or `consumeEnergy()`, never direct assignment |
| Map for fast delete | `_creatures` and `_plants` are `Map<number, Entity>` for O(1) removal |
| Dual RAF loops | Simulation driven by `GameEngine.runEngine`; canvas rendering by `CanvasContainerComponent.draw` |

---

## Common Tasks

### Spawn entities programmatically
```ts
GE.faunaAndFlora.createCreature();        // 1 creature at random position
GE.faunaAndFlora.createPlant(Plant, 200, 300); // plant at exact coords
```

### Pause / resume simulation
```ts
GE._config.pause = true;
GE._config.pause = false;
```

### Create a custom creature type
```ts
// In a new file, e.g. fauna-and-flora/ant.ts
import { Creature, CreatureProps } from './fauna';

export class Ant extends Creature {
  constructor(props: CreatureProps) {
    super(props);
    this.lifeEnergy = 30;
    this.energyLossPerUnit = 0.05; // more efficient
  }
}
```
Then register it:
```ts
GE.faunaAndFlora.creaturesDef['ant'] = Ant;
```
And spawn it:
```ts
GE.faunaAndFlora.createCreature(Ant);
```

### Hook into world time
```ts
GE.worldCycle.setConfig({
  everySmallCycle: () => {
    // runs ~every 1 second of real time
    GE.faunaAndFlora.createPlant(); // e.g. regrow plants
  },
});
```

### Subscribe to mouse events
```ts
import GE from '../game-engine';
import { Subscription } from 'rxjs';

private sub?: Subscription;

ngOnInit() {
  this.sub = GE.mouseController.onMouseDown.subscribe(({ x, y }) => {
    // handle click at canvas coords (x, y)
  });
}

ngOnDestroy() {
  this.sub?.unsubscribe();
}
```

---

## 2026-04 Tile/Grid Update (Current)

The terrain system has a dedicated tile API and should be treated as the canonical way to do map math.

Source files:
- `src/app/game-engine/world-map/tile-system.ts`
- `src/app/game-engine/world-map/main.ts`

Use these APIs from `GE.world.terrain`:
- `getTileAtWorld(x, y)`
- `getTileCenter(tx, ty)`
- `getTileNeighbors(tx, ty, includeDiagonals?)`
- `forEachTileInWorldRect(x1, y1, x2, y2, callback)`
- `setTileBiome(tx, ty, biome, emitChange?)`
- `paintBiomeCircle(centerX, centerY, radius, biome)`
- `findTilePath(startTile, endTile, options?)`
- `findWorldPath(startX, startY, endX, endY, options?)`

Rules:
- Prefer tile-level methods for biome painting and spatial queries.
- Keep `cellSize`, map `width/height`, and tile dimensions synchronized using:
  - `setCellSize(...)`
  - `setMapDimensions(...)`
- On save restore, do not assign `terrain.width/height/cellSize` directly; call the setters.

RTS packages expected in dependencies:
- `@babylonjs/materials`
- `@babylonjs/addons`
- `easystarjs`

Pathfinding policy:
- Use `findTilePath` for AI/path-planning logic.
- Use `findWorldPath` when movement code expects world coordinates.
- Default walkable biomes are grass and sand; water is blocked unless explicitly changed in options.
