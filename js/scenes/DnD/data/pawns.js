// Pawn catalog. interact 'fight' and 'chest' can be used; null only blocks.

const pawn = (label, sprite, interact, title) => ({
   label, block: interact !== 'chest', stand: interact !== 'fight',
   sprite, interact, title: title || '',
});

export const KINDS = [
   'chest', 'dragon', 'boar', 'tree',
   'moss', 'pillar', 'idol', 'white', 'rubble', 'black', 'gray', 'knight', 'healer',
   'pine', 'dead', 'tiefling', 'drow', 'elf',
   'goblin', 'shroom', 'skeleton', 'slime', 'fire',
];

export const KIND = {
   chest:  pawn('Chest',  'chest',  'chest', 'Locked'),
   dragon: pawn('Dragon', 'dragon', 'fight', 'Smaug'),
   boar:   pawn('Boar',   'boar',   'fight', 'Pumbaa'),
   tree:   pawn('Tree',   'tree',   null,    'Ancient oak'),
   moss:   pawn('Moss',   'moss',   null,    'Mossy boulder'),
   pillar: pawn('Pillar', 'pillar', null,    'Stone spire'),
   idol:   pawn('Idol',   'idol',   null,    'Wolf statue'),
   white:  pawn('White',  'white',  'fight', 'Grey Wind'),
   rubble: pawn('Rubble', 'rubble', null,    'Loose stone'),
   black:  pawn('Black',  'black',  'fight', 'Night Hound'),
   gray:   pawn('Gray',   'gray',   'fight', 'ShaggyDog'),
   knight: pawn('Knight', 'knight', null,    'Stone knight'),
   healer: pawn('Healer', 'healer', null,    'Stone healer'),
   pine:     pawn('Pine',     'pine',     null, 'Pine'),
   dead:     pawn('Dead',     'dead',     null, 'Dead tree'),
   tiefling: pawn('Tiefling', 'tiefling', null, 'Tiefling'),
   drow:     pawn('Drow',     'drow',     null, 'Drow'),
   elf:      pawn('Elf',      'elf',      null, 'Elf'),
   goblin:   pawn('Goblin',   'goblin',   'fight', 'Goblin'),
   shroom:   pawn('Shroom',   'shroom',   'fight', 'Mushroom'),
   skeleton: pawn('Skeleton', 'skeleton', 'fight', 'Skeleton'),
   slime:    pawn('Slime',    'slime',    'fight', 'Slime'),
   fire:     pawn('Fire',     'fire',     null,    'Campfire'),
};
