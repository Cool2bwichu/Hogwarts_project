# Hogwarts · The Living Atlas

An explorable 3D atlas of Hogwarts and its grounds, laid out from J.K. Rowling's
annotated sketch of the grounds and what the seven novels actually say. Every
building carries its evidence, and an **accuracy lens** colours the world by
where each piece comes from: the books, Rowling's own notes, inference, the
atlas's interpretation, or the films.

An unofficial fan project. All descriptions are written in our own words.

## Running it

The atlas is plain HTML and ES modules with no build step. Browsers won't load
modules from `file://`, so serve the folder:

```sh
cd "Hogwarts Living Atlas"          # the folder with index.html in it
python3 -m http.server 8000 --bind 127.0.0.1
# then open http://localhost:8000
```

Start the server from inside the project folder: it shares whatever folder it
is started in, and `--bind 127.0.0.1` keeps it visible to your machine only.
Any static server works. Three.js loads from jsDelivr, so the page needs a
network connection and a browser with WebGL 2.

## Exploring

| Mode    | What it does |
| ------- | ------------ |
| Explore | Orbit the castle. Drag to turn, right-drag or Shift-drag to pan, scroll to zoom, double-click to fly somewhere. |
| Walk    | Eye level, 1.7 m. Drag to look, W A S D or arrows to walk, Shift to hurry. |
| Fly     | Free flight. W A S D to move, Q / E to sink and climb, scroll for speed. |
| Map     | A parchment plan of the grounds, with a floor switch for the rooms the books place inside the castle. |

On touch screens, Walk and Fly add an on-screen joystick.

The **Field guide** lists 28 places, each with its sources. The light button
(top right) sets the time of day and the weather. The options button (bottom
right) picks a detail tier: Smooth, Balanced, Cinematic or Maximum. Balanced and
above add lake reflections, bloom and grass.

## Layout of the code

```
index.html          styles and the interface shell
js/main.js          boot, frame loop, and the app API the interface calls
js/engine/          renderer and post-processing, sky, atmosphere (sun, moon,
                    colour grade), weather, camera rig, shared shader chunks
js/world/           layout.js holds every position and the terrain height
                    function; castle, grounds, terrain, water, vegetation,
                    grass and smaller features build from it
js/ui/              interface, labels, parchment map, icons, ambient sound
js/data/            places.js (the field guide and its evidence) and floors.js
js/workers/         off-thread grass density field
```

`js/world/layout.js` is the single source of truth for geography: the 3D world,
the parchment map, colliders and labels all read from it. One unit is one metre;
+x is east, −z is north.

## Debugging

`window.__atlas` exposes the app, renderer, camera rig and world objects.
`__atlas.tick(n)` renders `n` frames by hand, which is useful when the page sits
in a background tab or a headless browser. The detail tier is remembered in
`localStorage` under `hla.tier`.
