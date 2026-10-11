import { Deferred, Room, type Client } from "@colyseus/core";

type PendingRecovery = {
  deferred: Deferred<Client>;
  finished: Promise<void>;
  finish: () => void;
  left: Promise<void>;
  resolveLeft: () => void;
  settled: boolean;
};

type OfflineSeat = { timer: ReturnType<typeof setTimeout>; onExpired: () => void };

export abstract class PrivateCodeRoom extends Room {
  static readonly EMPTY_ROOM_GRACE_MS = 15_000;
  private readonly pendingRecoveries = new Map<string, PendingRecovery>();
  private readonly expiredRecoveries = new Set<string>();
  private readonly offlineSeats = new Map<string, OfflineSeat>();
  private readonly codeReplacements = new Set<string>();
  private readonly replacementTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private emptyRoomTimeout: ReturnType<typeof setTimeout> | undefined;

  override autoDispose = false;

  protected privateCodeRoomJoined(): void {
    clearTimeout(this.emptyRoomTimeout);
    this.emptyRoomTimeout = undefined;
  }

  protected privateCodeRoomLeft(client: Client): boolean {
    this.pendingRecoveries.get(client.sessionId)?.resolveLeft();
    if (this.pendingRecoveries.has(client.sessionId)) return true;
    if (this.expiredRecoveries.has(client.sessionId)) {
      this.scheduleEmptyRoomDisposal(0);
      return true;
    }
    this.scheduleEmptyRoomDisposal();
    return false;
  }

  protected async waitForCodeRecovery(client: Client, onExpired: () => void, seconds = 15): Promise<void> {
    const deferred = this.allowReconnection(client, seconds);
    let finish!: () => void;
    let resolveLeft!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const left = new Promise<void>(resolve => { resolveLeft = resolve; });
    const recovery = { deferred, finished, finish, left, resolveLeft, settled: false };
    this.pendingRecoveries.set(client.sessionId, recovery);
    try {
      await deferred;
    } catch {
      if (!this.codeReplacements.has(client.sessionId)) {
        this.pendingRecoveries.delete(client.sessionId);
        // Colyseus removes the dropped socket from `clients` before `onDrop`
        // runs. Mark the expired reservation even when no other player is
        // connected so the follow-up `onLeave` cannot create a second offline
        // seat timer that races the empty-room disposal timer.
        this.expiredRecoveries.add(client.sessionId);
        onExpired();
        if (this.clients.length === 0) this.scheduleEmptyRoomDisposal(0);
      }
    } finally {
      recovery.settled = true;
      finish();
    }
  }

  async prepareRoomCodeRejoin(targetSessionId?: string): Promise<string | undefined> {
    const pendingEntry = [...this.pendingRecoveries].find(([sessionId]) => !this.codeReplacements.has(sessionId) && (!targetSessionId || targetSessionId === sessionId));
    const offlineEntry = [...this.offlineSeats].find(([sessionId]) => !this.codeReplacements.has(sessionId) && (!targetSessionId || targetSessionId === sessionId));
    const expiredSessionId = [...this.expiredRecoveries].find(sessionId => !this.codeReplacements.has(sessionId) && (!targetSessionId || targetSessionId === sessionId));
    const next = pendingEntry ?? offlineEntry ?? (expiredSessionId ? [expiredSessionId, undefined] as const : undefined);
    if (!next) return undefined;
    const [sessionId, pending] = next;
    this.codeReplacements.add(sessionId);
    if (pendingEntry && !this.hasSettled(pending as PendingRecovery)) {
      const recovery = pending as PendingRecovery;
      recovery.deferred.reject(new Error("Seat replaced by room-code join"));
      await recovery.finished;
    }
    if (pendingEntry) await (pending as PendingRecovery).left;
    // Colyseus removes the disconnected client from its reserved count just
    // after onLeave completes; allow that bookkeeping turn before re-reserving.
    await new Promise(resolve => setTimeout(resolve, 0));
    const timeout = setTimeout(() => this.cancelRoomCodeRejoin(sessionId), 20_000);
    this.replacementTimeouts.set(sessionId, timeout);
    return sessionId;
  }

  protected consumeRoomCodeRejoin(sessionId: unknown): string | undefined {
    if (typeof sessionId !== "string" || !this.codeReplacements.delete(sessionId)) return undefined;
    this.pendingRecoveries.delete(sessionId);
    this.expiredRecoveries.delete(sessionId);
    const offline = this.offlineSeats.get(sessionId);
    if (offline) clearTimeout(offline.timer);
    this.offlineSeats.delete(sessionId);
    clearTimeout(this.replacementTimeouts.get(sessionId));
    this.replacementTimeouts.delete(sessionId);
    return sessionId;
  }

  protected isRoomCodeRejoinPending(sessionId: string): boolean {
    return this.codeReplacements.has(sessionId);
  }

  protected hasRoomCodeRecovery(sessionId: string): boolean {
    return this.pendingRecoveries.has(sessionId) || this.expiredRecoveries.has(sessionId) || this.offlineSeats.has(sessionId);
  }

  protected reserveDisconnectedCodeSeat(sessionId: string, onExpired: () => void): void {
    const existing = this.offlineSeats.get(sessionId);
    if (existing) clearTimeout(existing.timer);
    const offline = { timer: undefined as unknown as ReturnType<typeof setTimeout>, onExpired };
    offline.timer = setTimeout(() => {
      if (this.offlineSeats.get(sessionId) !== offline) return;
      this.offlineSeats.delete(sessionId);
      onExpired();
      this.scheduleEmptyRoomDisposal(0);
    }, PrivateCodeRoom.EMPTY_ROOM_GRACE_MS);
    offline.timer.unref?.();
    this.offlineSeats.set(sessionId, offline);
  }

  protected clearRoomCodeRecovery(sessionId: string): void {
    this.pendingRecoveries.delete(sessionId);
    this.expiredRecoveries.delete(sessionId);
    const offline = this.offlineSeats.get(sessionId);
    if (offline) clearTimeout(offline.timer);
    this.offlineSeats.delete(sessionId);
  }

  private hasSettled(pending: PendingRecovery): boolean {
    return pending.settled;
  }

  async cancelRoomCodeRejoin(sessionId: string): Promise<void> {
    if (!this.codeReplacements.delete(sessionId)) return;
    clearTimeout(this.replacementTimeouts.get(sessionId));
    this.replacementTimeouts.delete(sessionId);
    this.pendingRecoveries.delete(sessionId);
    this.expiredRecoveries.delete(sessionId);
    const offline = this.offlineSeats.get(sessionId);
    if (offline) clearTimeout(offline.timer);
    this.offlineSeats.delete(sessionId);
    this.onRoomCodeRejoinCancelled(sessionId);
    this.scheduleEmptyRoomDisposal(0);
  }

  private scheduleEmptyRoomDisposal(delayMs = PrivateCodeRoom.EMPTY_ROOM_GRACE_MS): void {
    if (this.clients.length > 0 || this.pendingRecoveries.size > 0 || this.offlineSeats.size > 0) return;
    if (this.emptyRoomTimeout) return;
    this.emptyRoomTimeout = setTimeout(() => {
      this.emptyRoomTimeout = undefined;
      if (this.clients.length === 0 && this.pendingRecoveries.size === 0 && this.offlineSeats.size === 0) void this.disconnect();
    }, delayMs);
    this.emptyRoomTimeout.unref?.();
  }

  protected abstract onRoomCodeRejoinCancelled(sessionId: string): void;
}
