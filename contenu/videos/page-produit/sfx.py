"""Fabrique la piste de bruitages (sons synthétisés, libres de droits) calée sur la vidéo."""
import wave, sys
import numpy as np

SR = 48000
import json, os
K = json.load(open(os.environ['WARP'])) if os.environ.get('WARP') else None
DUR = K[-1][0] if K else 40.0
def unwarp(o):  # temps de l'animation -> temps de la voix
    if not K: return o
    for (a, b), (c, d) in zip(K, K[1:]):
        if o <= d: return a + (c - a) * (o - b) / (d - b)
    return K[-1][0]
rng = np.random.default_rng(7)
track = np.zeros((int(SR * DUR), 2))


def env(n, a=0.003, d=0.15):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)


def lp(x, k):  # passe-bas simple (moyenne glissante)
    return np.convolve(x, np.ones(k) / k, mode='same')


def pop(f0=520, f1=180, dur=0.12, g=0.5):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.025)
    return g * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, dur / 3.5)


def ding(f=1320, dur=0.9, g=0.32):
    n = int(SR * dur); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / (dur / (2.5 + m))) for m, a in [(1, 1), (2.76, .35), (5.4, .12)])
    return g * s * np.minimum(1, t / 0.002)


def click(g=0.35):
    n = int(SR * 0.03)
    x = rng.standard_normal(n) * env(n, 0.0005, 0.004)
    p = pop(2200, 1400, 0.03, 0.25); x = g * (x - lp(x, 6)); m = min(len(x), len(p)); x[:m] += p[:m]
    return x


def key(g=0.22):
    n = int(SR * 0.06)
    x = lp(rng.standard_normal(n), 3) * env(n, 0.0008, 0.012)
    p = pop(900, 500, 0.05, 0.12); x = g * x; x[:len(p)] += p
    return x


def whoosh(dur=0.45, g=0.22):
    n = int(SR * dur); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n); k0, k1 = 40, 6  # filtre qui s'ouvre puis se referme
    for i in range(0, n, 512):
        p = i / n; k = int(k0 + (k1 - k0) * np.sin(np.pi * p))
        out[i:i + 512] = lp(x[max(0, i - 64):i + 576], max(2, k))[64 if i else 0:][:len(out[i:i + 512])]
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return g * out * e


def thud(g=0.55):
    n = int(SR * 0.35); t = np.arange(n) / SR
    f = 55 + 90 * np.exp(-t / 0.04)
    return g * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.09) + 0.3 * click(0.4)[:n].sum() * 0


def tick(g=0.09):
    return pop(3000, 2400, 0.015, g)


def place(sig, at, pan=0.0):
    i = int(unwarp(at) * SR)
    if i >= len(track): return
    s = sig[:len(track) - i]
    track[i:i + len(s), 0] += s * (1 - max(0, pan))
    track[i:i + len(s), 1] += s * (1 + min(0, pan))


# --- cues (mêmes temps que l'animation) ---
place(whoosh(0.5, 0.18), 0.0)                       # entrée du perso
place(pop(600, 200, 0.13), 0.33, -0.3)              # carte visites
for k in range(18):                                  # compteur qui défile
    place(tick(), 0.45 + k * 0.085, -0.3)
place(pop(480, 160, 0.13), 0.93, 0.3)               # carte ventes
place(thud(), 2.2, 0.3)                             # "0 vente" tremble
for t in [4.5, 8, 12, 16, 20, 24, 27.5, 31, 35]:    # changement de titre
    place(whoosh(0.35, 0.10), t - 0.12)
place(whoosh(0.55, 0.2), 5.0, 0.4)                  # le téléphone arrive
steps = [8, 12, 16, 20, 24, 27.5]
for i, s in enumerate(steps):                       # chaque section apparaît
    place(pop(560 + i * 40, 200, 0.14, 0.55), s + 0.32, 0.3)
place(pop(760, 380, 0.1, 0.35), 13.35, 0.3)         # nouveau titre
place(pop(820, 420, 0.08, 0.3), 17.65, 0.3)         # livraison offerte
place(click(0.45), 24.65, 0.3)                      # bouton panier
notes = [1046, 1175, 1318, 1397, 1568, 1760]        # coches : gamme montante
for i, f in enumerate(notes):
    place(ding(f, 0.8, 0.22), 31.2 + i * 0.18, 0.3)
place(pop(500, 170, 0.16, 0.55), 35.35)             # carte CTA
for i in range(4):                                  # P A G E tapé
    place(key(), 36.3 + i * 0.22, 0.25)
place(ding(1568, 1.2, 0.28), 37.45, 0.25)           # envoyé

# niveau : laisser de la place pour la voix (crête ~ -9 dBFS)
peak = np.abs(track).max()
track *= (10 ** (float(os.environ.get('PEAK_DB', '-9')) / 20)) / peak
track = np.clip(track, -1, 1)
pcm = (track * 32767).astype('<i2')
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', sys.argv[1])
