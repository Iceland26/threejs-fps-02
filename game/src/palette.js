// Cinderline's look, in one place: a freight yard at dusk. Sodium lamps burn amber over
// blue-grey concrete and rust; the two teams read instantly — Ember orange, Sable teal.
// Every material in the game and every colour in index.html comes from these values.

export const PALETTE = {
  sky: '#232f42', // dusk blue, also the fog colour
  ground: '#3b4046', // worn asphalt
  groundLine: '#8f96a0', // painted yard markings
  concrete: '#6d7278', // perimeter and low cover walls
  steel: '#49525e', // warehouse cladding
  steelDark: '#333a44',
  rust: '#b3542e', // container orange-brown
  teal: '#2e6f6a', // container teal
  mustard: '#c19a26', // container yellow
  slate: '#4a5568', // container grey-blue
  crate: '#7a6248', // wooden crates
  barrel: '#5d6d7e',
  tank: '#8a8f96', // fuel tanks
  accent: '#f0a830', // sodium amber: lamps, site rings, UI accent
  ember: '#e86a2a', // attacking team
  sable: '#2fbfae', // defending team
  ink: '#ece8de', // HUD text
  danger: '#e5484d',
};

export const TEAM_COLORS = [PALETTE.ember, PALETTE.sable];
