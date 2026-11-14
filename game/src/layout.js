// The Cinderline Yard: one original freight-yard map, described as data. world.js builds the
// three.js scene from these tables and collision.js walks the same tables, so what a player
// sees is exactly what blocks movement, sight and bullets. All units are metres; x runs east,
// z runs south, the ground plane is 68 by 52 and every wall is an axis-aligned box.
//
// Two charge sites: A, the Crane Yard in the west, ringed by container stacks; B, Fuel Row in
// the east, among storage tanks. Three lanes join the spawns to the sites — the south lane,
// the central warehouse, and the north pass — with the customs shed and the loading dock
// breaking up the sightlines between them.

// Walls and solid props share one shape: { x1, z1, x2, z2, h, mat } — a box from (x1, z1) to
// (x2, z2), h metres tall, rendered in material `mat`. Character collision ignores height
// (nothing here can be vaulted); sight and bullets respect it.
export const WALLS = [
  // Perimeter.
  { x1: -34, z1: -26, x2: 34, z2: -25, h: 4.5, mat: 'concrete' },
  { x1: -34, z1: 25, x2: 34, z2: 26, h: 4.5, mat: 'concrete' },
  { x1: -34, z1: -26, x2: -33, z2: 26, h: 4.5, mat: 'concrete' },
  { x1: 33, z1: -26, x2: 34, z2: 26, h: 4.5, mat: 'concrete' },

  // The warehouse, centre: doors on the south (x -2..2), north (x 4..7) and west (z -2..1).
  { x1: -11, z1: 6, x2: -2, z2: 7, h: 3.6, mat: 'steel' },
  { x1: 2, z1: 6, x2: 11, z2: 7, h: 3.6, mat: 'steel' },
  { x1: -11, z1: -7, x2: 4, z2: -6, h: 3.6, mat: 'steel' },
  { x1: 7, z1: -7, x2: 11, z2: -6, h: 3.6, mat: 'steel' },
  { x1: -11, z1: -7, x2: -10, z2: -2, h: 3.6, mat: 'steel' },
  { x1: -11, z1: 1, x2: -10, z2: 7, h: 3.6, mat: 'steel' },
  { x1: 10, z1: -7, x2: 11, z2: 7, h: 3.6, mat: 'steel' },

  // Site A container stacks (the yard between them is the plant zone).
  { x1: -30, z1: -16, x2: -24, z2: -13.6, h: 2.6, mat: 'rust' },
  { x1: -30, z1: -4.4, x2: -24, z2: -2, h: 2.6, mat: 'teal' },
  { x1: -15.2, z1: -13, x2: -12.8, z2: -7, h: 2.6, mat: 'mustard' },
  { x1: -27, z1: -12, x2: -25.8, z2: -6, h: 2.6, mat: 'slate' }, // single stack inside the yard's west edge

  // Site B: fuel tanks stand as square colliders (the meshes are cylinders of the same span).
  { x1: 25.2, z1: 3.2, x2: 28.8, z2: 6.8, h: 4, mat: 'tank' },
  { x1: 25.2, z1: 15.2, x2: 28.8, z2: 18.8, h: 4, mat: 'tank' },
  { x1: 17.2, z1: 15.2, x2: 20.8, z2: 18.8, h: 4, mat: 'tank' },
  { x1: 15, z1: 3, x2: 21, z2: 4.1, h: 1.1, mat: 'concrete' }, // low cover wall, B north approach
  { x1: 24, z1: 19, x2: 30, z2: 20.1, h: 1.1, mat: 'concrete' }, // low cover wall, B south

  // Customs shed, north-east of mid: doors west (z -15..-13) and south (x 17..19).
  { x1: 14, z1: -18, x2: 22, z2: -17, h: 3, mat: 'steel' },
  { x1: 14, z1: -11, x2: 17, z2: -10, h: 3, mat: 'steel' },
  { x1: 19, z1: -11, x2: 22, z2: -10, h: 3, mat: 'steel' },
  { x1: 14, z1: -18, x2: 15, z2: -15, h: 3, mat: 'steel' },
  { x1: 14, z1: -13, x2: 15, z2: -10, h: 3, mat: 'steel' },
  { x1: 21, z1: -18, x2: 22, z2: -10, h: 3, mat: 'steel' },

  // North pass divider: a long low building between the A yard and the north lane.
  { x1: -20, z1: -13, x2: -2, z2: -12, h: 2.6, mat: 'steelDark' },

  // West divider between the A-south approach and mid-south, gap at z 9..11.
  { x1: -13, z1: 4, x2: -12, z2: 9, h: 2.6, mat: 'steelDark' },
  { x1: -13, z1: 11, x2: -12, z2: 16, h: 2.6, mat: 'steelDark' },

  // Loading dock, south of the warehouse: two platforms with a lane between them.
  { x1: 4, z1: 14, x2: 12, z2: 15.1, h: 1.1, mat: 'concrete' },
  { x1: 4, z1: 19, x2: 12, z2: 20.1, h: 1.1, mat: 'concrete' },
  { x1: 16, z1: 20, x2: 24, z2: 22.4, h: 2.6, mat: 'rust' }, // container closing the south lane's east end

  // Attacker spawn cover.
  { x1: -31, z1: 14.6, x2: -25, z2: 17, h: 2.6, mat: 'teal' },
];

// Loose cover that is not a full wall: crates and barrels. Same collider shape; `kind` picks
// the mesh world.js builds. Barrels are cylinders of radius (x2 - x1) / 2.
export const PROPS = [
  { kind: 'crate', x1: -8.5, z1: 3.8, x2: -7.3, z2: 5, h: 1.2, mat: 'crate' }, // warehouse interior
  { kind: 'crate', x1: 5, z1: 2, x2: 6.2, z2: 3.2, h: 1.2, mat: 'crate' },
  { kind: 'crate', x1: -21, z1: -10.5, x2: -19.8, z2: -9.3, h: 1.2, mat: 'crate' }, // site A edge
  { kind: 'crate', x1: 21, z1: 8, x2: 22.2, z2: 9.2, h: 1.2, mat: 'crate' }, // site B edge
  { kind: 'crate', x1: 19.5, z1: -16.5, x2: 20.7, z2: -15.3, h: 1.2, mat: 'crate' }, // customs interior
  { kind: 'crate', x1: -3.5, z1: 13.5, x2: -2.3, z2: 14.7, h: 1.2, mat: 'crate' }, // mid-south field
  { kind: 'crate', x1: -19, z1: 20.6, x2: -17.8, z2: 21.8, h: 1.2, mat: 'crate' }, // south lane
  { kind: 'barrel', x1: 8, z1: -10.8, x2: 9, z2: -9.8, h: 1, mat: 'barrel' }, // catwalk
  { kind: 'barrel', x1: -17, z1: -21, x2: -16, z2: -20, h: 1, mat: 'barrel' }, // north lane
  { kind: 'barrel', x1: 13, z1: 11, x2: 14, z2: 12, h: 1, mat: 'barrel' }, // B approach
  { kind: 'barrel', x1: -24, z1: 5, x2: -23, z2: 6, h: 1, mat: 'barrel' }, // A south field
];

// The two plant zones. A charge planted anywhere inside the circle counts.
export const SITES = [
  { id: 'A', name: 'Crane Yard', x: -22, z: -9, r: 4.5 },
  { id: 'B', name: 'Fuel Row', x: 23, z: 11, r: 4.5 },
];

// Team spawns: four slots each. Team 0 (Ember) attacks from the south-west; team 1 (Sable)
// defends from the north-east. `yaw` is the facing at round start, in the game's one facing
// convention (the camera's Y rotation): forward on the ground is (-sin yaw, -cos yaw), so
// Ember's north-east advance is yaw near -PI/4 and Sable's south-west watch is near 3PI/4.
export const SPAWNS = [
  [
    { x: -28, z: 20, yaw: -0.8 }, { x: -25, z: 21.5, yaw: -0.5 },
    { x: -30, z: 18.5, yaw: -1.1 }, { x: -26, z: 23, yaw: -0.6 },
  ],
  [
    { x: 28, z: -20, yaw: 2.7 }, { x: 25, z: -21.5, yaw: 2.4 },
    { x: 30, z: -18.5, yaw: 2.0 }, { x: 26, z: -23, yaw: 2.5 },
  ],
];

// Lamp posts (visual: a pole, an emissive head and a real point light on the tall ones).
export const LAMPS = [
  { x: -22, z: -9 }, { x: 23, z: 11 }, { x: 0, z: 0 }, { x: -28, z: 19 },
  { x: 28, z: -19 }, { x: 0, z: 17 }, { x: 0, z: -17 }, { x: 18, z: -3 },
];

// The waypoint graph the bots walk. Nodes sit in open ground; edges join nodes with a clear
// straight walk between them. Bots path across the graph with breadth-first search, then
// steer the last stretch directly when they can see their goal.
export const WAYPOINTS = [
  { x: -28, z: 19 }, // 0 attacker spawn
  { x: -20, z: 19 }, // 1 south lane west
  { x: -8, z: 19 }, // 2 south lane mid
  { x: 2, z: 17 }, // 3 dock lane
  { x: 14, z: 13 }, // 4 B approach
  { x: 19, z: 13.5 }, // 5 B south entry
  { x: 23, z: 11 }, // 6 SITE B
  { x: 17, z: 7 }, // 7 B mid entry
  { x: 0, z: 10 }, // 8 mid-south field
  { x: 0, z: 2.5 }, // 9 warehouse south interior
  { x: 5.5, z: -3 }, // 10 warehouse north interior
  { x: -5, z: -3 }, // 11 warehouse west interior
  { x: -13, z: 0 }, // 12 west door outside
  { x: -18, z: -3 }, // 13 A south approach
  { x: -22, z: -9 }, // 14 SITE A
  { x: -21.5, z: -11 }, // 15 A north approach, east of the container stack
  { x: -24, z: -19 }, // 16 north-west corner
  { x: -10, z: -16 }, // 17 north lane mid
  { x: 5, z: -16 }, // 18 north lane east
  { x: 18, z: -14 }, // 19 customs interior (a defender hold)
  { x: 27, z: -19 }, // 20 defender spawn
  { x: 28, z: -8 }, // 21 east lane north
  { x: 24, z: 2 }, // 22 B north entry
  { x: 12, z: -9 }, // 23 catwalk east
  { x: -17, z: 10 }, // 24 west lane south (A south field)
  { x: -6, z: 12 }, // 25 mid-south connector
  { x: -23, z: -20 }, // 26 A north entry
  { x: 13, z: 17 }, // 27 dock east / B south lane
  { x: 23, z: 5.5 }, // 28 B east entry, past the low wall's end
  { x: -12.5, z: 10 }, // 29 the west divider's gap
  { x: 5.5, z: -9 }, // 30 warehouse north door, outside
];

export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 27], [27, 4], [4, 5], [5, 6], [4, 7], [7, 6],
  [7, 28], [28, 22], [22, 21], [21, 20], [19, 18], [18, 17], [17, 16],
  [16, 26], [26, 15], [15, 14], [14, 13], [13, 24], [24, 1], [13, 12],
  [12, 11], [11, 9], [9, 8], [8, 25], [25, 2], [25, 29], [29, 24],
  [9, 10], [10, 30], [30, 23], [30, 18], [23, 22], [3, 8], [5, 27],
];
