import {Client, type Room} from '@colyseus/sdk';

/** The pinned SDK does not reject a close-before-join or time out its handshake.
 * Capture its protected room factory so failed attempts can close their sockets.
 * Reuse the caller's reservation; never perform another admission here. */
export async function consumeReservedSeat(endpoint: string,reservation: Parameters<Client["consumeSeatReservation"]>[0],{signal,timeoutMs=3000}: {signal?: AbortSignal;timeoutMs?: number}={}) {
  let room: Pick<Room<unknown, unknown>, "reconnection" | "connection" | "onLeave"> | undefined,closedListener: (() => void) | undefined;
  let rejectPending: (reason: Error) => void = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const interrupted=new Promise<never>((_,reject)=>{rejectPending=reject;});
  const abort=()=>rejectPending(new Error('Room admission canceled'));
  class AdmissionClient extends Client {
    protected override createRoom<T>(roomName: string, rootSchema?: Parameters<typeof this.consumeSeatReservation<T>>[1]) {
      const created=super.createRoom<T>(roomName,rootSchema);
      room=created;
      created.reconnection.enabled=false;
      closedListener=()=>rejectPending(new Error('Socket closed before room admission'));
      created.onLeave(closedListener);
      return created;
    }
  }
  if(signal?.aborted)throw new Error('Room admission canceled');
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>rejectPending(new Error('Room handshake timed out')),timeoutMs);
  try {
    return await Promise.race([new AdmissionClient(endpoint).consumeSeatReservation(reservation),interrupted]);
  } catch(error) {
    if(room) {room.reconnection.enabled=false;room.connection?.close();}
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',abort);
    if(room&&closedListener)room.onLeave.remove(closedListener);
  }
}
