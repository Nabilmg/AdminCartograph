# 3. Bubble Overlay Settings

Proportional circles drawn on top of the choropleth, sized by a
measure. Off by default — bind a measure to the **Bubble Size** data
role, then turn this card on.

## Show

| | |
|---|---|
| Type | Toggle |
| Default | Off |

Master switch. When off, no bubbles render even if **Bubble Size**
is bound.

## Fill color

| | |
|---|---|
| Type | Colour picker |
| Default | `#e6550d` (orange) |

The interior colour of every bubble. Bubbles are intentionally
mono-coloured — the choropleth handles per-area colour variation.

## Stroke color

| | |
|---|---|
| Type | Colour picker |
| Default | `#ffffff` (white) |

The outline colour. White stroke against an orange fill is the
default for visibility against any choropleth ramp.

## Stroke width

| | |
|---|---|
| Type | Number stepper |
| Default | 1 |
| Range | 0-5 (px) |

Outline thickness. 0 hides the outline entirely.

## Opacity

| | |
|---|---|
| Type | Number stepper |
| Default | 0.85 |
| Range | 0-1 |

Bubble fill opacity. Lower values let overlapping bubbles blend.

## Min radius (px)

| | |
|---|---|
| Type | Number stepper |
| Default | 4 |
| Range | 1-50 |

The size of the smallest bubble. Bubbles for the area with the
minimum **Bubble Size** value render at exactly this radius.

## Max radius (px)

| | |
|---|---|
| Type | Number stepper |
| Default | 30 |
| Range | 5-100 |

The size of the largest bubble.

## Label position vs bubble

| | |
|---|---|
| Type | Dropdown |
| Default | Above bubble |
| Options | Above, Below, Left, Right, Center |

Where the polygon's label sits relative to the bubble. The bubble
acts as the anchor; the label is offset by the bubble's radius plus
a small gap.

| Option | Effect |
|---|---|
| Above bubble | Label centred horizontally above the bubble |
| Below bubble | Label below |
| Left of bubble | Label to the left |
| Right of bubble | Label to the right |
| Center of bubble | Label inside (over) the bubble — best with bold or coloured text |

This setting only affects labels for polygons whose bubble is
visible. Polygons without a bubble (because they have no data, or
because **Bubble Size** is not bound) use the polygon's interior
centroid as the label anchor.

## How bubble sizing works

Square-root scaling: bubble *area* (not radius) is proportional to
the **Bubble Size** value. This matches human perception — we judge
size by area, not radius.

```
For a value v:
  if v == minValue:    radius = MinRadius
  if v == maxValue:    radius = MaxRadius
  else:                radius = MinRadius + (MaxRadius - MinRadius)
                                  * sqrt((v - minValue) / (maxValue - minValue))
```

So a bubble representing 4× the value of another renders at 2× the
radius and 4× the visible area.

## Layer order

```
choropleth fill
  ↓
Admin1 polygons (in Admin1 view)
  ↓
bubble layer  ← (you are here)
  ↓
glyph layer
  ↓
labels
```

Bubbles sit above the choropleth, so they're always visible over
the polygon fills regardless of fill opacity.

## Pointer events

Bubbles use `pointer-events: none`. Clicks fall through to the
polygon below — so clicking a bubble drills the underlying Admin1
or cross-filters the underlying Admin2, which is what users expect.

## Bubble legend

The proportional bubble layer has its own legend showing the size →
value mapping. See [Legend System: Bubble
legend](Legend-System.md#bubble-legend).

The legend offers three orientations:

| Orientation | Footprint |
|---|---|
| Vertical | Two nested concentric circles, ~50 px tall |
| Horizontal (3-4 bubbles) | Baseline-aligned series, ~150 px wide |
| Compact (min / max) | Smallest + largest with bracket, ~60 px wide |

## See also

- [Pie / Donut / Column Settings](Pie-Donut-Column-Settings.md) —
  the next overlay layer up the stack
- [Legend System](Legend-System.md) — how the bubble legend renders
- [Label Engine](Label-Engine.md) — what governs label rendering
