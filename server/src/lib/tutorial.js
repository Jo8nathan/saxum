'use strict';

/**
 * Hardcoded "Secret Room Tutorial" world content.
 * Indexes in exits/npcs/items/quests reference the `rooms` array by position.
 */

const TUTORIAL_TITLE = 'Secret Room Tutorial';
const TUTORIAL_OWNER = 'system';

function getTutorialSpec() {
  return {
    title: TUTORIAL_TITLE,
    owner_id: TUTORIAL_OWNER,
    author_label: 'Saxum',
    image_style: 'Cartoonish',
    description:
      'Learn the ropes of Saxum in this guided tutorial. Move between rooms, talk to characters, pick up items, complete quests — and find the hidden study behind the bookshelf.',
    cover_prompt: 'cozy tutorial manor interior with a mysterious bookshelf hiding a secret door',
    rooms: [
      {
        name: 'Entrance Hall',
        description:
          'A warm, welcoming hall with a polished wooden floor and a chandelier glowing softly overhead. A Tutorial Guide stands near the front door, smiling. A rolled-up map rests on a small side table.',
        is_secret: false,
        x: 0,
        y: 0,
        image_prompt: 'warm welcoming manor entrance hall with chandelier',
      },
      {
        name: 'Dusty Library',
        description:
          'Floor-to-ceiling bookshelves packed with ancient tomes. Dust motes drift in shafts of light. A brass key glints on one of the lower shelves. One bookshelf looks… oddly new compared to the rest.',
        is_secret: false,
        x: 1,
        y: 0,
        image_prompt: 'dusty old library with towering bookshelves and one suspicious new bookshelf',
      },
      {
        name: 'Sunlit Garden',
        description:
          'A bright courtyard garden bursting with flowers. An Old Gardener tends the rose bushes, humming. A lantern hangs from an iron arch, still lit even in the daylight.',
        is_secret: false,
        x: 1,
        y: 1,
        image_prompt: 'sunlit flower garden courtyard with a gardener tending roses',
      },
      {
        name: 'Hidden Study',
        description:
          'A secret room! Behind the bookshelf lies a cramped, cozy study lit by candles. Maps of faraway lands cover the walls. You were never supposed to find this place — congratulations, explorer.',
        is_secret: true,
        x: 2,
        y: 0,
        image_prompt: 'secret hidden study behind a bookshelf with candlelight and maps on the walls',
      },
    ],
    exits: [
      { from: 0, to: 1, label: 'Library' },
      { from: 1, to: 0, label: 'Entrance Hall' },
      { from: 1, to: 2, label: 'Garden' },
      { from: 2, to: 1, label: 'Library' },
      { from: 1, to: 3, label: 'Behind the bookshelf' },
      { from: 3, to: 1, label: 'Library' },
    ],
    npcs: [
      {
        room: 0,
        name: 'Tutorial Guide',
        role: 'Your friendly instructor',
        personality: 'Patient, encouraging, and a little theatrical. Speaks directly to the player.',
        dialogue_seed:
          'You are the Tutorial Guide in a text adventure game called Saxum. Teach the player the basics: they can MOVE between rooms using exits, TALK to characters like you, TAKE items they find, and complete QUESTS for rewards. Mention the world map shows their position, and hint that libraries sometimes hide secrets — but never say outright where the secret room is. Be warm and concise.',
      },
      {
        room: 2,
        name: 'Old Gardener',
        role: 'Keeper of the garden',
        personality: 'Gruff but kind, speaks in short sentences, loves roses.',
        dialogue_seed:
          'You are the Old Gardener in the Sunlit Garden of a text adventure game. You tend the roses and know the manor well. You can chat about the garden, the weather, and the manor. If asked about secrets, you chuckle and say the library has always been "a room with more than books," but you never spoil anything directly.',
      },
    ],
    items: [
      {
        room: 1,
        name: 'Brass Key',
        description: 'A small, ornate brass key. It feels warm to the touch. What could it open?',
      },
      {
        room: 0,
        name: 'Old Map',
        description: 'A rolled-up map of the manor grounds, marked with rooms you have yet to visit.',
      },
      {
        room: 2,
        name: 'Lantern',
        description: 'A sturdy lantern that burns with a steady, comforting flame.',
      },
    ],
    quests: [
      {
        title: 'Meet the Guide',
        objective: 'Talk to the Tutorial Guide',
        reward: "Explorer's Badge",
        giver_npc: 0,
      },
      {
        title: 'Find the Secret Room',
        objective: 'Discover the Hidden Study',
        reward: 'Secret Keeper title',
        giver_npc: 0,
      },
    ],
  };
}

module.exports = { getTutorialSpec, TUTORIAL_TITLE, TUTORIAL_OWNER };
