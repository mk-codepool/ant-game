import type { CameraBounds } from './lod-scheduler';
import type {
  SimulationCommand,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from './simulation-protocol';
import type { SimulationConfig } from './simulation-config';

export class SimulationWorkerClient {
  private worker: Worker | null = null;
  private commandQueue: SimulationCommand[] = [];
  private ready = false;

  constructor(private readonly onMessage: (message: SimulationWorkerResponse) => void = () => {}) {}

  start(config: SimulationConfig, width: number, height: number): void {
    if (typeof Worker === 'undefined' || this.worker) return;

    try {
      this.worker = new Worker(new URL('./simulation.worker', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }: MessageEvent<SimulationWorkerResponse>) => {
        if (data.type === 'ready') {
          this.ready = true;
          this.flushCommands();
        }
        this.onMessage(data);
      };
      this.post({ type: 'init', config, width, height });
    } catch (err) {
      console.warn('[SimulationWorkerClient] Worker disabled:', err);
      this.worker = null;
      this.ready = false;
    }
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.commandQueue = [];
  }

  configure(config: Partial<SimulationConfig>): void {
    this.post({ type: 'tickConfig', config });
  }

  setCameraBounds(bounds: CameraBounds): void {
    this.post({ type: 'cameraBounds', bounds });
  }

  enqueue(command: SimulationCommand): void {
    if (!this.worker) return;
    this.commandQueue.push(command);
    this.flushCommands();
  }

  private flushCommands(): void {
    if (!this.worker || !this.ready || this.commandQueue.length === 0) return;
    const commands = this.commandQueue;
    this.commandQueue = [];
    this.post({ type: 'commandBatch', commands });
  }

  private post(message: SimulationWorkerRequest): void {
    this.worker?.postMessage(message);
  }
}
