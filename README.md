# Hogwarts Dash

A pixel-art runner through the floors of Hogwarts. Dodge falling stone, jump spikes and Monster Books, slide under crows and trolls, and catch Golden Snitches to unlock new wizards. 50,000 procedurally generated levels, with a treasure chest waiting at the end of the map.

**Play:** https://habmuz.github.io/hogwarts-dash/

## Controls
| Key | Action |
|---|---|
| ↑ / W / Space | Jump |
| ↓ / S | Slide (in mid-air: drop fast) |
| Forward arrow | Dash (escape falling rocks) |
| Back arrow | Turn around at the stairs and climb |
| Esc / P | Pause |

On touch screens, swipe in the same directions (tap to jump).

## Running locally
No build step — open `index.html`, or serve the folder:
```
python3 -m http.server 8765
```

## Project layout
- `js/levels.js` — level generator and difficulty curve
- `js/game.js` — physics, obstacles and canvas rendering
- `js/ui.js` — level map, wardrobe, results, input, save data
- `js/audio.js` — chiptune sound effects and music
- `assets/atlas.png` — sprite atlas

Fan project, not affiliated with Warner Bros. or J.K. Rowling.
