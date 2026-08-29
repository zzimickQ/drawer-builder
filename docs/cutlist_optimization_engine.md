I inspected the live site, its current public app listing, example outputs, and independent walkthroughs of the actual CutList Optimizer interface. The important caveat is that **CutList Optimizer does not publish the source code or the exact solver/heuristic it uses**, so nobody outside the project can document its internal optimization algorithm line-for-line. What we *can* do is reconstruct the optimization model very closely from its inputs, outputs, cut sequence, kerf behavior, statistics, and observable search behavior.

The documentation below therefore uses three confidence levels: **Confirmed** means the behavior is directly exposed by CutList Optimizer; **Derived** means it follows mathematically from an actual CutList Optimizer result; **Inferred** means it is the likely internal implementation needed to reproduce the observed behavior.

![Image](https://images.openai.com/static-rsc-4/1JIfaYteRBLap0FwH0-eWjmRgV9wBbAIRhEu8mTW7RNP1EmuqK5KJGyOlnXYDiwpknZLSU1ffQEtrqRCAyYCY5_pAjfP5LFB1hhXbpIbXl_dS3A2siiz_uwVva5Wx91SsmhcVnPXLSnrPtSApkE40ZlhokxkGzw5DLObgEkdr_Ow3X91THpkWXvxtqh6GLXf?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/dZLm0hvaGNd9d6cl33btUFlXe77wYvzYNCzdzfh55Kwn4WlbvsyM83OaSnVbHLuu0qyO7udAKorQKQ3hGdpq7sigzLkqnodyURrSUGG6N2XuRScpfWkyXHLCKd04zXZDnyp82YWsfXGmrjFAo9NU-2tcYYE7CjsvC33NhRIDdk81--kvZTMF0L31_LDUHErJ?purpose=fullsize)

# CutList Optimizer — Optimization Engine Documentation

## 1. What problem the optimizer is solving

At its core, CutList Optimizer solves a constrained version of the **two-dimensional cutting-stock / rectangular bin-packing problem**.

You provide two collections:

```text
Required parts
┌───────────────────────────────┐
│ Width × Height × Quantity     │
│ Material                      │
│ Grain/orientation constraint  │
│ Label                         │
│ Edge-banding metadata         │
└───────────────────────────────┘

Available stock
┌───────────────────────────────┐
│ Width × Height × Quantity     │
│ Material                      │
└───────────────────────────────┘
```

The optimizer must assign every requested rectangle to one or more stock sheets such that:

```text
1. Parts do not overlap.
2. Every part remains inside its stock sheet.
3. Saw kerf exists between cuts.
4. Grain/orientation rules are respected.
5. Material compatibility is respected.
6. Stock quantity constraints are respected.
7. The generated layout can be converted into physical cuts.
8. The chosen optimization objective is minimized.
```

CutList Optimizer officially describes itself as creating optimized cutting patterns by nesting required panels into available stock sheets. Its public interface exposes cut thickness, material handling, orientation/grain handling, edge banding, stock restrictions and optimization statistics. ([Google Play][1])

This is a difficult optimization problem because the number of possible arrangements grows extremely quickly. It is not sufficient to calculate:

```text
sum(part areas) / stock sheet area
```

because two sets of parts with exactly the same total area can have completely different packing feasibility.

---

# 2. Input model

A useful conceptual model of a requested panel is:

```ts
interface Part {
  id: string;
  width: number;
  height: number;
  quantity: number;

  material?: string;
  label?: string;

  // Whether 90° rotation is permitted
  canRotate: boolean;

  edgeBanding?: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
}
```

A stock item is approximately:

```ts
interface Stock {
  id: string;
  width: number;
  height: number;
  quantity: number;
  material?: string;
}
```

And the optimization configuration resembles:

```ts
interface OptimizationOptions {
  kerf: number;

  considerMaterials: boolean;
  considerOrientation: boolean;

  forceOneStockSheet: boolean;

  optimizationPriority:
    | "leastWaste"
    | "fewestCuts"
    | "smallerStockFirst";

  preferredCutDirection?:
    | "horizontal"
    | "vertical";
}
```

The exact schema above is illustrative rather than CutList Optimizer's actual source structure.

The live UI directly exposes cut thickness, labels, a single-stock option, material handling, edge banding and orientation/grain handling. It also reports the selected optimization priority with the result. ([cutlistoptimizer.com][2]) A recent feature comparison of the live product identifies the current priorities as least wasted area, fewest cuts and smaller-stock preference, along with preferred cut direction. ([CutOptim][3])

---

# 3. Quantity expansion

Before optimization, quantities conceptually become individual physical pieces.

For example:

```text
Part A
600 × 400
quantity = 3
```

becomes:

```text
A#1 600 × 400
A#2 600 × 400
A#3 600 × 400
```

They can later be regrouped for presentation, but during placement they are three independent rectangles.

This distinction matters because the optimizer may place identical pieces in different locations or even different sheets.

---

# 4. Validation before optimization

The engine should first determine whether each part has at least one theoretically compatible sheet.

For a part:

```text
Pw × Ph
```

and stock:

```text
Sw × Sh
```

without rotation:

```text
fits =
    Pw <= Sw
and Ph <= Sh
```

If rotation is allowed:

```text
fits =
    (Pw <= Sw && Ph <= Sh)
or
    (Ph <= Sw && Pw <= Sh)
```

If material matching is active:

```text
part.material == stock.material
```

must also be true.

So compatibility becomes:

```text
compatible =
    dimensionFits
    AND materialMatches
    AND orientationAllowed
```

Parts that cannot fit any compatible stock eventually appear in CutList Optimizer's **Unable to Fit** section. The current page explicitly contains such a result category. ([cutlistoptimizer.com][2])

---

# 5. Grain direction / orientation

This is a hard geometric constraint rather than merely visual metadata.

Suppose the stock grain runs vertically.

A part:

```text
1200 × 400
```

with locked grain cannot simply become:

```text
400 × 1200
```

even if doing so would make the packing dramatically better.

When orientation does not matter, the optimizer can evaluate both orientations:

```text
orientation 0:
width  = 1200
height = 400

orientation 1:
width  = 400
height = 1200
```

When grain matters:

```text
allowedOrientations = [original]
```

rather than:

```text
allowedOrientations = [original, rotated]
```

Grain-direction control is one of the official product features and was specifically highlighted by users comparing CutList Optimizer with simpler tools. ([Google Play][1])

This apparently simple option dramatically increases optimization complexity because allowing rotation effectively doubles the placement possibilities for many pieces.

---

# 6. Material grouping

With **Consider Material** enabled, the problem becomes several independent cutting-stock problems.

Imagine:

```text
Parts
A 600×400  18mm MDF
B 800×300  18mm MDF
C 700×500  Birch plywood
D 300×300  Birch plywood
```

and:

```text
Stock
S1 2440×1220 MDF
S2 2440×1220 Birch plywood
```

The valid search space is effectively:

```text
MDF optimization
    A
    B
    ↓
    MDF stock

Plywood optimization
    C
    D
    ↓
    Plywood stock
```

rather than one global packing problem.

This is advantageous computationally because it partitions the search space, but it is primarily a correctness constraint: the optimizer must not cut an MDF part from plywood just because the geometry fits.

---

# 7. Saw kerf

Kerf is one of the most important aspects of the optimizer.

If the saw blade has thickness:

```text
k
```

then separating two pieces consumes `k` units of material.

Suppose a source region is:

```text
96 × 28.19
```

and you need to cut a piece whose first dimension is:

```text
19.06
```

with:

```text
kerf = 0.13
```

The remaining length is not:

```text
96 - 19.06 = 76.94
```

It is:

```text
96 - 19.06 - 0.13
= 76.81
```

A published CutList Optimizer result shows exactly this behavior:

```text
96 × 28.19
cut at 19.06

remaining:
76.81 × 28.19
```

Then:

```text
76.81 - 19.06 - 0.13
= 57.62
```

Then:

```text
57.62 - 19.06 - 0.13
= 38.43
```

and so on. ([Scribd][4])

So internally a split behaves approximately like:

```text
remaining =
    originalDimension
    - requestedDimension
    - kerf
```

This proves that kerf is being handled as actual geometry, not simply displayed afterward.

---

# 8. The optimizer is producing guillotine-style cutting layouts

One of the strongest conclusions we can draw from its output is that the solution is represented as a **recursive sequence of straight cuts**.

A guillotine cut means:

> every cut passes completely across the current rectangular piece being cut.

So instead of arbitrary CNC-style nesting:

```text
┌───────────────────────────┐
│   ┌────┐       ┌──────┐   │
│   │    │ ┌───┐ │      │   │
│   └────┘ │   │ └──────┘   │
│          └───┘             │
└───────────────────────────┘
```

the sheet is recursively divided:

```text
┌───────────────────────────┐
│                           │
│       Stock sheet         │
│                           │
└───────────────────────────┘
            │
         CUT #1
            ↓
┌───────────┬───────────────┐
│ region A  │   region B    │
└───────────┴───────────────┘
      │
   CUT #2
      ↓
┌─────┬─────┐
│part │left │
└─────┴─────┘
```

The site's output contains a table:

```text
Panel | Cut | Result
```

for exactly this reason: every cut transforms one rectangular panel into other rectangular panels. ([cutlistoptimizer.com][2])

A published result illustrates it particularly clearly:

```text
Stock:
96 × 48

Part:
28.19 × 19.06
quantity 5

Kerf:
0.13
```

The optimizer first creates a strip:

```text
96 × 28.19
```

and then repeatedly cuts `19.06`-long pieces from that strip:

```text
96.00
 ↓ cut
76.81
 ↓ cut
57.62
 ↓ cut
38.43
 ↓ cut
19.24
 ↓ cut
0.05
```

That is essentially a recursive slicing tree. ([Scribd][4])

---

# 9. Internal representation: the cutting tree

A very natural representation for this optimizer is:

```ts
type CutNode =
  | PartNode
  | WasteNode
  | SplitNode;
```

For example:

```ts
interface SplitNode {
  rect: Rect;

  direction: "horizontal" | "vertical";
  position: number;
  kerf: number;

  first: CutNode;
  second: CutNode;
}
```

A finished sheet might become:

```text
Stock
│
├── VERTICAL CUT
│
├── strip
│   │
│   ├── HORIZONTAL CUT
│   │   ├── Part A
│   │   └── remainder
│   │       │
│   │       ├── HORIZONTAL CUT
│   │       │   ├── Part A
│   │       │   └── remainder
│   │       │
│   │       └── ...
│
└── waste
```

This one structure provides:

```text
visual layout
+
cut sequence
+
cut count
+
cut length
+
remaining scraps
+
used area
+
wasted area
```

So it is likely very close to whatever representation CutList Optimizer uses internally, even though its actual class names and implementation are not public.

---

# 10. Placement of one part

Imagine a free rectangle:

```text
W × H
```

and the optimizer wants to place:

```text
w × h
```

in its top-left corner.

There are typically two possible guillotine decompositions.

### Vertical-first

```text
┌────────────── W ─────────────┐
│       │                      │
│ part  │                      │
│ w×h   │       remainder      │
│       │                      │
├───────┤                      │
│ rest  │                      │
└───────┴──────────────────────┘
```

This generates approximately:

```text
right region:
(W - w - k) × H

bottom region:
w × (H - h - k)
```

### Horizontal-first

```text
┌────────────── W ─────────────┐
│ part │       remainder       │
│      │                       │
├──────┴───────────────────────┤
│                              │
│          remainder           │
└──────────────────────────────┘
```

producing different leftover rectangles.

These layouts contain exactly the same part, but the shapes of the remaining free regions differ dramatically.

That is why the optimizer must explore multiple split directions.

A poor decision early in the tree can make later parts impossible to place.

---

# 11. Why a greedy algorithm is not enough

Consider a stock sheet:

```text
100 × 100
```

and parts:

```text
60 × 60
40 × 100
40 × 40
```

Placing the `60×60` piece in the seemingly obvious position might produce scraps that cannot accommodate the `40×100` piece.

Another first placement may allow everything to fit.

Therefore:

```text
place largest part
→ place next largest
→ continue
```

alone will regularly produce poor solutions.

A practical optimizer instead needs to try several alternatives.

---

# 12. Candidate generation

The exact strategy CutList Optimizer uses here is proprietary.

However, to reproduce its observed behavior, the solver would need to vary several dimensions of the search:

```text
Part ordering
    area descending
    width descending
    height descending
    longest side
    shortest side
    quantity groups
    randomized orders

Part rotation
    0°
    90°

Stock selection
    stock A
    stock B
    smaller stock
    larger stock

Free-region selection
    smallest fitting region
    largest region
    best area fit
    best short-side fit

Split orientation
    horizontal-first
    vertical-first

Cut orientation preference
    preferred rip direction
    preferred crosscut direction
```

Every combination can lead to a different cutting tree.

Users have historically described seeing the optimizer work through alternative arrangements rather than immediately returning a simple deterministic placement, and larger jobs can take noticeably longer. ([Google Play][5])

---

# 13. The search loop

Conceptually, optimization probably looks something like this:

```text
INPUT
 ↓
Normalize dimensions
 ↓
Expand quantities
 ↓
Separate by material
 ↓
Determine legal rotations
 ↓
Generate candidate ordering
 ↓
Select stock
 ↓
Try placing parts
 ↓
Generate guillotine split tree
 ↓
Evaluate solution
 ↓
Try another arrangement
 ↓
Compare score
 ↓
Keep best arrangement
 ↓
Generate diagrams + cuts + statistics
```

A straightforward pseudo-implementation would be:

```ts
best = null;

for (const strategy of strategies) {
  const orderedParts =
      orderParts(parts, strategy);

  const solution =
      constructLayout(
        orderedParts,
        stock,
        options,
      );

  if (
    best == null ||
    compare(solution, best, options.priority) < 0
  ) {
    best = solution;
  }
}

return best;
```

A better production implementation would not keep only one state.

Instead, use a small **beam search**:

```text
current candidates
       ↓
generate possible next placements
       ↓
score them
       ↓
keep best N
       ↓
continue
```

For example:

```text
beam width = 50

step 1:
300 possible states
→ retain best 50

step 2:
50 × placements
= 4,000 states
→ retain best 50

...
```

This provides much better results than pure greedy placement without exploring the exponential search tree completely.

---

# 14. Optimization priorities

The solver is not optimizing only one universal number.

The UI exposes an **Optimization Priority**, and a recent inspection of the current product identifies objectives including:

```text
Least wasted area
Fewest cuts
Smaller stock sheets first
```

([CutOptim][3])

This should be understood as a **multi-objective optimization problem**.

A candidate solution can be represented with metrics:

```ts
interface SolutionMetrics {
  stockAreaConsumed: number;
  partArea: number;
  wasteArea: number;

  sheetCount: number;

  cutCount: number;
  cutLength: number;

  unusableWasteRegions: number;
}
```

Then the selected priority controls solution comparison.

---

# 15. Least-waste optimization

For each solution:

```text
usedPartArea =
Σ(part.width × part.height)
```

Total consumed stock area:

```text
stockArea =
Σ(sheet.width × sheet.height)
```

Waste:

```text
wasteArea =
stockArea - usedPartArea
```

So:

```text
wastePercentage =
wasteArea / stockArea × 100
```

Notice something important:

**kerf is included in waste.**

It is not part of `usedPartArea`.

This is directly derivable from a published CutList Optimizer result.

Five pieces:

```text
28.19 × 19.06
```

give:

```text
5 × 28.19 × 19.06
= 2686.507
```

CutList Optimizer reports:

```text
Used area = 2686.51
```

The stock is:

```text
96 × 48
= 4608
```

Therefore:

```text
4608 - 2686.507
= 1921.493
```

and CutList Optimizer reports:

```text
Wasted area = 1921.49
```

exactly. ([Scribd][4])

So the site's accounting model is effectively:

```text
Stock
=
Finished panels
+
kerf dust
+
unused offcuts
```

and both the latter categories appear inside total wasted area.

---

# 16. Fewest-cuts optimization

A material-efficient plan is not necessarily a labor-efficient plan.

Consider:

```text
Plan A

Waste: 5%
Cuts: 38
```

versus:

```text
Plan B

Waste: 7%
Cuts: 17
```

If material is inexpensive but saw time is expensive, Plan B may be preferable.

CutList Optimizer exposes total cuts and total cut length, and users have specifically noted that different optimization modes can trade nesting efficiency against shop efficiency. ([CutList Optimizer][2])

The likely comparison function is lexicographic:

```text
Fewest Cuts mode

1. Minimize cut count
2. Minimize waste
3. Minimize cut length
```

The exact tie-break order isn't publicly documented, so that part should be considered inferred.

---

# 17. Cut length calculation

Cut length does **not** equal the perimeter of all finished panels.

It represents how far the saw actually travels through material.

The earlier example proves this.

First cut:

```text
96
```

Then five cuts across the:

```text
28.19
```

wide strip.

So:

```text
total cut length =
96 + 5 × 28.19

= 236.95
```

CutList Optimizer reports:

```text
Cut length = 236.95
```

exactly. ([Scribd][4])

Therefore each cutting-tree node contributes:

```text
vertical split:
cutLength += region.height

horizontal split:
cutLength += region.width
```

depending on the site's coordinate convention.

This is a very important implementation detail.

---

# 18. Cut count

The number of cuts can therefore simply be computed as:

```text
cutCount =
number of SplitNodes
```

in the cutting tree.

It is **not** the number of panel edges.

Five rectangular pieces could theoretically require twenty boundary edges, while the optimizer may produce them with only six guillotine cuts.

---

# 19. Generating the physical cut sequence

Once a cutting tree exists, producing the cut list becomes straightforward.

Consider:

```text
Root stock
    │
    Cut 1
    ├── A
    │   │
    │   Cut 2
    │   ├── Part
    │   └── A2
    │       │
    │       Cut 3
    │       ...
    │
    └── Waste
```

The saw operator cannot perform `Cut 3` before `Cut 1`, because the material containing Cut 3 does not yet exist as an independent piece.

Therefore cuts should be emitted using essentially a **pre-order traversal**:

```ts
function emitCuts(node) {
  if (!node.isSplit) {
    return;
  }

  output(node.cut);

  emitCuts(node.firstChild);
  emitCuts(node.secondChild);
}
```

That naturally produces:

```text
Cut 1
Cut 2
Cut 3
...
```

which matches the site's sequential **Cuts** table. ([cutlistoptimizer.com][2])

---

# 20. Residual panels / waste pieces

Every guillotine split creates child rectangles.

Some eventually become finished parts:

```text
PART
```

while others become:

```text
WASTE / SURPLUS
```

The site's cut sequence explicitly uses the concept of **surplus** in the results. ([Scribd][4])

So a leaf of the cutting tree is basically:

```text
PartLeaf
```

or:

```text
WasteLeaf
```

This also explains the site's per-sheet field:

```text
Wasted panels
```

Most likely this is the number of terminal waste rectangles in the final slicing tree.

That specific interpretation is inferred, because the product does not document the term formally.

---

# 21. Selecting stock sheets

When there is more than one available stock format, the optimizer has another decision:

```text
Which sheet should receive the next parts?
```

For example:

```text
2440 × 1220
2000 × 1000
1200 × 800 offcut
```

The locally obvious choice may not be globally best.

A solver should evaluate:

```text
part → sheet 1
part → sheet 2
part → sheet 3
```

along with subsequent consequences.

For least-waste optimization, an effective scoring function could be:

```text
incremental consumed stock area
+
fragmentation penalty
+
future-fit penalty
```

rather than merely:

```text
smallest current leftover
```

---

# 22. Force-one-sheet mode

The UI exposes:

```text
Use only one sheet from stock
```

or internally:

```text
FORCE_ONE_STOCK_PANEL
```

([CutList Optimizer][2])

This transforms the problem.

Normal mode:

```text
while parts remain:
    open another compatible sheet
```

One-sheet mode:

```text
select one stock sheet
attempt to maximize placement
return unplaced parts
```

This is especially useful when asking:

> "How much of this project can I get from the one sheet I already own?"

rather than:

> "How many sheets should I purchase?"

---

# 23. Edge banding

CutList Optimizer supports edge banding as part metadata. ([Google Play][1])

A part might contain:

```text
┌══════════════╗
║              ║
║              ║
└──────────────╝
```

where certain edges need finishing.

Conceptually:

```ts
edgeBanding = {
  top: true,
  right: true,
  bottom: false,
  left: false,
};
```

This allows total band length to be determined:

```text
bandingLength =
(top    ? width  : 0)
+
(bottom ? width  : 0)
+
(left   ? height : 0)
+
(right  ? height : 0)
```

One point I would **not** assume when cloning the site is that activating edge banding automatically changes part dimensions. CutList Optimizer publicly documents edge banding support but not an automatic tape-thickness allowance mechanism.

The safest architecture is therefore:

```text
part geometry
        +
edge metadata
```

and let the caller explicitly enlarge dimensions if manufacturing requires an allowance.

---

# 24. Optimization scoring

A clean architecture would give every complete layout a score object:

```ts
interface Score {
  stockArea: number;
  wasteArea: number;
  sheetCount: number;

  cutCount: number;
  cutLength: number;

  fragmentation: number;
}
```

For least waste:

```ts
compare(a, b) {
  return compareTuple(
    [
      a.wasteArea,
      a.sheetCount,
      a.cutCount,
      a.cutLength,
    ],
    [
      b.wasteArea,
      b.sheetCount,
      b.cutCount,
      b.cutLength,
    ],
  );
}
```

For fewest cuts:

```ts
[
  cutCount,
  wasteArea,
  cutLength,
  sheetCount,
]
```

For smaller-stock preference:

```ts
[
  consumedStockArea,
  largestStockUsed,
  wasteArea,
  cutCount,
]
```

Again, CutList Optimizer's precise tie-breaking formula is private; these reproduce the required behavior rather than its undocumented code.

---

# 25. Fragmentation

A sophisticated optimizer should care not only about total unused area but also about its shape.

Compare:

```text
Solution A

┌──────────────┐
│ PARTS        │
├──────────────┤
│              │
│  large scrap │
│              │
└──────────────┘
```

with:

```text
Solution B

┌──────────────┐
│P│P│tiny scrap│
├─┼─┼──────────┤
│tiny│P│ tiny  │
├────┼─┼───────┤
│ P  │ tiny    │
└──────────────┘
```

Both might have:

```text
12% unused area
```

but Solution A is far more valuable because the offcut is reusable.

An internal heuristic therefore benefits from something like:

```text
fragmentationPenalty =
numberOfWasteRegions × α
+
skinnyWastePenalty
+
tinyWastePenalty
```

This is not directly exposed by CutList Optimizer, but some form of region-quality heuristic is typically necessary to achieve decent guillotine packing.

---

# 26. A practical clone of the optimization engine

If I were implementing a CutList Optimizer-compatible solver, I would structure it as:

```text
                    INPUT
                      │
                      ▼
             Input normalization
                      │
                      ▼
          Material/orientation groups
                      │
                      ▼
             Quantity expansion
                      │
                      ▼
           Initial lower-bound check
                      │
                      ▼
         ┌────────────────────────┐
         │ Multi-strategy search  │
         │                        │
         │ area sort              │
         │ max-side sort          │
         │ width sort             │
         │ height sort            │
         │ random restarts        │
         │ orientation variants   │
         │ split variants         │
         └───────────┬────────────┘
                     │
                     ▼
               Beam search
                     │
                     ▼
           Candidate cut trees
                     │
                     ▼
               Score layouts
                     │
                     ▼
                Best layout
                     │
          ┌──────────┼───────────┐
          ▼          ▼           ▼
       diagram      cuts       statistics
```

That architecture would reproduce the site's essential behavior without needing its private implementation.

---

# 27. Candidate placement algorithm

At each step:

```ts
for (const part of unplacedParts) {
  for (const sheet of openedSheets) {
    for (const region of sheet.freeRegions) {
      for (const orientation of allowedOrientations(part)) {

        if (!fits(part, region, orientation)) {
          continue;
        }

        candidates.push(
          verticalFirstPlacement(...)
        );

        candidates.push(
          horizontalFirstPlacement(...)
        );
      }
    }
  }
}
```

Each candidate is then scored.

For example:

```ts
placementScore =
    leftoverArea
  + fragmentationPenalty
  + orientationPenalty
  + cutPenalty
  + futureFitPenalty;
```

The best several candidates continue into the next search depth.

---

# 28. Future-fit heuristic

An especially useful heuristic is determining whether a placement destroys a region needed by another large part.

Suppose the placement leaves:

```text
700 × 200
```

and:

```text
300 × 500
```

but an unplaced part requires:

```text
600 × 400
```

Total free area might be huge, but neither region can fit the part.

So a better optimizer computes something like:

```text
for each remaining part:
    count compatible free rectangles

if count == 0:
    veryLargePenalty
```

This is one reason professional cutting optimizers outperform simple "best current fit" algorithms.

---

# 29. Lower bounds

The optimizer can also cheaply estimate the minimum number of sheets.

For identical stock sheets:

```text
areaLowerBound =
ceil(
    totalPartArea /
    sheetArea
)
```

Example:

```text
required area = 8.7 m²
sheet area    = 2.98 m²

ceil(8.7 / 2.98)
= 3 sheets
```

So three is a mathematical minimum.

If the algorithm finds a valid three-sheet solution:

```text
it cannot improve the sheet count further
```

although it might still improve:

```text
cut count
cut length
scrap geometry
```

Area is only a lower bound because geometric incompatibility can require more sheets.

---

# 30. Search termination

Because exhaustive search is infeasible, a practical solver needs a stopping condition.

Likely choices include:

```text
maximum iterations
maximum time
no improvement for N iterations
known lower bound reached
candidate queue exhausted
```

For a browser application, a time budget is particularly attractive:

```text
fast solve:
2–5 seconds

larger solve:
continue while improvement occurs
```

Older users have reported larger CutList Optimizer jobs taking a noticeable amount of time, which strongly suggests heuristic search rather than an exact exhaustive solver. ([Google Play][5])

---

# 31. Why the result isn't guaranteed mathematically optimal

The 2D cutting-stock problem is combinatorial.

For merely:

```text
40 parts
```

if each could theoretically appear in two orientations, you already have:

```text
2^40
≈ 1.1 trillion
```

orientation combinations before even considering ordering, stock selection or split structure.

The optimizer therefore almost certainly seeks:

> a very good feasible solution within a reasonable compute budget

rather than proving global optimality.

This is also why recalculating after changing one small dimension can suddenly produce a dramatically better layout. Fine Woodworking describes exactly such a case where a small dimensional adjustment allowed parts to fit on a sheet more effectively. ([FineWoodworking][6])

---

# 32. Statistics generation

After optimization, statistics are just reductions over the final cutting forest.

### Used area

```text
Σ finishedPanel.width × finishedPanel.height
```

### Total stock area

```text
Σ consumedStock.width × consumedStock.height
```

### Waste

```text
totalStockArea - usedArea
```

### Utilization

```text
usedArea / totalStockArea × 100
```

### Cuts

```text
number of split nodes
```

### Cut length

```text
Σ span of every split
```

### Panels

```text
number of finished-part leaves
```

### Waste panels

Likely:

```text
number of waste leaves
```

The product reports these metrics both globally and per stock sheet. ([cutlistoptimizer.com][2])

---

# 33. "Mosaics"

An interesting internal term leaks through the site's frontend:

```text
NBR_MOSAICS

tiling.mosaics
```

([cutlistoptimizer.com][2])

A "mosaic" appears to represent a **distinct stock-sheet layout pattern**.

This allows identical plans to be compressed.

Instead of storing:

```text
Sheet 1: layout X
Sheet 2: layout X
Sheet 3: layout X
Sheet 4: layout X
```

the result can conceptually contain:

```text
Mosaic X
quantity: 4
```

This is a sensible design for repeated manufacturing jobs and explains why each sheet-layout result also has a quantity field.

That interpretation is derived from the frontend terminology rather than officially documented.

---

# 34. Visualization

Once part coordinates have been obtained from the cutting tree, rendering is simple.

For a stock sheet:

```text
Sw × Sh
```

rendered inside:

```text
canvasWidth × canvasHeight
```

use:

```text
scale =
min(
  canvasWidth / Sw,
  canvasHeight / Sh
)
```

Then a part at:

```text
x, y, width, height
```

becomes:

```text
screenX = x × scale
screenY = y × scale

screenWidth  = width × scale
screenHeight = height × scale
```

Labels, measurements, grain arrows and edge-banding markers can then be rendered as overlays.

The optimizer itself should remain independent of this rendering layer.

---

# 35. Recommended system architecture

If you were building this as a modern application, I would separate it into:

```text
Cut List Feature
│
├── Domain
│   ├── Part
│   ├── Stock
│   ├── Material
│   ├── Constraints
│   ├── CutTree
│   └── OptimizationResult
│
├── Solver
│   ├── Preprocessor
│   ├── PlacementGenerator
│   ├── GuillotineSplitter
│   ├── BeamSearch
│   ├── SolutionScorer
│   └── Optimizer
│
├── Analysis
│   ├── WasteCalculator
│   ├── CutCalculator
│   └── EdgeBandingCalculator
│
└── Presentation
    ├── LayoutRenderer
    ├── CutSequence
    └── Statistics
```

The solver should have **zero UI dependencies**.

That makes it possible to use the same optimizer from:

```text
Flutter
Web
Node.js
REST API
desktop software
background worker
```

without duplicating optimization logic.

---

# 36. Running the optimizer

Because optimization can be CPU-heavy, it should not run on the UI thread.

For web:

```text
Web Worker
```

For Flutter:

```text
Isolate
```

For Node:

```text
Worker Thread
```

The public CutList Optimizer experience reinforces this need: optimization may involve enough search work to take noticeable time for large projects. ([Google Play][5])

A good API would support:

```ts
optimizer.optimize(
  input,
  onProgress: (progress) {
    // 0 → 1
  },
  cancellationToken,
);
```

---

# 37. Determinism

If randomized search strategies are included, use a seeded PRNG:

```text
seed = hash(project)
```

Then:

```text
same input
+
same settings
+
same optimizer version
+
same seed
=
same result
```

This matters for manufacturing because a user should not click Calculate twice and unexpectedly receive two completely different plans unless they explicitly request another search.

---

# 38. A simplified end-to-end algorithm

The entire process can be summarized as:

```text
function optimize(parts, stock, options):

    validate inputs

    expand part quantities

    partition by material if required

    for each material group:

        calculate allowed orientations

        reject impossible parts

        create search strategies

        for each strategy:

            create initial search state

            while state has unplaced parts:

                enumerate legal placements

                for each placement:
                    evaluate:
                        stock usage
                        residual geometry
                        kerf
                        number of cuts
                        fragmentation
                        remaining-part feasibility

                retain best candidate states

                open new stock if necessary

            calculate complete-solution score

        select best solution according
        to optimization priority

    merge material-group solutions

    traverse cut trees

    produce:
        layouts
        cut sequence
        global statistics
        sheet statistics
        unplaced parts
        edge banding totals

    return result
```

That is, architecturally, the **whole optimization pipeline**.

---

# 39. What is definitely CutList Optimizer behavior vs. what is reconstructed

| Behavior                                                | Confidence                             |
| ------------------------------------------------------- | -------------------------------------- |
| Rectangular panel optimization                          | **Confirmed**                          |
| Multiple stock sheets                                   | **Confirmed**                          |
| Quantities                                              | **Confirmed**                          |
| Adjustable saw kerf                                     | **Confirmed**                          |
| Material grouping                                       | **Confirmed**                          |
| Grain/orientation constraints                           | **Confirmed**                          |
| Edge banding                                            | **Confirmed**                          |
| One-stock-sheet restriction                             | **Confirmed**                          |
| Optimization priority                                   | **Confirmed**                          |
| Used/wasted area                                        | **Confirmed**                          |
| Number of cuts                                          | **Confirmed**                          |
| Total cut length                                        | **Confirmed**                          |
| Per-sheet statistics                                    | **Confirmed**                          |
| Unable-to-fit reporting                                 | **Confirmed**                          |
| Ordered physical cuts                                   | **Confirmed**                          |
| Kerf subtraction from remaining rectangles              | **Derived exactly from outputs**       |
| Cut length = span of each physical cut                  | **Derived exactly from outputs**       |
| Waste includes kerf                                     | **Derived exactly from outputs**       |
| Recursive guillotine/slicing representation             | **Very strongly derived from outputs** |
| Search across multiple configurations                   | **Strongly inferred/observed**         |
| Exact sorting heuristics                                | **Unknown**                            |
| Beam search vs. genetic algorithm vs. another heuristic | **Unknown**                            |
| Exact scoring weights/tie breakers                      | **Unknown**                            |
| Exact pruning strategy                                  | **Unknown**                            |

The last four are the pieces that cannot legitimately be documented as facts without CutList Optimizer's private source code.

---

## The key insight

CutList Optimizer is best thought of not as a rectangle-drawing algorithm but as a **search engine over possible cutting trees**.

It is effectively trying to find:

```text
Parts
+
Stock
+
Rotation constraints
+
Material constraints
+
Kerf
+
Cut-direction choices
                    ↓
           best slicing forest
                    ↓
 ┌──────────────────┼─────────────────┐
 ▼                  ▼                 ▼
minimum waste     practical cuts     few stock sheets
```

The particularly important implementation detail is the **cut tree**. Once you make the layout a recursive sequence of guillotine splits rather than arbitrary rectangle coordinates, almost everything else CutList Optimizer shows—the visual diagram, residual pieces, kerf, cut order, cut count, cut length and waste statistics—falls naturally out of that model. The site's own outputs strongly support this representation. ([Scribd][4])

If your intention is to **build your own optimizer equivalent to CutListOptimizer.com**, the next useful step would be to turn this into an actual **technical implementation specification**: exact data structures, the guillotine split algorithm, beam-search state model, scoring functions, pruning rules, pseudocode and then a production implementation suitable for Dart/Flutter or Node.js.

[1]: https://play.google.com/store/apps/details/?hl=en-US&id=com.cutlistoptimizer&utm_source=chatgpt.com "CutList Optimizer - Apps on Google Play"
[2]: https://www.cutlistoptimizer.com/ "CutList Optimizer"
[3]: https://cutoptim.com/guides/best-free-cut-list-software-2026?utm_source=chatgpt.com "Best Free Cut List Software in 2026: Top Tools Compared"
[4]: https://www.scribd.com/document/807757289/CutList-Optimizer?utm_source=chatgpt.com "Cutting List Optimization Overview | PDF"
[5]: https://play.google.com/store/apps/details?hl=en-US&id=com.cutlistoptimizer&utm_source=chatgpt.com "CutList Optimizer - Apps on Google Play"
[6]: https://www.finewoodworking.com/2021/07/20/my-experience-with-cutlistoptimizer-com "My experience with Cutlist Optimizer - FineWoodworking"
