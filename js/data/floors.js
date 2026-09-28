// Inside the castle, floor by floor. The floor a room is on comes from the
// sources (with the tier shown); where in the plan it sits is almost always
// the atlas's placement, and is drawn as such on the map.
// British numbering: the ground floor, then first … seventh.

export const FLOORS = [
  { id: 'below', label: 'Dungeons & below', short: 'B' },
  { id: 'g', label: 'Ground floor', short: 'G' },
  { id: '1', label: 'First floor', short: '1' },
  { id: '2', label: 'Second floor', short: '2' },
  { id: '3', label: 'Third floor', short: '3' },
  { id: '4', label: 'Fourth floor', short: '4' },
  { id: '5', label: 'Fifth floor', short: '5' },
  { id: '6', label: 'Sixth floor', short: '6' },
  { id: '7', label: 'Seventh floor', short: '7' },
  { id: 'towers', label: 'Tower tops', short: 'T' },
];

// pos: [x, z] in world metres (the atlas's placement unless noted); r = marker size.
export const ROOMS = [
  // Dungeons & below
  { floor: 'below', name: 'Potions classroom', tier: 'book', cite: 'PS8', note: 'Lessons take place down in one of the dungeons.', pos: [-60, 28] },
  { floor: 'below', name: 'Snape’s office', tier: 'book', cite: 'CS11, GF25', note: 'In the dungeons, near the Potions classroom.', pos: [-78, 36] },
  { floor: 'below', name: 'Slytherin common room', tier: 'author', cite: 'CS12; WW', note: 'A long, low underground room; Rowling later placed it under the lake, lit green by the water.', pos: [-40, 64] },
  { floor: 'below', name: 'The kitchens', tier: 'book', cite: 'GF21', note: 'Directly beneath the Great Hall, entered by tickling the pear in a painting of fruit.', pos: [-61, -61] },
  { floor: 'below', name: 'Hufflepuff common room', tier: 'author', cite: 'WW', note: 'In the basement near the kitchens, behind a stack of barrels.', pos: [-26, -40] },
  { floor: 'below', name: 'Chamber of Secrets', tier: 'book', cite: 'CS16', note: 'Far below the school, reached by a pipe from Moaning Myrtle’s bathroom.', pos: [20, 20] },
  { floor: 'below', name: 'Underground harbour', tier: 'book', cite: 'PS6', note: 'At the end of the tunnel from the lake, below the castle.', pos: [26, 78] },
  // Ground floor
  { floor: 'g', name: 'Entrance Hall', tier: 'book', cite: 'PS7', note: 'Flagged floor, torches, a marble staircase to the first floor.', pos: [0, -62], exact: true },
  { floor: 'g', name: 'Great Hall', tier: 'book', cite: 'PS7', note: 'Through doors to the right of the Entrance Hall.', pos: [-61, -61], exact: true },
  { floor: 'g', name: 'Chamber behind the staff table', tier: 'book', cite: 'GF17', note: 'Where the champions gather after being chosen.', pos: [-95, -61] },
  { floor: 'g', name: 'Small chamber off the hall', tier: 'book', cite: 'PS7', note: 'Where first-years wait before the Sorting.', pos: [14, -56] },
  { floor: 'g', name: 'Classroom Eleven', tier: 'book', cite: 'OP27', note: 'Along the corridor leading from the Entrance Hall on the side opposite the Great Hall.', pos: [44, -60] },
  { floor: 'g', name: 'The courtyard', tier: 'book', cite: 'PA, GF', note: 'Where students gather between lessons.', pos: [52, -30] },
  { floor: 'g', name: 'Filch’s office', tier: 'inferred', cite: 'Lexicon', note: 'Placed on the ground floor by the Lexicon.', pos: [28, -52] },
  { floor: 'g', name: 'Staff room', tier: 'inferred', cite: 'Lexicon', note: 'Placed on the ground floor by the Lexicon.', pos: [-20, 58] },
  // First floor
  { floor: '1', name: 'Balcony over the Entrance Hall', tier: 'book', cite: 'DH32', note: 'The marble staircase rises to the first floor.', pos: [0, -62], exact: true },
  { floor: '1', name: 'Defence Against the Dark Arts classroom', tier: 'inferred', cite: 'Lexicon', note: 'Placed on the first floor by the Lexicon.', pos: [70, 60] },
  { floor: '1', name: 'History of Magic classroom', tier: 'inferred', cite: 'Lexicon', note: 'Placed on the first floor by the Lexicon.', pos: [-86, 60] },
  { floor: '1', name: 'McGonagall’s office', tier: 'inferred', cite: 'Lexicon', note: 'Placed on the first floor by the Lexicon.', pos: [110, -20] },
  // Second floor
  { floor: '2', name: 'Moaning Myrtle’s bathroom', tier: 'book', cite: 'GF25', note: 'Three floors below the prefects’ bathroom on the fifth. (CS8 once says “first floor”.)', pos: [-50, 56] },
  { floor: '2', name: 'Map of Argyllshire', tier: 'book', cite: 'PA9', note: 'Where the Fat Lady hides after Sirius slashes her portrait.', pos: [60, -58] },
  { floor: '2', name: 'Defence Against the Dark Arts office', tier: 'inferred', cite: 'Lexicon', note: 'Lockhart’s and Lupin’s office, per the Lexicon.', pos: [80, 58] },
  // Third floor
  { floor: '3', name: 'The forbidden corridor', tier: 'book', cite: 'PS7, PS9', note: 'The corridor on the right-hand side, out of bounds in Harry’s first year; Fluffy guards a trapdoor there.', pos: [88, -8] },
  { floor: '3', name: 'The one-eyed witch', tier: 'book', cite: 'PA10', note: 'A hump-backed statue hiding the passage to Honeydukes.', pos: [30, -58] },
  { floor: '3', name: 'Trophy room', tier: 'inferred', cite: 'PS9; Lexicon', note: 'Placed on the third floor by the Lexicon, next to a gallery of armour.', pos: [-30, -58] },
  { floor: '3', name: 'Umbridge’s office', tier: 'inferred', cite: 'OP13; Lexicon', note: 'Per the Lexicon.', pos: [-88, 58] },
  // Fourth floor
  // (nothing is named on the fourth floor in the novels)
  // Fifth floor
  { floor: '5', name: 'Prefects’ bathroom', tier: 'book', cite: 'GF23, GF25', note: 'Fourth door to the left of the statue of Boris the Bewildered.', pos: [-60, -52] },
  // Sixth floor
  { floor: '6', name: 'Boys’ bathroom (Sectumsempra)', tier: 'inferred', cite: 'HBP24; Lexicon', note: 'Per the Lexicon.', pos: [40, 58] },
  // Seventh floor
  { floor: '7', name: 'Room of Requirement', tier: 'book', cite: 'OP18', note: 'Opposite the tapestry of Barnabas the Barmy teaching trolls ballet.', pos: [-10, -58] },
  { floor: '7', name: 'Flitwick’s office', tier: 'book', cite: 'PA21', note: 'Seventh floor of the West Tower, thirteenth window from the right.', pos: [-158, -8], exact: true },
  { floor: '7', name: 'The Fat Lady’s portrait', tier: 'inferred', cite: 'Lexicon', note: 'Entrance to Gryffindor Tower.', pos: [108, -62] },
  { floor: '7', name: 'The gargoyle to the head’s office', tier: 'inferred', cite: 'Lexicon', note: 'Per the Lexicon.', pos: [77, -12] },
  // Tower tops
  { floor: 'towers', name: 'Astronomy classroom', tier: 'book', cite: 'PS14, HBP27', note: 'The top of the tallest tower, open to the sky.', pos: [0, 0], exact: true },
  { floor: 'towers', name: 'Owlery', tier: 'book', cite: 'GF15', note: 'The top of the West Tower.', pos: [-142, -2], exact: true },
  { floor: 'towers', name: 'Divination classroom', tier: 'book', cite: 'PA6', note: 'The top of the North Tower, through a trapdoor.', pos: [-117, -66] },
  { floor: 'towers', name: 'Gryffindor common room & dormitories', tier: 'book', cite: 'PS7', note: 'Round rooms up spiral stairs.', pos: [117, -66] },
  { floor: 'towers', name: 'Ravenclaw common room', tier: 'book', cite: 'DH29', note: 'Circular, with a star-painted dome.', pos: [-117, 66] },
  { floor: 'towers', name: 'Headmaster’s office', tier: 'book', cite: 'CS11', note: 'A circular room at the top of a moving spiral staircase.', pos: [77, 0] },
];

// Places the novels never pin to a floor.
export const UNPLACED = [
  { name: 'The hospital wing', cite: 'PS–DH' },
  { name: 'The library and its Restricted Section', cite: 'PS12' },
  { name: 'The Transfiguration and Charms classrooms', cite: 'PS8' },
  { name: 'The disused classroom with the Mirror of Erised', cite: 'PS12' },
];
