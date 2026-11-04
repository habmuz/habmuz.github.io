# Hogwarts Dash

A pixel-art runner through the floors of Hogwarts. Dodge falling stone, jump spikes and Monster Books, slide under crows and trolls, and catch Golden Snitches to unlock new wizards. 50,000 procedurally generated levels, with a treasure chest waiting at the end of the map.

**Play:** https://habmuz.github.io/

## Controls
| Key | Action |
|---|---|
| ↑ / W / Space | Jump |
| ↓ / S | Slide (in mid-air: drop fast) |
| Forward arrow | Dash (escape falling rocks) |
| Back arrow | Turn around at the stairs and climb |
| E / Shift | Cast Stupefy (once you own the wand) |
| Esc / P | Pause |

## Characters, accessories and pets
- **22 wizards** unlock as your lifetime snitch count grows: Hogwarts friends, the whole Weasley family and the Death Eaters.
- **Accessories** are bought with snitches from your wallet and protect you on every level: Sorting Hat (shield), Weasley Scarf (+1 heart), Gringotts Pouch, Time-Turner, Nimbus Broom (double jump) and the Stupefy Wand.
- **Pets** follow you through the castle: Trevor, Scabbers, the Bouncing Ferret, Crookshanks, Hedwig, the Serpent, Dobby and a Baby Dragon that breathes fire on obstacles.
- **Patronuses** (22 of them, the Hare is free) float beside you. **Dementors** glide in from level 20 and can't be jumped or slid past: double-click your wizard (or press Q, or double-tap on a phone) to cast your Patronus and drive them off.
- Watch out for the **werewolf** charging down the corridors from level 15.

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
