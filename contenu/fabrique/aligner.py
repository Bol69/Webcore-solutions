"""Trouve le début de chaque phrase du script dans la voix off, et écrit warp.json.

python3 aligner.py <voix.mp3> <script.txt> <scenes.json> <warp.json>

Méthode : on repère les pauses de la voix (ffmpeg silencedetect), puis on choisit,
parmi elles, les N-1 pauses qui séparent le mieux les N phrases. Le choix se fait par
programmation dynamique : chaque phrase doit durer à peu près en proportion de son
nombre de caractères, et on préfère couper sur les pauses longues.
"""
import json, re, subprocess, sys


def pauses(audio, db=-38, min_d=0.2):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', audio, '-af', f'silencedetect=n={db}dB:d={min_d}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', out)]
    en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', out)]
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio],
                               capture_output=True, text=True).stdout)
    gaps = [(s, e) for s, e in zip(st, en) if s > 0.05 and e < dur - 0.05]
    # début et fin réels de la parole
    first = en[0] if st and st[0] <= 0.05 else 0.0
    last = st[-1] if st and len(st) > len(en) else dur
    return gaps, first, last, dur


def align(lines, gaps, first, last):
    n = len(lines)
    w = [max(1, len(re.sub(r'\s', '', l))) for l in lines]
    tot = sum(w); speech = last - first
    # temps attendu du début de chaque phrase (proportionnel au texte)
    exp = [first + speech * sum(w[:i]) / tot for i in range(n)]
    m = len(gaps)
    if m < n - 1:
        raise SystemExit(f'Pas assez de pauses ({m}) pour {n} phrases : laisse une petite pause entre chaque phrase.')
    INF = float('inf')
    # dp[k][j] : meilleur coût avec la phrase k+1 qui commence à la pause j
    dp = [[INF] * m for _ in range(n)]; prev = [[-1] * m for _ in range(n)]

    def cost(k, j):
        s, e = gaps[j]
        return ((e - exp[k]) / speech) ** 2 * 40 - min(e - s, 0.6)  # écart au temps attendu, bonus pause longue
    for j in range(m):
        dp[1][j] = cost(1, j)
    for k in range(2, n):
        for j in range(m):
            best = INF
            for i in range(j):
                if dp[k - 1][i] < best:
                    best, prev[k][j] = dp[k - 1][i], i
            if best < INF:
                dp[k][j] = best + cost(k, j)
    j = min(range(m), key=lambda x: dp[n - 1][x]); idx = []
    for k in range(n - 1, 0, -1):
        idx.append(j); j = prev[k][j]
    idx.reverse()
    return [first] + [gaps[i][1] for i in idx]


def main():
    audio, script, scenes, out = sys.argv[1:5]
    lines = [l.strip() for l in open(script, encoding='utf8') if l.strip()]
    sc = json.load(open(scenes))
    if len(lines) != len(sc['starts']):
        raise SystemExit(f"{len(lines)} phrases dans le script mais {len(sc['starts'])} scènes.")
    gaps, first, last, dur = pauses(audio)
    starts = align(lines, gaps, first, last)
    lead = 0.15  # l'image arrive juste avant le mot
    knots = [[0, 0]] + [[round(max(0.05, s - lead), 3), o] for s, o in zip(starts[1:], sc['starts'][1:])]
    knots.append([round(max(dur, last) + sc.get('tail', 2.5), 3), sc['end']])
    json.dump(knots, open(out, 'w'))
    for l, s in zip(lines, starts):
        print(f'{s:6.2f} s  {l}')
    print(f'durée finale : {knots[-1][0]} s')


if __name__ == '__main__':
    main()
