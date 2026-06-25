import type { PassiveType, RawPart } from "./passive.js";

export type ActiveCategory =
  | "ic"
  | "mcu"
  | "opamp"
  | "regulator"
  | "mosfet"
  | "bjt"
  | "diode-led"
  | "crystal-oscillator"
  | "sensor"
  | "module";

export type OtherCategory = "connector" | "switch-button" | "cable" | "mechanical" | "tool-consumable" | "other" | "uncategorized";

export type CategoryId = PassiveType | ActiveCategory | OtherCategory;
export type MobileSectionId = "active" | "resistor" | "capacitor" | "inductor" | "other";

export interface CategoryMatch {
  category: CategoryId;
  categoryLabel: string;
  section: MobileSectionId;
}

const CATEGORY_TAG_PREFIX = "pbm-category-";

const CATEGORY_LABELS: Record<CategoryId, string> = {
  resistor: "Resistor",
  capacitor: "Capacitor",
  inductor: "Inductor",
  unknown: "Uncategorized",
  ic: "IC",
  mcu: "MCU",
  opamp: "Op-Amp",
  regulator: "Regulator",
  mosfet: "MOSFET",
  bjt: "BJT",
  "diode-led": "Diode/LED",
  "crystal-oscillator": "Crystal/Oscillator",
  sensor: "Sensor",
  module: "Module",
  connector: "Connector",
  "switch-button": "Switch/Button",
  cable: "Cable",
  mechanical: "Mechanical",
  "tool-consumable": "Tool/Consumable",
  other: "Other",
  uncategorized: "Uncategorized"
};

const ACTIVE_CATEGORIES = new Set<ActiveCategory>([
  "ic",
  "mcu",
  "opamp",
  "regulator",
  "mosfet",
  "bjt",
  "diode-led",
  "crystal-oscillator",
  "sensor",
  "module"
]);

const PASSIVE_CATEGORIES = new Set<PassiveType>(["resistor", "capacitor", "inductor"]);

const OTHER_CATEGORIES = new Set<OtherCategory>([
  "connector",
  "switch-button",
  "cable",
  "mechanical",
  "tool-consumable",
  "other",
  "uncategorized"
]);

// Text-based category inference rules. ORDER MATTERS — rules earlier in the list win.
// Active-component rules MUST come before passive rules to prevent e.g. a MOSFET
// whose description mentions "0.01 Ohm" from being classified as a resistor.
const CATEGORY_RULES: Array<{ category: CategoryId; patterns: RegExp[] }> = [
  {
    category: "mcu",
    patterns: [/\b(mcu|microcontroller|esp32|esp8266|stm32|atmega|avr|pic\d*|nrf\d+|cortex[- ]?m|risc[- ]?v\s*core)\b/i]
  },
  {
    category: "crystal-oscillator",
    patterns: [/\b(crystal|oscillator|resonator|xtal)\b/i]
  },
  {
    category: "opamp",
    patterns: [/\b(op[\s-]?amps?|operational amplifiers?|comparator)\b/i]
  },
  {
    category: "regulator",
    patterns: [/\b(voltage regulator|linear regulator|switching regulator|ldo|buck[- ]?boost|buck[- ]?converter|dc[- ]?dc|charge pump|reg lin|reg bst|reg buck)\b/i, /\bregulator\b/i]
  },
  {
    category: "mosfet",
    patterns: [/\b(mosfet|nmos|pmos|n-channel|p-channel|field.effect transistor|jfet|igbt)\b/i]
  },
  {
    category: "bjt",
    patterns: [/\b(bjt|bipolar transistor|npn|pnp)\b/i]
  },
  {
    category: "diode-led",
    patterns: [/\b(led|light emitting|diode|schottky|rectifier|tvs|zener|varistor)\b/i]
  },
  {
    category: "sensor",
    patterns: [/\b(sensor|accelerometer|gyroscope|imu|temperature sensor|humidity sensor|pressure sensor|proximity sensor|thermistor|ntc|ptc|thermopile)\b/i]
  },
  {
    category: "module",
    patterns: [/\b(module|breakout|dev board|development board|evaluation board)\b/i]
  },
  {
    category: "ic",
    patterns: [
      /\b(integrated circuit|logic ic|gate|flip.flop|latch|buffer|driver|transceiver|multiplexer|demultiplexer|shift register|counter|encoder|decoder|dac|adc|codec|eeprom|flash|sram|fifo|uart ic|spi ic|i2c ic|can transceiver|ethernet ic|usb ic|pmic|battery charger|battery management|load switch|hot swap|or controller|relay driver|motor driver|h.bridge|gate driver|optocoupler|opto.isolator|current sense ic)\b/i,
      /\bICs?\b/i,     // plain "IC" or "ICs" in description (case-insensitive for lowercased text)
      /^ic\s+/i        // DigiKey descriptions often start with "IC " for ICs
    ]
  },
  {
    category: "connector",
    patterns: [/\b(conn\b|connector|header|socket|plug|terminal block|jst|molex|usb[- ]?c|receptacle|pin strip)\b/i]
  },
  {
    category: "switch-button",
    patterns: [/\b(switch|button|tactile|push button|pushbutton|toggle switch)\b/i]
  },
  {
    category: "cable",
    patterns: [/\b(cable|wire harness|jumper wire|lead)\b/i]
  },
  {
    category: "mechanical",
    patterns: [/\b(standoff|spacer|screw|nut|washer|enclosure|bracket|clip|relay|contactor|electromechanical)\b/i]
  },
  {
    category: "tool-consumable",
    patterns: [/\b(solder|flux|kapton tape|masking tape|thermal paste|epoxy|consumable tool)\b/i]
  },
  // Passive rules come LAST. Only match if no active-component rule already matched.
  // Use explicit "resistor"/"capacitor"/"inductor" keywords, NOT raw unit mentions.
  {
    category: "resistor",
    patterns: [/\b(resistor|thick film|thin film|chip resistor|metal film|metal foil|current sense resistor|fuse resistor|zero ohm)\b/i]
  },
  {
    category: "capacitor",
    patterns: [/\b(capacitor|mlcc|ceramic cap|tantalum cap|electrolytic cap|polymer cap|film cap|cap cer|bypass cap)\b/i]
  },
  {
    category: "inductor",
    patterns: [/\b(inductor|ferrite bead|ferrite chip|choke|inductance)\b/i]
  }
];

function normalizeText(part: RawPart): string {
  return [part.name, part.mpn, part.description, part.tags.join(" ")].join(" ").toLowerCase();
}

function categoryFromTag(tags: string[]): CategoryId | null {
  for (const tag of tags) {
    if (!tag.startsWith(CATEGORY_TAG_PREFIX)) continue;
    const candidate = tag.slice(CATEGORY_TAG_PREFIX.length) as CategoryId;
    if (candidate in CATEGORY_LABELS) {
      return candidate;
    }
  }
  return null;
}

function categoryFromText(text: string): CategoryId | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.category;
    }
  }
  return null;
}

export function categoryLabel(category: CategoryId): string {
  return CATEGORY_LABELS[category];
}

const SECTION_LABELS: Record<MobileSectionId, string> = {
  active: "Active",
  resistor: "Resistor",
  capacitor: "Capacitor",
  inductor: "Inductor",
  other: "Other"
};

export function sectionLabel(section: MobileSectionId): string {
  return SECTION_LABELS[section];
}

export function sectionForCategory(category: CategoryId): MobileSectionId {
  if (PASSIVE_CATEGORIES.has(category as PassiveType)) {
    return category as MobileSectionId;
  }
  if (ACTIVE_CATEGORIES.has(category as ActiveCategory)) {
    return "active";
  }
  return "other";
}

export function stripCategoryTags(tags: string[]): string[] {
  return tags.filter((tag) => !tag.startsWith(CATEGORY_TAG_PREFIX));
}

export function categoryTag(category: CategoryId): string | null {
  if (category === "uncategorized") {
    return null;
  }
  return `${CATEGORY_TAG_PREFIX}${category}`;
}

const NEXAR_CATEGORY_RULES: Array<{ category: CategoryId; patterns: RegExp[] }> = [
  { category: "mcu", patterns: [/microcontroller|\bmcu\b/i] },
  { category: "opamp", patterns: [/op[\s-]?amp|operational amplifier|\bamplifier/i] },
  { category: "regulator", patterns: [/regulator|\bldo\b|dc[\s-]?dc|buck|boost/i] },
  { category: "mosfet", patterns: [/mosfet/i] },
  { category: "bjt", patterns: [/bipolar|\bbjt\b|\bnpn\b|\bpnp\b|transistor/i] },
  { category: "diode-led", patterns: [/diode|\bled\b|rectifier|schottky|zener|\btvs\b/i] },
  { category: "crystal-oscillator", patterns: [/crystal|oscillator|resonator/i] },
  { category: "sensor", patterns: [/sensor|accelerometer|gyroscope|\bimu\b/i] },
  { category: "resistor", patterns: [/resistor/i] },
  { category: "capacitor", patterns: [/capacitor/i] },
  { category: "inductor", patterns: [/inductor|ferrite|\bchoke\b/i] },
  { category: "connector", patterns: [/connector|header|socket|receptacle/i] },
  { category: "switch-button", patterns: [/switch|button|tactile/i] }
];

const TAG_CATEGORY_RULES: Array<{ category: CategoryId; patterns: RegExp[] }> = [
  {
    category: "mcu",
    patterns: [/microcontroller/i, /\bmcu\b/i, /esp32/i, /esp8266/i, /stm32/i, /atmega/i, /avr/i]
  },
  {
    category: "opamp",
    patterns: [/op[- ]?amp/i, /operational-amplifier/i, /instrumentation-amplifier/i]
  },
  {
    category: "regulator",
    patterns: [/voltage-regulators/i, /linear-regulator/i, /dc-dc-converter/i, /voltage-reference/i, /pmic-voltage/i, /ldo/i]
  },
  {
    category: "mosfet",
    patterns: [/mosfet/i, /transistor-fet/i, /fets-single/i, /fets-arrays/i]
  },
  {
    category: "bjt",
    patterns: [/transistor-bjt/i, /bjts-single/i, /bjts-arrays/i]
  },
  {
    category: "diode-led",
    patterns: [/diode/i, /led/i, /rectifier/i, /zener/i, /tvs/i]
  },
  {
    category: "crystal-oscillator",
    patterns: [/crystal/i, /oscillator/i, /resonator/i]
  },
  {
    category: "sensor",
    patterns: [/sensor/i, /accelerometer/i, /gyroscope/i, /imu/i, /transducer/i, /thermistor/i, /ntc/i, /ptc/i]
  },
  {
    category: "module",
    patterns: [/evaluation-board/i, /dev-board/i, /module/i, /rf-receiver/i, /transceiver/i]
  },
  {
    category: "resistor",
    patterns: [/resistor/i]
  },
  {
    category: "capacitor",
    patterns: [/capacitor/i]
  },
  {
    category: "inductor",
    patterns: [/inductor/i, /ferrite-beads/i, /ferrite-chips/i]
  },
  {
    category: "connector",
    patterns: [/connector/i, /header/i, /socket/i, /receptacle/i, /terminal-blocks/i]
  },
  {
    category: "switch-button",
    patterns: [/switch/i, /tactile/i, /pushbutton/i]
  },
  {
    category: "cable",
    patterns: [/cable/i, /wire/i, /jumper/i]
  },
  {
    category: "mechanical",
    patterns: [/standoff/i, /spacer/i, /hardware/i, /screw/i, /nut/i, /washer/i]
  },
  {
    // "tape" alone is too broad — it matches DigiKey packaging tags like "tape-reel"
    category: "tool-consumable",
    patterns: [/\bsolder\b/i, /\bflux\b/i, /kapton/i, /adhesive/i]
  }
];

export function categoryFromTags(tags: string[]): CategoryId | null {
  for (const tag of tags) {
    const cleaned = tag.toLowerCase();
    for (const rule of TAG_CATEGORY_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(cleaned))) {
        return rule.category;
      }
    }
  }
  return null;
}

export function categoryFromNexar(categoryName: string | undefined | null): CategoryId | null {
  if (!categoryName) {
    return null;
  }
  for (const rule of NEXAR_CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(categoryName))) {
      return rule.category;
    }
  }
  return categoryFromTags([categoryName]);
}

export function inferPartCategory(part: RawPart, passiveType?: PassiveType): CategoryMatch {
  // First honour an explicit category tag set by the user (pbm-category-XXX)
  const explicit = categoryFromTag(part.tags);
  if (explicit) {
    return { category: explicit, categoryLabel: categoryLabel(explicit), section: sectionForCategory(explicit) };
  }

  // Next try DigiKey/Nexar tags
  const fromTags = categoryFromTags(part.tags);

  // Compute the text-based category from all available text
  const textCategory = categoryFromText(normalizeText(part));

  // If the passive type from the extractor is a real passive (not "unknown"),
  // sanity-check it against the text. If the text signals an active component
  // (e.g. a MOSFET whose description matches "mosfet" wins over "resistor" from Rds-on),
  // prefer the text result. This prevents the description parser from wrongly classifying
  // active ICs as passives just because their specs contain ohm/farad/henry values.
  const passiveIsReal = passiveType && passiveType !== "unknown";
  if (passiveIsReal) {
    // If text also resolves to an active/other category, trust the text over the passive type.
    const textIsActive = textCategory && textCategory !== passiveType && !["resistor", "capacitor", "inductor"].includes(textCategory);
    if (textIsActive) {
      const cat = fromTags ?? textCategory;
      return { category: cat, categoryLabel: categoryLabel(cat), section: sectionForCategory(cat) };
    }
    // Otherwise the passive type is reliable
    const cat = fromTags ?? passiveType;
    return { category: cat, categoryLabel: categoryLabel(cat), section: sectionForCategory(cat) };
  }

  const category = fromTags ?? textCategory ?? "uncategorized";
  return {
    category,
    categoryLabel: categoryLabel(category),
    section: sectionForCategory(category)
  };
}
