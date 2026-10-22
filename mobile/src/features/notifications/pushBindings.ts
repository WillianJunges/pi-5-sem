export interface DeviceBinding {
  userId: string;
  token: string;
  platform: 'android' | 'ios';
  version: number;
  registered: boolean;
}
export interface Installation {
  installationId: string;
  installationKey: string;
  version: number;
  binding: DeviceBinding | null;
  revocations: number[];
}
interface Storage {
  get(): Promise<Installation | null>;
  set(value: Installation): Promise<void>;
}
export interface DeviceGateway {
  register(
    userId: string,
    input: {
      installationId: string;
      installationKey: string;
      bindingVersion: number;
      token: string;
      platform: 'android' | 'ios';
    },
  ): Promise<unknown>;
  revoke(input: { installationId: string; installationKey: string; bindingVersion: number }): Promise<unknown>;
}
/** Persistência antes da rede; operações atrasadas não podem restaurar o vínculo de outra conta. */
export class PushBindings {
  private tail: Promise<unknown> = Promise.resolve();
  private running: Promise<void> | null = null;
  private rerun = false;
  constructor(
    private store: Storage,
    private gateway: DeviceGateway,
    private identity: () => { installationId: string; installationKey: string },
    private current: (userId: string) => Promise<boolean>,
  ) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async read(): Promise<Installation> {
    return (await this.store.get()) ?? { ...this.identity(), version: 0, binding: null, revocations: [] };
  }
  snapshot(): Promise<Installation> {
    return this.serial(() => this.read());
  }
  enable(userId: string, token: string, platform: 'android' | 'ios'): Promise<void> {
    return this.serial(async () => {
      const value = await this.read();
      if (!(await this.current(userId))) throw new Error('A sessão mudou. Tente novamente.');
      if (value.binding?.userId === userId && value.binding.token === token && value.binding.platform === platform)
        return;
      if (value.binding) value.revocations.push(value.binding.version);
      value.version++;
      if (!Number.isSafeInteger(value.version)) throw new Error('Versão de instalação inválida.');
      value.binding = { userId, token, platform, version: value.version, registered: false };
      await this.store.set(value);
    });
  }
  disable(): Promise<void> {
    return this.serial(async () => {
      const value = await this.read();
      if (value.binding) {
        value.revocations.push(value.binding.version);
        value.binding = null;
        value.version++;
        await this.store.set(value);
      }
    });
  }
  async reconcile(userId: string | null): Promise<void> {
    await this.serial(async () => {
      const value = await this.read();
      // Efeitos React de uma sessão antiga podem terminar depois de um login novo.
      if (userId && !(await this.current(userId))) return;
      if (!userId && value.binding && (await this.current(value.binding.userId))) return;
      if (value.binding && value.binding.userId !== userId) {
        value.revocations.push(value.binding.version);
        value.binding = null;
        value.version++;
        await this.store.set(value);
      }
    });
    await this.flush();
  }
  flush(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        void this.flush().catch(() => undefined);
      }
    });
    return this.running;
  }
  private async run() {
    for (let i = 0; i < 30; i++) {
      const value = await this.snapshot();
      const version = value.revocations[0];
      if (version !== undefined) {
        await this.gateway.revoke({
          installationId: value.installationId,
          installationKey: value.installationKey,
          bindingVersion: version,
        });
        await this.serial(async () => {
          const latest = await this.read();
          latest.revocations = latest.revocations.filter((v) => v !== version);
          await this.store.set(latest);
        });
        continue;
      }
      const binding = value.binding;
      if (!binding || binding.registered || !(await this.current(binding.userId))) return;
      await this.gateway.register(binding.userId, {
        installationId: value.installationId,
        installationKey: value.installationKey,
        bindingVersion: binding.version,
        token: binding.token,
        platform: binding.platform,
      });
      await this.serial(async () => {
        const latest = await this.read();
        if (latest.binding?.version === binding.version) {
          latest.binding.registered = true;
          await this.store.set(latest);
        }
      });
    }
  }
}
