import { gameDb, type SaveSlot } from './game-db';
import type { WorldEngine } from '../world.engine';

/** Reserved slot ID for autosave — always slot 1 */
const AUTOSAVE_SLOT_NAME = '__autosave__';

/**
 * Service for saving and loading the entire world state to/from IndexedDB via Dexie.
 *
 * Supports both manual save slots AND a single autosave slot that is
 * overwritten on every big cycle, so refreshing the page restores state.
 */
export class SaveGameService {

  /** Whether an autosave write is currently in progress */
  private autosaveInProgress = false;
  private autosaveScheduled = false;

  // ── Autosave / Auto-restore ────────────────────────────────────

  /**
   * Autosave the current world state. Overwrites the single autosave slot.
   * Debounced: if a write is already in flight, skip this call.
   */
  scheduleAutosave(world: WorldEngine): void {
    if (this.autosaveScheduled || this.autosaveInProgress) return;
    this.autosaveScheduled = true;

    const run = () => {
      this.autosaveScheduled = false;
      void this.autosave(world);
    };

    const idleCallback = typeof window !== 'undefined'
      ? (window as any).requestIdleCallback
      : null;

    if (idleCallback) {
      idleCallback(run, { timeout: 3000 });
    } else {
      setTimeout(run, 0);
    }
  }

  async autosave(world: WorldEngine): Promise<void> {
    if (this.autosaveInProgress) return; // skip if already writing
    this.autosaveInProgress = true;

    try {
      await gameDb.transaction('rw',
        gameDb.saveSlots, gameDb.creatures, gameDb.plants, gameDb.terrain,
        async () => {
          // Find or create the autosave slot
          let slot = await gameDb.saveSlots.where('name').equals(AUTOSAVE_SLOT_NAME).first();
          let slotId: number;

          if (slot?.id) {
            slotId = slot.id;
            // Clear old data for this slot
            await gameDb.creatures.where('saveSlotId').equals(slotId).delete();
            await gameDb.plants.where('saveSlotId').equals(slotId).delete();
            await gameDb.terrain.where('saveSlotId').equals(slotId).delete();
            // Update timestamp
            await gameDb.saveSlots.update(slotId, { timestamp: Date.now() });
          } else {
            slotId = await gameDb.saveSlots.add({
              name: AUTOSAVE_SLOT_NAME,
              timestamp: Date.now(),
              frame: 0,
              smallCycle: 0,
              bigCycle: 0,
              epicCycle: 0,
            }) as number;
          }

          // Bulk-save creatures
          const creatures = world.fauna.creatures.map(c => ({
            saveSlotId: slotId,
            x: c.position.x,
            y: c.position.y,
            targetX: c.target.x,
            targetY: c.target.y,
            lifeEnergy: c.lifeEnergy,
            age: c.age,
            baseSpeed: c.baseSpeed,
          }));
          if (creatures.length > 0) {
            await gameDb.creatures.bulkAdd(creatures);
          }

          // Bulk-save plants
          const plants = world.flora.plants.map(p => ({
            saveSlotId: slotId,
            x: p.position.x,
            y: p.position.y,
            lifeEnergy: p.lifeEnergy,
            age: p.age,
          }));
          if (plants.length > 0) {
            await gameDb.plants.bulkAdd(plants);
          }

          // Save terrain
          await gameDb.terrain.add({
            saveSlotId: slotId,
            cellsJson: JSON.stringify(world.terrain.cells),
            seedJson: JSON.stringify((world.terrain.generator as any).seed),
            cellSize: world.terrain.cellSize,
            width: world.terrain.width,
            height: world.terrain.height,
          });
        }
      );
    } catch (err) {
      console.warn('[SaveService] Autosave failed:', err);
    } finally {
      this.autosaveInProgress = false;
    }
  }

  /**
   * Try to restore from the autosave slot. Returns true if data was loaded.
   */
  async autoRestore(world: WorldEngine): Promise<boolean> {
    try {
      const slot = await gameDb.saveSlots.where('name').equals(AUTOSAVE_SLOT_NAME).first();
      if (!slot?.id) return false;
      return this.loadGame(world, slot.id);
    } catch (err) {
      console.warn('[SaveService] Auto-restore failed:', err);
      return false;
    }
  }

  // ── Manual Save / Load ─────────────────────────────────────────

  /**
   * Save the entire world state into a named slot.
   */
  async saveGame(world: WorldEngine, slotName: string): Promise<number> {
    return gameDb.transaction('rw',
      gameDb.saveSlots, gameDb.creatures, gameDb.plants, gameDb.terrain,
      async () => {
        const slotId = await gameDb.saveSlots.add({
          name: slotName,
          timestamp: Date.now(),
          frame: 0,
          smallCycle: 0,
          bigCycle: 0,
          epicCycle: 0,
        });

        const id = slotId as number;

        const creatures = world.fauna.creatures.map(c => ({
          saveSlotId: id,
          x: c.position.x,
          y: c.position.y,
          targetX: c.target.x,
          targetY: c.target.y,
          lifeEnergy: c.lifeEnergy,
          age: c.age,
          baseSpeed: c.baseSpeed,
        }));
        if (creatures.length > 0) {
          await gameDb.creatures.bulkAdd(creatures);
        }

        const plants = world.flora.plants.map(p => ({
          saveSlotId: id,
          x: p.position.x,
          y: p.position.y,
          lifeEnergy: p.lifeEnergy,
          age: p.age,
        }));
        if (plants.length > 0) {
          await gameDb.plants.bulkAdd(plants);
        }

        await gameDb.terrain.add({
          saveSlotId: id,
          cellsJson: JSON.stringify(world.terrain.cells),
          seedJson: JSON.stringify((world.terrain.generator as any).seed),
          cellSize: world.terrain.cellSize,
          width: world.terrain.width,
          height: world.terrain.height,
        });

        console.info(`[SaveService] Game saved to slot "${slotName}" (id: ${id})`);
        return id;
      }
    );
  }

  /**
   * Load a saved game by slot ID.
   */
  async loadGame(world: WorldEngine, slotId: number): Promise<boolean> {
    const slot = await gameDb.saveSlots.get(slotId);
    if (!slot) {
      console.warn(`[SaveService] Save slot ${slotId} not found.`);
      return false;
    }

    const [savedCreatures, savedPlants, savedTerrain] = await Promise.all([
      gameDb.creatures.where('saveSlotId').equals(slotId).toArray(),
      gameDb.plants.where('saveSlotId').equals(slotId).toArray(),
      gameDb.terrain.where('saveSlotId').equals(slotId).first(),
    ]);

    // Restore terrain first
    if (savedTerrain) {
      const restoredWidth = Math.max(0, savedTerrain.width || 400);
      const restoredHeight = Math.max(0, savedTerrain.height || 400);
      const restoredBorders = {
        xStart: 0,
        xEnd: restoredWidth,
        yStart: 0,
        yEnd: restoredHeight,
      };

      // Keep world borders in sync with the restored terrain size
      // without forcing terrain regeneration.
      world.worldBorders = restoredBorders;
      world.fauna.setConfig({ worldBorders: restoredBorders });
      world.flora.setConfig({ worldBorders: restoredBorders });
      world.terrain.worldBorders = restoredBorders;

      world.terrain.cells = JSON.parse(savedTerrain.cellsJson);
      world.terrain.setCellSize(savedTerrain.cellSize);
      world.terrain.setMapDimensions(restoredWidth, restoredHeight);

      // Validate that the cells are fully populated and have colors
      if (!world.terrain.cells || world.terrain.cells.length === 0 || !world.terrain.cells[0]?.terrain) {
         console.warn('[SaveService] Loaded terrain cells are invalid. Regenerating map.');
         world.terrain.generateMap();
      }

      try {
        const seedData = JSON.parse(savedTerrain.seedJson);
        if (Array.isArray(seedData) && seedData.length > 0) {
          (world.terrain.generator as any).seed = seedData;
        } else {
          // Reseed if seed data is invalid
          (world.terrain.generator as any).reseed();
        }
      } catch { 
        (world.terrain.generator as any).reseed();
      }
    }

    // Restore creatures
    world.fauna.clearCreatures();
    for (const sc of savedCreatures) {
      world.fauna.createCreature(undefined, sc.x, sc.y);
      const created = world.fauna.creatures[world.fauna.creatures.length - 1];
      if (created) {
        created.lifeEnergy = sc.lifeEnergy;
        created.age = sc.age;
        created.baseSpeed = sc.baseSpeed;
        created.setTarget({ x: sc.targetX, y: sc.targetY });
      }
    }

    // Restore plants
    world.flora.clearPlants();
    for (const sp of savedPlants) {
      world.flora.createPlant(undefined, sp.x, sp.y);
      const created = world.flora.plants[world.flora.plants.length - 1];
      if (created) {
        created.lifeEnergy = sp.lifeEnergy;
        created.age = sp.age;
      }
    }
    world.fauna.rebuildSpatialIndex();
    world.flora.rebuildSpatialIndex();

    console.info(`[SaveService] Loaded save "${slot.name}" — ${savedCreatures.length} creatures, ${savedPlants.length} plants`);
    return true;
  }

  /**
   * List all save slots (excluding autosave), newest first.
   */
  async listSaves(): Promise<SaveSlot[]> {
    const all = await gameDb.saveSlots.orderBy('timestamp').reverse().toArray();
    return all.filter(s => s.name !== AUTOSAVE_SLOT_NAME);
  }

  /**
   * Delete a save slot and all its associated entity data.
   */
  async deleteSave(slotId: number): Promise<void> {
    await gameDb.transaction('rw',
      gameDb.saveSlots, gameDb.creatures, gameDb.plants, gameDb.terrain,
      async () => {
        await gameDb.creatures.where('saveSlotId').equals(slotId).delete();
        await gameDb.plants.where('saveSlotId').equals(slotId).delete();
        await gameDb.terrain.where('saveSlotId').equals(slotId).delete();
        await gameDb.saveSlots.delete(slotId);
      }
    );
    console.info(`[SaveService] Deleted save slot ${slotId}`);
  }

  /**
   * Delete ALL save data.
   */
  async clearAllSaves(): Promise<void> {
    await gameDb.transaction('rw',
      gameDb.saveSlots, gameDb.creatures, gameDb.plants, gameDb.terrain,
      async () => {
        await gameDb.creatures.clear();
        await gameDb.plants.clear();
        await gameDb.terrain.clear();
        await gameDb.saveSlots.clear();
      }
    );
    console.info('[SaveService] All saves cleared');
  }
}

export default new SaveGameService();
