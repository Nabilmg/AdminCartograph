# 14. Map Controls and Navigation

The controls panel — zoom, pan, and export buttons that live on the
canvas itself. All off by default; turn on the bits you want from
the Map controls card.

## Settings

### Show zoom buttons

| | |
|---|---|
| Type | Toggle |
| Default | Off |

When on, two small buttons appear in the controls panel:

- **+** zooms in by 1.25× per click
- **−** zooms out by 1 / 1.25 per click

Zoom range is clamped to **[1×, 8×]**.

The **↻ reset** button has its own visibility rules — see
[Reset](#reset) below — and appears regardless of this toggle.

### Show pan buttons

| | |
|---|---|
| Type | Toggle |
| Default | Off |

When on, a 3-row directional pad appears:

```
        [▲]
    [◀]   [▶]
        [▼]
```

Each click pans by a viewport-proportional step that **tightens at
higher zoom levels** so you keep fine control while magnified.

### Show export button (SVG)

| | |
|---|---|
| Type | Toggle |
| Default | Off |

When on, an **SVG** button appears in the controls panel. Clicking
it opens a modal with the visual's full SVG source in a textarea —
select-all and press Ctrl/Cmd + C to copy. There is no PNG button
and no automatic download: Power BI's iframe blocks both reliably,
so the manual-copy modal is the only path that always works.

See [SVG Export](PNG-and-SVG-Export.md) for the full flow and
saving-to-a-file tips.

### Position

| | |
|---|---|
| Type | Dropdown |
| Default | Top right |
| Options | Top left, Top right, Bottom left, Bottom right |

Where the controls panel sits on the canvas.

> **Top left** is special: the panel sits at `top: 80px` instead
> of `top: 8px`, so it doesn't collide with the drilled-state
> Admin1 pill (which anchors at top-left). Other positions sit
> 8 px from their edge.

## Mouse interactions

In addition to the buttons, the visual responds to mouse gestures:

### Drag to pan

When zoomed in (`zoomLevel > 1`), click-and-drag inside the visual
pans the map content. Cursor changes to ✋ (`grab`) when the cursor
is over the visual at >1× zoom, ✊ (`grabbing`) during a drag.

The click that ends a drag is consumed (a `didDrag` flag is set if
the cursor moved more than 3 px during the drag), so dragging
never accidentally drills into an Admin1.

### Mouse wheel to zoom

Mouse wheel zooms in / out by **1.15×** per tick. `preventDefault`
stops the surrounding Power BI report from scrolling when you wheel
over the visual.

When zoom returns to **1×**, pan offsets snap back to (0, 0) so
the map re-centres cleanly.

## Reset

Three ways to reset zoom + pan:

1. The **↻** button (visible only after zoom or pan).
   Independent of **Show zoom buttons** — it appears whenever
   `zoomLevel > 1` or `panX/Y != 0`, even if the +/- buttons are
   disabled. So users who only zoom/pan via wheel and drag can
   still reset cleanly.
2. Mouse-wheel zoom-out past 1× (auto-clamps to 1× and resets pan).
3. Set Country to a different value in the format pane (full
   re-render).

## How zoom + pan are applied

Both are applied as a single SVG transform on `mapGroup`, the SVG
group that holds choropleth + bubbles + glyphs + labels (but not
legends or scale bar):

```
translate(cx + panX, cy + panY) scale(z) translate(-cx, -cy)
```

Where `(cx, cy)` is the viewport centre. This zooms around the
centre and then offsets by the pan delta.

Legends and the scale bar live in **sibling** SVG groups outside
`mapGroup`, so they don't scale with zoom — they stay at constant
size and constant corner position.

## Pointer events on overlay buttons

The controls panel uses `pointer-events: none` on the panel itself
(so clicks on its empty area pass through to the map), with each
button overriding to `pointer-events: auto`. This way the panel
doesn't block map interaction in its margin areas.

## Accessibility

Every button has an `aria-label` describing its action. The buttons
are real `<button>` elements so they're keyboard-focusable; pressing
Enter or Space activates them. When focused, an outline appears.

## See also

- [SVG Export](PNG-and-SVG-Export.md)
- [Scale Bar](Scale-Bar.md)
- [View Modes and Drill](View-Modes-and-Drill.md)
