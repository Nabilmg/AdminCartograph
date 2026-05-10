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
| Type | Colour picker (with **fx** conditional formatting) |
| Default | `#e6550d` (orange) |

The interior colour of every bubble. Click the small **fx** button
next to the swatch to bind the colour to a measure rule (gradient,
rules, or field value) — the rule resolves per Admin1 area in country
view and per Admin2 area in drill view, so e.g. *red if cases > 1000,
green otherwise* "just works" at both levels.

When fx is off, the static colour applies to every bubble; the
choropleth still handles per-area colour variation underneath.

## Stroke color

| | |
|---|---|
| Type | Colour picker (with **fx** conditional formatting) |
| Default | `#ffffff` (white) |

The outline colour. White stroke against an orange fill is the
default for visibility against any choropleth ramp. Also accepts a
conditional rule via **fx** if you want to highlight outliers per
area without changing the fill.

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
because **Bubble Size** is not bound) use the polygon's
area-weighted centroid as the label anchor (with a polylabel
fallback for genuinely concave shapes — see
[Label-Engine](Label-Engine.md#anchor-placement)).

When **Constant size on zoom** is on (default) the bubble's screen
radius stays fixed; the label engine keeps the on-screen offset
between bubble centre and label centre constant by dividing the
override pad by the live zoom level on every zoom step. Multi-line
labels (Words on separate lines) push themselves further from the
bubble by `(N - 1) / 2 * lineHeight` so each word stacks above /
below without overlapping the bubble.

## Constant size on zoom

| | |
|---|---|
| Type | Toggle |
| Default | On |

When on, each bubble is wrapped with `translate(cx, cy) scale(1/zoom)`
so its on-screen radius stays at the authored value as the user
zooms in. When off, bubbles grow with the map (legacy behaviour).
Updates live on every zoom step (no full re-render), so wheel /
drag / button zooms feel snappy.

## Conditional formatting (fx)

Both **Fill color** and **Stroke color** carry the standard Power BI
**fx** button next to the swatch. Click it to open the conditional-
formatting dialog and pick:

| Mode | Behaviour |
|---|---|
| Format style: Gradient | Linear ramp between colours, driven by a measure (e.g. lighter for low values, darker for high). |
| Format style: Rules | Threshold-based: "if cases > 1000 then red, else if > 500 then yellow, else green". |
| Format style: Field value | Read the colour from a column directly. |

Rules resolve per row of whichever PCODE category is bound:
**Admin1 PCODE** in country view, **Admin2 PCODE** in drill view —
the same rule "just works" at both levels. With both PCODEs bound
in country view, each state inherits the rule colour from its first
Admin2 row (first-write-wins, so it stays stable across renders);
bind only Admin1 PCODE to evaluate the rule against the
state-aggregated total.

The **Bubble legend** swatch reads the most-common colour actually
painted across visible bubbles, so with fx in play the legend
matches what's drawn instead of showing the static card value.

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
