import type { MessageType, TrilinkFrame, TrilinkMessage } from '@trillink/protocol';

export type SenderEvent =
  | { type: 'cycle-start'; cycle: number; total: number }
  | { type: 'frame-sent'; frame: TrilinkFrame; cycle: number }
  | { type: 'cycle-complete'; cycle: number }
  | { type: 'transmission-complete' }
  | { type: 'aborted' };

export type ReceiverEvent =
  | { type: 'listening' }
  | { type: 'signal-detected' }
  | { type: 'frame-received'; frame: TrilinkFrame }
  | { type: 'frame-error'; reason: 'crc' | 'version' | 'truncated' | 'unknown' }
  | { type: 'fragment-received'; msgType: MessageType; segIdx: number; segTotal: number }
  | { type: 'fragment-timeout'; msgType: MessageType; received: number; total: number }
  | { type: 'message-ready'; message: TrilinkMessage; isCont: boolean; sessionId: number }
  | { type: 'context-updated'; context: TrilinkMessage; continuation: TrilinkMessage };
