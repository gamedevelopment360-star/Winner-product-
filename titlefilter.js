// titlefilter.js — keeps only videos whose TITLE names a product. No AI, no Groq.
// Add or remove words in PRODUCT_WORDS any time. Matching is on whole words,
// so "fan" will not match "fantastic".

const PRODUCT_WORDS = [
  // home and kitchen
  'fan', 'blender', 'mixer', 'grater', 'peeler', 'slicer', 'chopper', 'corer', 'organizer', 'dispenser',
  'bottle', 'mug', 'cup', 'lunch box', 'container', 'rack', 'holder', 'hanger', 'hook', 'mop', 'broom',
  'vacuum', 'humidifier', 'diffuser', 'lamp', 'light', 'lights', 'led', 'projector', 'speaker', 'charger',
  'sanitizer', 'neutralizer', 'air fryer', 'fryer', 'kettle', 'toaster', 'cutter', 'scissors', 'opener',
  'sealer', 'strainer', 'colander', 'timer', 'scale', 'thermometer', 'cleaner', 'sponge', 'brush',
  // pets
  'leash', 'harness', 'collar', 'litter', 'feeder', 'grooming', 'deshedding', 'pet brush', 'pet hair remover',
  // car
  'phone mount', 'car mount', 'seat cover', 'trunk organizer', 'dash cam', 'tire inflator',
  // fitness and beauty
  'massager', 'massage gun', 'roller', 'resistance band', 'jump rope', 'yoga mat', 'straightener', 'curler',
  'trimmer', 'shaver', 'epilator', 'serum', 'mask', 'razor', 'hair dryer', 'nail kit',
  // gadgets and tools
  'gadget', 'gadgets', 'tool', 'tools', 'drill', 'flashlight', 'torch', 'power bank', 'earbuds', 'headphones',
  'camera', 'tripod', 'stand', 'mount', 'cable', 'adapter', 'watch', 'ring light', 'backpack', 'bag',
  'umbrella', 'towel', 'pillow', 'blanket', 'heater', 'warmer', 'cooler', 'cap', 'gloves', 'socks'
];

// longest phrases first, so "air fryer" wins over "fryer"
const SORTED = PRODUCT_WORDS.slice().sort((a, b) => b.length - a.length);
const ESCAPED = SORTED.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const WORD_RE = new RegExp('\\b(' + ESCAPED.join('|') + ')(?:s|es)?\\b', 'i');

// Returns the product word found in the title, or null if the title names no product.
function productFromTitle(title) {
  const t = String(title || '');
  const m = t.match(WORD_RE);
  if (m) return m[1].toLowerCase();
  // hashtags like #odorneutralizer are one long word, so look inside them (long words only)
  const tags = (t.match(/#[a-z0-9_]+/gi) || []).map((x) => x.slice(1).toLowerCase());
  for (const tag of tags) {
    const hit = SORTED.find((w) => w.length >= 6 && tag.includes(w.replace(/\s+/g, '')));
    if (hit) return hit;
  }
  return null;
}

module.exports = { productFromTitle };
