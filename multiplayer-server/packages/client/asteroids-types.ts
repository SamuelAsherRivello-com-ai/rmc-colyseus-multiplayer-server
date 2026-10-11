import type { AsteroidsInput, snapshot } from './asteroids-rules.js';
export type AsteroidsFrame = ReturnType<typeof snapshot>;
export interface AsteroidsPresence {players: {id: string;number: number;host: boolean}[];hostId: string;serial: number;capacity: number}
export interface AsteroidsCallbacks {onPresence?: ((value: AsteroidsPresence) => void) | undefined;onState?: ((value: AsteroidsFrame) => void) | undefined;onInput?: ((value: AsteroidsInput & {id: string;membership: number}) => void) | undefined;onEnded: (reason: string) => void;onStatus?: ((message: string | undefined) => void) | undefined}
export interface AsteroidsAdmission {id: string;code: string;token: string;host: boolean;generation: number;renewAfterMs: number}
