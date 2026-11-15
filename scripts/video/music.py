"""[AI-assisted: written with Claude, reviewed by the team.]
Original 30 s soundtrack for the demo video, synthesized from scratch (no samples, no
third-party audio): 120 BPM, D minor. Cues follow the shot plan (scripts/video/plan.js):
  0-4   drone + pad open up, reverse swell -> 4.0 boom + glass bell
  4-9   half-time kick, ticking hats, bass pulse from 6.0, tom fill 8-9
  9-14  arpeggio rises, snare roll + riser, short silence at 13.8
  14    DROP: kick, sub, wide chord, crash; driving groove; stabs at 17, 20, 22
  24    drums out: pad, high string, bell at 26, swell
  28    final chord + boom + bell, long tail to silence
usage: python music.py <out.wav>
"""
import sys

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)
BEAT = 0.5  # 120 BPM


def t_(d):
    return np.arange(int(d * SR)) / SR


def hz(note):
    """MIDI note number -> Hz."""
    return 440.0 * 2 ** ((note - 69) / 12)


def add(sig, at, gain=1.0, pan=0.0):
    """Mix a mono (or (2, n) stereo) signal in at time `at` s, equal-power pan -1..1."""
    i = int(at * SR)
    if i >= N:
        return
    if sig.ndim == 1:
        a = np.cos((pan + 1) * np.pi / 4)
        b = np.sin((pan + 1) * np.pi / 4)
        sl, sr_ = sig * a, sig * b
    else:
        sl, sr_ = sig[0], sig[1]
    n = min(len(sl), N - i)
    L[i:i + n] += sl[:n] * gain
    R[i:i + n] += sr_[:n] * gain


def filt(x, kind, f, order=2):
    sos = butter(order, np.clip(np.asarray(f) / (SR / 2), 1e-4, 0.999), btype=kind, output="sos")
    return sosfilt(sos, x)


def sweep_lp(x, f0, f1, curve=2.0):
    """Lowpass whose cutoff sweeps f0 -> f1 (block-wise)."""
    out = np.zeros_like(x)
    B = 2048
    nb = (len(x) + B - 1) // B
    zi = None
    for k in range(nb):
        f = f0 * (f1 / f0) ** ((k / max(1, nb - 1)) ** (1 / curve))
        sos = butter(2, min(f, SR * 0.45) / (SR / 2), output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[k * B:(k + 1) * B], zi = sosfilt(sos, x[k * B:(k + 1) * B], zi=zi)
    return out


def env(n, a, r, hold=0.0):
    """attack a s, hold, exponential-ish release r s."""
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na) ** 1.5
    nh = na + int(hold * SR)
    tail = np.arange(n - nh) / SR
    e[nh:] = np.exp(-tail / max(r, 1e-3))
    return e


def saw(f, tt, phase=0.0):
    return 2 * ((f * tt + phase) % 1.0) - 1


def supersaw(notes, d, detune=0.12, voices=5):
    tt = t_(d)
    l = np.zeros(len(tt))
    r = np.zeros(len(tt))
    for note in notes:
        for v in range(voices):
            dv = (v - (voices - 1) / 2) / ((voices - 1) / 2)
            f = hz(note) * 2 ** (dv * detune / 12)
            s = saw(f, tt, rng.random())
            if dv <= 0:
                l += s * (1 - 0.4 * dv)
            if dv >= 0:
                r += s * (1 + 0.4 * dv)
    k = 1 / (len(notes) * voices)
    return np.stack([l * k, r * k])


def reverb_ir(seconds=3.2, bright=6000):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    irs = []
    for _ in range(2):
        noise = rng.standard_normal(n) * np.exp(-tt * 6.9 / seconds)
        irs.append(filt(noise, "low", bright))
    ir = np.stack(irs)
    return ir / np.abs(ir).sum(axis=1, keepdims=True) * 6


# ---------------------------------------------------------------- instruments
def kick(gain=1.0):
    tt = t_(0.7)
    f = 45 + 95 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt * 6.5)
    click = filt(rng.standard_normal(len(tt)), "high", 2500) * np.exp(-tt * 250) * 0.3
    return np.tanh((body + click) * 1.6) * gain


def boom(gain=1.0):
    tt = t_(3.5)
    f = 32 + 70 * np.exp(-tt * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt * 1.3)
    thud = filt(rng.standard_normal(len(tt)), "low", 180) * np.exp(-tt * 9) * 0.8
    return np.tanh((body + thud) * 1.3) * gain


def hat(open_=False):
    tt = t_(0.35 if open_ else 0.06)
    x = filt(rng.standard_normal(len(tt)), "high", 7500) * np.exp(-tt * (12 if open_ else 70))
    return x * 0.5


def snare():
    tt = t_(0.35)
    tone = np.sin(2 * np.pi * 185 * tt) * np.exp(-tt * 25) * 0.6
    noise = filt(rng.standard_normal(len(tt)), "band", [1200, 8000]) * np.exp(-tt * 14)
    return np.tanh((tone + noise) * 1.2) * 0.6


def tom(note):
    tt = t_(0.45)
    f = hz(note) * (1 + 0.5 * np.exp(-tt * 30))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7) * 0.7


def bell(note, d=4.0):
    """FM glass bell."""
    tt = t_(d)
    fc = hz(note)
    mod = np.sin(2 * np.pi * fc * 3.5 * tt) * (2.2 * np.exp(-tt * 2.5))
    car = np.sin(2 * np.pi * fc * tt + mod)
    car += 0.35 * np.sin(2 * np.pi * fc * 2.01 * tt) * np.exp(-tt * 1.8)
    return car * np.exp(-tt * 1.1) * env(len(tt), 0.002, 99) * 0.35


def crash(d=3.0):
    tt = t_(d)
    x = filt(rng.standard_normal(len(tt)), "high", 4000) * np.exp(-tt * 1.6)
    return np.stack([x, filt(rng.standard_normal(len(tt)), "high", 4000) * np.exp(-tt * 1.6)]) * 0.28


def pluck(note, d=0.22, bright=5000):
    tt = t_(d)
    x = saw(hz(note), tt) * 0.6 + np.sign(np.sin(2 * np.pi * hz(note) * tt)) * 0.25
    x = filt(x, "low", bright) * np.exp(-tt * 14)
    return x * 0.35


def sub(note, d, a=0.01, r=0.25):
    tt = t_(d)
    x = np.sin(2 * np.pi * hz(note) * tt) + 0.15 * np.sin(4 * np.pi * hz(note) * tt)
    return np.tanh(x * 1.4) * env(len(tt), a, r, hold=max(0, d - a - r * 2)) * 0.55


def riser(d, f0=300, f1=9000):
    n = int(d * SR)
    x = sweep_lp(rng.standard_normal(n), f0, f1, curve=1.0)
    e = np.linspace(0, 1, n) ** 2.2
    return np.stack([x * e, sweep_lp(rng.standard_normal(n), f0, f1, curve=1.0) * e]) * 0.35


def rev_cymbal(d):
    c = crash(d)[:, ::-1]
    return c * 0.9


# ---------------------------------------------------------------- arrangement
# D minor: Dm  Bb  F  C   (two bars each where used)
CH = {
    "Dm": [50, 57, 62, 65, 69],
    "Bb": [46, 58, 62, 65, 70],
    "F": [53, 57, 60, 65, 72],
    "C": [48, 55, 60, 64, 67],
    "Gm": [43, 55, 58, 62, 67],
}
ROOT = {"Dm": 38, "Bb": 34, "F": 41, "C": 36, "Gm": 31}

wet_bus_L = np.zeros(N)
wet_bus_R = np.zeros(N)


def add_wet(sig, at, gain, send=0.5, pan=0.0):
    """Mix dry plus a reverb send."""
    global L, R
    add(sig, at, gain * (1 - send * 0.5), pan)
    keepL, keepR = L.copy(), R.copy()
    L[:] = 0
    R[:] = 0
    add(sig, at, gain * send, pan)
    wet_bus_L[:] += L
    wet_bus_R[:] += R
    L[:], R[:] = keepL, keepR


# 0-4: drone + pad opening up, reverse swell into 4.0
pad = supersaw(CH["Dm"], 4.6, detune=0.18)
pad = np.stack([sweep_lp(pad[0], 200, 2200), sweep_lp(pad[1], 200, 2200)])
pad *= env(pad.shape[1], 2.5, 0.8, hold=1.4)
add_wet(pad, 0.0, 0.55, send=0.7)
add_wet(sub(26, 4.4, a=2.5, r=0.6), 0.0, 0.45, send=0.1)
add_wet(rev_cymbal(1.8), 2.2, 0.8, send=0.4)

# 4.0: boom + bell (motif)
add_wet(boom(), 4.0, 0.9, send=0.3)
add_wet(bell(74), 4.0, 0.8, send=0.8, pan=-0.15)
add_wet(bell(81, 3.0), 4.02, 0.35, send=0.9, pan=0.3)

# 4-9: half-time groove, ticking hats (the "clock" of the time-lapse), bass pulse from 6
pad2 = supersaw(CH["Dm"] + [72], 5.2, detune=0.14)
pad2 = np.stack([filt(pad2[0], "low", 1800), filt(pad2[1], "low", 1800)]) * env(pad2.shape[1], 0.6, 0.6, hold=3.6)
add_wet(pad2, 4.0, 0.42, send=0.6)
for k in range(5):
    add_wet(kick(), 4.0 + k * 1.0, 0.85, send=0.08)
for k in range(20):
    tt = 4.0 + k * 0.25
    add_wet(hat(), tt, 0.45 if k % 2 else 0.25, send=0.15, pan=0.35 if k % 2 else -0.35)
for k in range(12):
    tt = 6.0 + k * 0.25
    add_wet(sub(38 if k < 8 else 34, 0.22, r=0.06), tt, 0.5, send=0.05)
for k, n in enumerate([50, 47, 45, 43, 41, 38]):
    add_wet(tom(n), 8.0 + k * 0.16, 0.7, send=0.3, pan=0.5 - k * 0.2)

# 9-14: Bb -> C with a rising 1/16 arpeggio, strings swell, snare roll + riser, silence at 13.8
for seg, ch, d in [(9.0, "Bb", 2.5), (11.5, "C", 2.3)]:
    s = supersaw(CH[ch], d + 0.4, detune=0.16)
    s = np.stack([filt(s[0], "low", 3000), filt(s[1], "low", 3000)]) * env(s.shape[1], 0.5, 0.3, hold=d - 0.9)
    add_wet(s, seg, 0.4, send=0.6)
    add_wet(sub(ROOT[ch], d, r=0.2), seg, 0.45, send=0.05)
arp_notes = [62, 65, 70, 74, 77, 74, 70, 65]
for k in range(38):
    tt = 9.0 + k * 0.125
    if tt >= 13.8:
        break
    oct_ = 12 if k >= 20 else 0
    n = (arp_notes if tt < 11.5 else [60, 64, 67, 72, 76, 72, 67, 64])[k % 8] + oct_
    add_wet(pluck(n, bright=2500 + k * 120), tt, 0.5 + k * 0.01, send=0.35, pan=0.4 * np.sin(k * 0.8))
for k in range(20):
    tt = 12.5 + k * (1.3 / 20)
    add_wet(snare(), tt, 0.15 + 0.5 * k / 20, send=0.2)
add_wet(riser(1.3), 12.5, 0.9, send=0.3)
# hard stop for the 0.2 s gap before the drop
gap0, gap1 = int(13.8 * SR), int(14.0 * SR)

# 14: DROP -- wide chord, sub, crash; driving groove until 24
for seg, ch in [(14.0, "Dm"), (16.0, "Bb"), (18.0, "F"), (20.0, "C"), (22.0, "Gm")]:
    s = supersaw(CH[ch] + [CH[ch][2] + 12], 2.3, detune=0.2, voices=7)
    s = np.stack([filt(s[0], "low", 5200), filt(s[1], "low", 5200)]) * env(s.shape[1], 0.02, 0.4, hold=1.4)
    add_wet(s, seg, 0.55, send=0.45)
    for k in range(8):  # pumping bass, 1/8
        add_wet(sub(ROOT[ch] - (12 if seg >= 22 else 0) + 12, 0.24, r=0.08), seg + k * 0.25, 0.42, send=0.03)
add_wet(crash(3.5), 14.0, 1.0, send=0.4)
add_wet(boom(), 14.0, 0.8, send=0.2)
for k in range(40):
    tt = 14.0 + k * 0.25
    beat = k % 4
    if beat in (0,) or (k % 8 == 6):
        add_wet(kick(), tt, 0.95, send=0.05)
    if beat == 2:
        add_wet(snare(), tt, 0.75, send=0.25)
    add_wet(hat(open_=(k % 8 == 7)), tt + 0.125, 0.3, send=0.15, pan=0.3)
    add_wet(hat(), tt, 0.18, send=0.1, pan=-0.3)
# ticks under the count-up 15-17
for k in range(32):
    add_wet(pluck(86, d=0.06, bright=9000), 15.0 + k * 0.0625, 0.12 + 0.2 * k / 32, send=0.2, pan=0.2)
# stabs: 17 (87 %), 20 (Earth), 22 (night)
for tt, n in [(17.0, 74), (20.0, 72), (22.0, 67)]:
    add_wet(bell(n, 2.0), tt, 0.6, send=0.6)
    add_wet(supersaw([n - 12, n - 5, n], 0.4, voices=5) * env(int(0.4 * SR), 0.005, 0.12), tt, 0.5, send=0.5)
for tt in (20.0, 22.0):
    add_wet(boom(), tt, 0.45, send=0.2)

# 24-28: breakdown -- pad, high string, bell at 26 as Earth clears the horizon, swell into 28
s = supersaw(CH["Bb"] + [81], 4.3, detune=0.15)
s = np.stack([filt(s[0], "low", 2400), filt(s[1], "low", 2400)]) * env(s.shape[1], 0.8, 0.5, hold=2.8)
add_wet(s, 24.0, 0.42, send=0.75)
add_wet(sub(34, 4.0, a=1.5, r=0.5), 24.0, 0.4, send=0.1)
tt = t_(4.0)
string = np.sin(2 * np.pi * hz(86) * tt + 0.004 * np.sin(2 * np.pi * 5.2 * tt) * 40) * env(len(tt), 1.6, 0.6, hold=1.5) * 0.12
add_wet(string, 24.0, 1.0, send=0.8, pan=0.2)
add_wet(bell(74), 26.0, 0.85, send=0.85, pan=-0.1)
add_wet(bell(81, 3.0), 26.02, 0.35, send=0.9, pan=0.3)
add_wet(riser(2.0, 200, 6000), 26.0, 0.5, send=0.4)

# 28: final hit and tail
s = supersaw(CH["Dm"] + [74, 81], 2.0, detune=0.2, voices=7)
s = np.stack([filt(s[0], "low", 4000), filt(s[1], "low", 4000)]) * env(s.shape[1], 0.01, 0.55)
add_wet(s, 28.0, 0.6, send=0.8)
add_wet(boom(), 28.0, 1.0, send=0.35)
add_wet(bell(74, 2.0), 28.0, 0.9, send=0.9)
add_wet(crash(2.0), 28.0, 0.7, send=0.5)

# ---------------------------------------------------------------- mix
ir = reverb_ir()
wl = fftconvolve(wet_bus_L, ir[0])[:N]
wr = fftconvolve(wet_bus_R, ir[1])[:N]
mixL, mixR = L + wl, R + wr
mixL[gap0:gap1] *= np.linspace(1, 0, gap1 - gap0) ** 4
mixR[gap0:gap1] *= np.linspace(1, 0, gap1 - gap0) ** 4
# gentle master: low cut, glue, soft clip, fade the very end
mixL, mixR = filt(mixL, "high", 25), filt(mixR, "high", 25)
peak = max(np.abs(mixL).max(), np.abs(mixR).max())
mixL, mixR = mixL / peak * 1.25, mixR / peak * 1.25
mixL, mixR = np.tanh(mixL), np.tanh(mixR)
fade = np.ones(N)
fe = int(29.0 * SR)
fade[fe:] = np.linspace(1, 0, N - fe) ** 2
fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
out = np.stack([mixL * fade, mixR * fade], axis=1) * 0.89
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else "music.wav", SR, (out * 32767).astype(np.int16))
print("wrote", sys.argv[1] if len(sys.argv) > 1 else "music.wav")
