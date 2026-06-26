export class TrilinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class CrcError extends TrilinkError {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`CRC mismatch: expected 0x${expected.toString(16).padStart(4, '0')}, got 0x${actual.toString(16).padStart(4, '0')}`);
  }
}

export class VersionError extends TrilinkError {
  constructor(public readonly version: number) {
    super(`Unsupported protocol version: ${version}`);
  }
}

export class TruncatedError extends TrilinkError {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`Frame truncated: expected ${expected} bytes, got ${actual}`);
  }
}

export class PayloadError extends TrilinkError {}
