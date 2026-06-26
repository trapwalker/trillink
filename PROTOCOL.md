# Trillink Protocol v1

Binary protocol for transmitting short structured messages over any voice audio channel (GSM, VoIP, PTT/walkie-talkie, direct speaker→microphone).

---

## Design constraints

- Audio channel bandwidth: 300–3000 Hz (GSM AMR-NB, narrowband FM radio)
- Maximum GGWave frame payload: **28 bytes** (to remain reliable in slow/robust mode)
- All multi-byte integers: **big-endian**
- String encoding: **UTF-8** unless otherwise noted
- Protocol version: **1**

---

## 1. Frame format

Every transmitted unit is a Frame. GGWave wraps each Frame in its own sync preamble, FEC, and baseband encoding. The Frame is the payload passed to and received from GGWave.

```
 Byte  Bits     Field
 ────  ───────  ──────────────────────────────────────
  0    7..4     VER       — protocol version (currently 0x1)
  0    3..0     FLAGS     — see §1.1
  1    7..0     MSG_TYPE  — message type (see §2)
  2    7..4     SEG_IDX   — fragment index, 0-based  (meaningful only if FRAG=1)
  2    3..0     SEG_TOT   — total fragment count     (meaningful only if FRAG=1)
  3    7..0     PAYLOAD_LEN — length of PAYLOAD in bytes
  4..  —        PAYLOAD   — PAYLOAD_LEN bytes
  last 2 bytes  CRC16     — CRC-16/CCITT-FALSE, big-endian (see §5)
                            computed over bytes 0..(3 + PAYLOAD_LEN) inclusive
```

Total frame length: `6 + PAYLOAD_LEN` bytes.

### 1.1 FLAGS (4 bits, byte 0 bits 3..0)

| Bit | Mask | Name | Meaning |
|-----|------|------|---------|
| 0   | 0x01 | CONT | This message is a **continuation** (addendum) of the preceding logical message in the session |
| 1   | 0x02 | FRAG | This frame is one **fragment** of a multi-frame message; SEG_IDX/SEG_TOT are valid |
| 2   | 0x04 | —    | Reserved, must be 0 |
| 3   | 0x08 | —    | Reserved, must be 0 |

**CONT semantics:** The receiver maintains a "current context message" — the last non-CONT message received. Frames with CONT=1 extend that context (e.g., TEXT after GEO adds a caption). CONT and FRAG can both be set simultaneously (a multi-fragment continuation).

**FRAG semantics:** Fragments of the same logical message share identical MSG_TYPE, SEG_TOT, CONT, and VER. SEG_IDX runs 0..(SEG_TOT−1). The receiver buffers fragments and assembles when all SEG_TOT are received.

### 1.2 SEG_IDX / SEG_TOT (byte 2)

- Valid range for SEG_IDX: 0..14
- Valid range for SEG_TOT: 1..15
- Max fragments per message: 15
- Max logical message payload: 15 × 22 = **330 bytes**
- When FRAG=0: byte 2 should be 0x00 (ignored by receiver)

---

## 2. Message types

### MSG_TYPE values

| Value | Name    | Status    |
|-------|---------|-----------|
| 0x01  | GEO     | MVP       |
| 0x02  | CONTACT | MVP       |
| 0x03  | TEXT    | MVP       |
| 0x04  | RADIO   | planned   |
| 0x05  | WIFI    | planned   |
| 0x06  | URL     | planned   |
| 0x07  | POI     | planned   |
| 0x08  | ROUTE   | planned   |
| 0x09  | BEACON  | planned   |
| 0x0A  | TIME    | MVP       |

---

### 2.1 GEO — geographic position

PAYLOAD: **10 bytes**

```
Bytes  Type    Field
─────  ──────  ─────────────────────────────────────────────────────
0..3   int32   lat  — latitude  × 1 000 000  (range: −90 000 000..+90 000 000)
4..7   int32   lon  — longitude × 1 000 000  (range: −180 000 000..+180 000 000)
8..9   int16   alt  — altitude in meters above MSL; 0x7FFF = absent
```

Coordinate precision: ~0.11 m at equator.

CONT use: GEO with CONT=1 adds a waypoint to a ROUTE context, or refines a POI context.

---

### 2.2 CONTACT — contact information

PAYLOAD: **2–22 bytes**

```
Bytes  Type    Field
─────  ──────  ────────────────────────────────────────
0      uint8   contact_type
               0x01 = PHONE    (E.164: "+79161234567")
               0x02 = EMAIL
               0x03 = CALLSIGN (amateur/CB radio)
               0x04 = HANDLE   (nickname)
1..    bytes   value — UTF-8 string, remaining bytes (no NUL terminator)
```

For PHONE: value must be E.164 format including leading `+`.
Max value length: 21 bytes.

---

### 2.3 TEXT — arbitrary text

PAYLOAD: **2–22 bytes per fragment**

```
Bytes  Type    Field
─────  ──────  ────────────────────────────────────
0      uint8   encoding: 0x00 = UTF-8
1..    bytes   text — encoded string, remaining bytes
```

Long text: set FRAG=1, split `text` bytes into up to 15 fragments of ≤21 bytes each.
Fragment reassembly is ordered by SEG_IDX.
CONT=1 on TEXT attaches the assembled text to the current context message.

---

### 2.4 RADIO — radio channel parameters

PAYLOAD: **7 bytes**

```
Bytes  Type    Field
─────  ──────  ────────────────────────────────────────────────────────────
0..3   uint32  freq_hz — carrier frequency in Hz (20 000 000..2 400 000 000)
4      uint8   mode
               0x00 = FM    0x01 = AM    0x02 = NFM
               0x03 = USB   0x04 = LSB
               0x05 = DMR   0x06 = D-STAR  0x07 = C4FM  0x08 = P25
5..6   uint16  ctcss_x10 — CTCSS tone × 10 (e.g. 1318 = 131.8 Hz)
                           0x0000 = absent / carrier squelch
                           0xFFFF = DCS (code in future extension)
```

Step (channel raster) and DCS code: deferred to protocol v2.

---

### 2.5 WIFI — Wi-Fi credentials

PAYLOAD: **3–22 bytes per fragment**

```
Bytes  Type    Field
─────  ──────  ────────────────────────────────────────────
0      uint8   security: 0=open 1=WEP 2=WPA/WPA2 3=WPA3
1      uint8   ssid_len
2..    bytes   ssid (ssid_len bytes, UTF-8)
next   uint8   pass_len
next.. bytes   password (pass_len bytes, UTF-8)
```

If total payload > 22 bytes: set FRAG=1 and split starting from byte 0.
Fragment boundary may fall inside a field; reassemble before parsing.

---

### 2.6 URL — hyperlink

PAYLOAD: **1–22 bytes per fragment**

```
Bytes  Type    Field
─────  ──────  ────────────────────
0..    bytes   url — UTF-8 string, entire payload
```

Long URL: FRAG=1, split URL bytes across fragments.
CONT=1 on URL attaches it to the current context (e.g., BEACON metadata).

---

### 2.7 POI — point of interest

PAYLOAD: **10 or 14 bytes**

```
Bytes  Type    Field
─────  ──────  ────────────────────────────────────────────────────
0..3   int32   lat    — degrees × 1 000 000
4..7   int32   lon    — degrees × 1 000 000
8..9   int16   alt    — meters (0x7FFF = absent)
10..13 uint32  poi_id — local/global identifier (0x00000000 = absent)
```

If PAYLOAD_LEN == 10: poi_id is absent. If == 14: poi_id is present.
CONT=1 on following TEXT adds metadata to this POI.

---

### 2.8 ROUTE — route (navigation)

PAYLOAD: **8 or 16 bytes**

```
Bytes  Type    Field
─────  ──────  ──────────────────────────────────────────────────────
0..3   int32   dest_lat  — destination latitude  × 1 000 000
4..7   int32   dest_lon  — destination longitude × 1 000 000
8..11  int32   orig_lat  — origin latitude  × 1 000 000 (0x7FFFFFFF = absent)
12..15 int32   orig_lon  — origin longitude × 1 000 000 (0x7FFFFFFF = absent)
```

If PAYLOAD_LEN == 8: origin absent. If == 16: origin present.
Waypoints: transmitted as separate GEO or POI frames with CONT=1 following the ROUTE frame.

---

### 2.9 BEACON — device/entity identifier

PAYLOAD: **16 bytes**

```
Bytes  Type    Field
─────  ──────  ─────────────────────────────────────
0..15  bytes   guid — 16-byte UUID (RFC 4122 v4, big-endian)
```

CONT=1 on following TEXT or URL attaches metadata to this BEACON.

---

### 2.10 TIME — timestamp

PAYLOAD: **6 bytes**

```
Bytes  Type    Field
─────  ──────  ──────────────────────────────────────────────────────────
0..3   uint32  unix_ts    — seconds since 1970-01-01T00:00:00Z
4..5   int16   tz_offset  — minutes offset from UTC (e.g. +180 = UTC+3)
```

---

## 3. Cyclic transmission protocol

The sender transmits a **Session** — an ordered list of Frames — repeatedly in cycles until stopped by the operator or a configured cycle count is reached.

### 3.1 Session structure

```
Session = [Frame_0, Frame_1, ..., Frame_N]
```

Frames are ordered logically: primary messages first, then continuations and fragments.

### 3.2 Transmission cycle

```
Cycle:
  1. [PTT/walkie-talkie only] Play CARRIER TONE for 600–800 ms
     — Sine wave at 1500 Hz, −12 dBFS, to open remote squelch and activate VOX
  2. For each Frame in Session:
       a. Encode Frame via GGWave
       b. Play resulting audio
       c. Wait INTER_FRAME_GAP (default: 200 ms silence)
  3. Wait INTER_CYCLE_GAP (default: 1500 ms silence)
  4. Repeat from step 1
```

### 3.3 Receiver behaviour

The receiver runs a continuous decode loop:

1. GGWave detects sync preamble → emit `signal-detected`
2. GGWave decodes frame bytes → validate CRC16
3. CRC fail → emit `frame-error`, discard
4. CRC pass → process frame (see §3.4), emit `frame-received`
5. Duplicate frame (same MSG_TYPE + SEG_IDX already received with valid CRC) → discard silently

### 3.4 Frame processing

```
if FRAG == 0:
    emit message-ready for this frame immediately

if FRAG == 1:
    buffer fragment under key (MSG_TYPE, SEG_TOT, CONT)
    if all SEG_TOT fragments received:
        reassemble payload by SEG_IDX order
        emit message-ready for reassembled message

when message-ready emitted:
    if CONT == 0:
        update session.context = this message
    if CONT == 1:
        attach this message to session.context
        emit context-updated
```

### 3.5 Session context

The receiver maintains a `SessionContext` per active session:

```typescript
interface SessionContext {
  primary: TrilinkMessage | null;          // last non-CONT message
  continuations: TrilinkMessage[];         // CONT messages attached to primary
  fragments: Map<string, FragmentBuffer>;  // buffered fragments by (type,tot,cont)
  received: Set<string>;                  // dedup keys of completed messages
}
```

Context is reset when `receiver.reset()` is called or a new session is explicitly started.

---

## 4. Fragment reassembly rules

- All fragments of one logical message share: `MSG_TYPE`, `SEG_TOT`, `CONT` bit.
- The dedup/grouping key is: `${MSG_TYPE}:${SEG_TOT}:${CONT}`.
- If a session contains two unrelated TEXT messages (e.g., caption for GEO then caption for ROUTE), they must be transmitted in separate cycles with a context separator, or differentiated by CONT value relative to their parent. **Note:** disambiguating multiple same-type messages in one session is a known limitation of v1; addressed in v2 via a SESSION_SEQ field.
- Fragments must arrive within a configurable timeout (`fragmentTimeoutMs`, default 30 000 ms). On timeout, emit `fragment-timeout`.

---

## 5. CRC-16/CCITT-FALSE specification

| Parameter    | Value  |
|-------------|--------|
| Polynomial  | 0x1021 |
| Initial     | 0xFFFF |
| RefIn       | false  |
| RefOut      | false  |
| XorOut      | 0x0000 |
| Check value | 0x29B1 (for ASCII string "123456789") |

CRC is computed over the entire frame **excluding** the CRC bytes themselves:
`CRC16(frame[0 .. 3+PAYLOAD_LEN])`

Transmitted big-endian: high byte first.

---

## 6. GGWave configuration

### Mode selection

| Channel type         | Recommended GGWave mode   | Notes |
|---------------------|--------------------------|-------|
| Direct (same room)  | `AUDIBLE_FAST`           | Best speed |
| VoIP (Telegram etc) | `AUDIBLE`                | Balanced |
| GSM phone call      | `AUDIBLE` or `MT_FASTEST`| Test both |
| Walkie-talkie PTT   | `AUDIBLE` (slow default) | + carrier preamble |

### Frequency constraints

All target channels: usable range ~300–3000 Hz.
GGWave `AUDIBLE` default: ~1400–2100 Hz → **within range**.
Do not use `ULTRASONIC` or `ULTRASONIC_FAST` modes.

### Carrier preamble (PTT only)

Before the first frame in each cycle, play a sine wave tone:
- Frequency: 1500 Hz
- Amplitude: −6 dBFS
- Duration: 600–800 ms
- Purpose: open squelch, activate VOX, allow AGC to settle

This tone must be played via the same audio output that feeds the radio mic.

---

## 7. Known v1 limitations (deferred to v2)

- No session ID: receiver cannot distinguish two independent simultaneous sessions
- No sender identification field in frame (use CONTACT with CONT=1 as convention)
- DCS code for RADIO type not encodable
- Max 15 fragments per message (~330 bytes logical payload)
- No explicit ACK/NACK (receiver cannot request retransmission; relies on cyclic repetition)
- SESSION_SEQ to differentiate multiple same-type non-CONT messages in one session
