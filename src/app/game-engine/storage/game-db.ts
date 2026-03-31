import Dexie, { type Table } from 'dexie';

// ── Saved entity interfaces ──────────────────────────────────────────

export interface SaveSlot {
  id?: number;
  name: string;
  timestamp: number;
  frame: number;
  smallCycle: number;
  bigCycle: number;
  epicCycle: number;
}

export interface SavedCreature {
  id?: number;
  saveSlotId: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  lifeEnergy: number;
  age: number;
  baseSpeed: number;
}

export interface SavedPlant {
  id?: number;
  saveSlotId: number;
  x: number;
  y: number;
  lifeEnergy: number;
  age: number;
}

export interface SavedTerrain {
  id?: number;
  saveSlotId: number;
  cellsJson: string;
  seedJson: string;
  blurFactor: number;
  cellSize: number;
  width: number;
  height: number;
}

// ── Database definition ──────────────────────────────────────────────

class GameDatabase extends Dexie {
  saveSlots!: Table<SaveSlot>;
  creatures!: Table<SavedCreature>;
  plants!: Table<SavedPlant>;
  terrain!: Table<SavedTerrain>;

  constructor() {
    super('AntGameDB');

    this.version(1).stores({
      saveSlots: '++id, name, timestamp',
      creatures: '++id, saveSlotId',
      plants:    '++id, saveSlotId',
      terrain:   '++id, saveSlotId',
    });
  }
}

export const gameDb = new GameDatabase();
