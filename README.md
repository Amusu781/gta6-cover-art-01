# gta6-cover-art-01

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Amusu781/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Amusu781/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Neon Palms Cover Studio — an offline web app that turns any photo and a caption into GTA 6-style cover art: six multi-panel poster layouts, five sunset and neon colour grades, bold Anton lettering with a Pacifico script subtitle, and PNG export in square, portrait, story and wide post sizes. Photos are read on your machine and never uploaded.

## Run it

```sh
python3 -m http.server 8080 --directory app
```

Then open http://localhost:8080 in a desktop browser. Load the samples with one click, or add your own photos, pick a layout and grade, drag to crop and position each panel, edit the caption, and export a PNG.

The entrypoint `main.ts` (Node 22, standard library only) hands the app in: it copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's `buildDossier` library.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=8a2dzbnc&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
