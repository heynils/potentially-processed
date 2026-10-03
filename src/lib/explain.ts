// Plain-language explanations of NOVA markers.
//
// Each marker gets a *description* (what the substance is and does) and a
// *kind* (why NOVA counts it). Product pages group markers by kind and
// explain each kind once, so a product with 19 markers doesn't repeat the
// same sentence 19 times. Marker pages show both.
//
// Curated descriptions cover the markers that occur most often in the data;
// everything else falls back to the EU definition of the additive's
// functional class (OFF additives_classes taxonomy). Descriptions say what a
// substance is and does. Claims about health effects are limited to
// regulatory facts.

import type { Marker } from '../../pipeline/lib/types.ts';
import { labels, markerByTag } from './data.ts';

export type MarkerKind = 'cosmetic' | 'extracted' | 'culinary' | 'processed-ingredient' | 'preservation' | 'category';

export const KINDS: Record<MarkerKind, { title: string; explanation: string }> = {
  cosmetic: {
    title: 'Cosmetic additives',
    explanation:
      'NOVA calls these additives "cosmetic": they change how a product looks, feels or tastes rather than keeping it safe to eat. Their presence is one of the two defining signs of an ultra-processed food.',
  },
  extracted: {
    title: 'Substances rarely used in home kitchens',
    explanation:
      'These are extracted from foods or derived from them industrially: refined sugars made from starch, isolated proteins and fibres, modified starches and oils. NOVA calls them "substances of no or rare culinary use", the other defining sign of an ultra-processed food.',
  },
  culinary: {
    title: 'Culinary ingredients',
    explanation:
      'These are group 2 ingredients, the kind a cook adds to whole foods. On their own they make a food processed (group 3), not ultra-processed.',
  },
  'processed-ingredient': {
    title: 'Processed ingredients',
    explanation:
      'These are processed foods in their own right (group 3), preserved versions of whole foods, so a product containing them is at least processed.',
  },
  preservation: {
    title: 'Preservation and traditional processing',
    explanation:
      'Preservatives, enzymes and cultures keep food safe or carry out traditional processes such as fermentation. Open Food Facts counts them as signs of processing (group 3), not ultra-processing.',
  },
  category: {
    title: 'Category rules',
    explanation:
      'Open Food Facts also assigns NOVA groups by category: every product in certain categories is at least the given group, whatever its ingredient list says.',
  },
};

const COSMETIC_INGREDIENTS = new Set([
  'en:flavouring',
  'en:natural-flavouring',
  'en:artificial-flavouring',
  'en:emulsifier',
  'en:colour',
  'en:flavour-enhancer',
  'en:sweetener',
  'en:thickener',
  'en:gelling-agent',
  'en:glazing-agent',
  'en:firming-agent',
  'en:stabiliser',
  'en:humectant',
  'en:bulking-agent',
  'en:anti-caking-agent',
  'en:carbonating-agent',
  'en:foaming-agent',
  'en:anti-foaming-agent',
  'en:sequestrant',
]);
const PROCESSED_INGREDIENTS = new Set(['en:milk-powder', 'en:cheese', 'en:sauce']);
const PRESERVATION = new Set(['en:preservative', 'en:enzyme', 'en:microbial-culture']);

export function markerKind(m: Pick<Marker, 'tag' | 'type' | 'group'>): MarkerKind {
  if (m.type === 'categories') return 'category';
  if (m.group === 4) {
    if (m.type === 'additives' || COSMETIC_INGREDIENTS.has(m.tag)) return 'cosmetic';
    return markerByTag.get(m.tag)?.classes.length ? 'cosmetic' : 'extracted';
  }
  if (m.type === 'additives' || PRESERVATION.has(m.tag)) return 'preservation';
  if (PROCESSED_INGREDIENTS.has(m.tag)) return 'processed-ingredient';
  return 'culinary';
}

const SUGAR_FROM_STARCH = 'It is made by breaking down starch, usually from corn or wheat, with acids or enzymes.';

export const CURATED: Record<string, string> = {
  // --- group 4: ingredients --------------------------------------------------
  'en:flavouring':
    'Flavourings are concentrated aroma preparations that add or intensify a taste. Some are synthesised, some are extracted from plants or produced by fermentation, and labels often say only "flavouring" or "natural flavour".',
  'en:natural-flavouring':
    'A "natural" flavouring has flavour molecules from a natural source, such as a plant, an animal or a microbial fermentation, but it is still a concentrated preparation made in a factory, not a food.',
  'en:artificial-flavouring': 'Artificial flavourings are flavour molecules made by chemical synthesis.',
  'en:emulsifier':
    'Emulsifiers keep fat and water from separating, giving products a smooth, stable texture over a long shelf life. Common examples are lecithins (E322) and mono- and diglycerides of fatty acids (E471).',
  'en:colour': 'Colours are added to restore colour lost in processing or to make a product look more appealing.',
  'en:flavour-enhancer':
    'Flavour enhancers such as monosodium glutamate (E621) strengthen savoury taste without adding a flavour of their own.',
  'en:sweetener': 'Sweeteners give sweetness with few or no calories, many at hundreds of times the strength of sugar.',
  'en:thickener':
    'Thickeners, often gums or modified starches, make liquids more viscous so that a product feels richer than its ingredients alone would make it.',
  'en:gelling-agent': 'Gelling agents such as pectin, gelatine or carrageenan set liquids into gels and stabilise textures.',
  'en:glazing-agent': 'Glazing agents, waxes and shellac for example, coat a surface to make it shiny or stop pieces sticking together.',
  'en:firming-agent': 'Firming agents keep fruit and vegetable tissue crisp or firm through processing and storage.',
  'en:modified-starch':
    'Modified starch is starch altered physically, with enzymes or chemically, so that it thickens, gels or survives freezing and heating better than ordinary starch.',
  'en:glucose': `Glucose, usually listed as glucose syrup, is cheap, keeps products moist and stops sugar from crystallising. ${SUGAR_FROM_STARCH}`,
  'en:glucose-syrup': `Glucose syrup is cheap, keeps products moist and stops sugar from crystallising. ${SUGAR_FROM_STARCH}`,
  'en:glucose-fructose-syrup':
    'Glucose-fructose syrup is made from starch: enzymes break it down to glucose and convert part of that to fructose. It is the European name for what the US calls high-fructose corn syrup.',
  'en:high-fructose-corn-syrup':
    'High-fructose corn syrup is made from corn starch: enzymes break it down to glucose and convert part of that into fructose, giving a syrup about as sweet as table sugar.',
  'en:fructose': 'Fructose is the sugar found naturally in fruit and honey, but as an ingredient it is refined industrially, mostly from corn starch.',
  'en:dextrose': 'Dextrose is pure glucose crystallised from starch-derived syrup.',
  'en:invert-sugar':
    'Invert sugar is ordinary sugar split into glucose and fructose with acid or enzymes. It is sweeter than sugar, keeps baked goods moist and resists crystallising.',
  'en:maltodextrin':
    'Maltodextrin is a white powder made by partly breaking down starch. It tastes of little, adds bulk and body, and carries flavours and sweeteners.',
  'en:lactose':
    'Lactose is milk sugar, crystallised industrially from whey, a by-product of cheese making. It is used as a cheap bulking ingredient and to help browning.',
  'en:whey':
    'Whey is the liquid left over from cheese making, usually dried into a powder and used as a cheap source of milk solids, protein and lactose.',
  'en:milk-proteins':
    'Milk proteins are proteins separated from milk, such as caseinates and whey protein concentrates, added to adjust texture or raise protein content.',
  'en:casein': 'Casein is the main protein in milk, separated industrially and used to bind, emulsify and add protein.',
  'en:whey-protein': 'Whey protein is concentrated from whey, the liquid left over from cheese making.',
  'en:soy-protein': 'Soy protein is extracted from soybeans and used to add protein or a meat-like texture.',
  'en:gluten':
    'Wheat gluten, sold as "vital wheat gluten", is the protein washed out of wheat flour. It is added to strengthen doughs or raise protein content.',
  'en:hydrolysed-vegetable-protein':
    'Hydrolysed vegetable protein is made by breaking plant proteins down into amino acids, mainly to give a savoury, meaty taste.',
  'en:vegetable-fiber':
    'Isolated plant fibres, such as inulin, oat fibre or bamboo fibre, are extracted industrially and added to change texture or support "source of fibre" claims.',
  'en:hydrogenated-oil': 'Hydrogenation turns liquid oil into a solid fat that resists going rancid.',
  'en:hydrogenated-vegetable-oil': 'Hydrogenation turns liquid vegetable oil into a solid fat that resists going rancid.',

  // --- group 4: additives ----------------------------------------------------
  'en:e322':
    'Lecithins are fatty substances extracted mostly from soybeans, sunflower seeds or eggs, used as emulsifiers to keep fat and water mixed, for example in chocolate.',
  'en:e471':
    'Mono- and diglycerides of fatty acids are made from fats and glycerol. They are among the most widely used emulsifiers in bread, cakes, ice cream and spreads.',
  'en:e415':
    'Xanthan gum is a thickener made by fermenting sugar with the bacterium Xanthomonas campestris. A small amount makes sauces and dressings thick and stable.',
  'en:e412': 'Guar gum is a thickener ground from the seeds of the guar plant.',
  'en:e410': 'Locust bean gum (carob gum) is a thickener and stabiliser from the seeds of the carob tree.',
  'en:e407':
    'Carrageenan is a thickener and gelling agent extracted from red seaweed, used widely in dairy desserts, plant-based drinks and processed meats.',
  'en:e414': 'Gum arabic (acacia gum) is the hardened sap of acacia trees, used to stabilise flavour emulsions in soft drinks and to coat sweets.',
  'en:e440':
    'Pectins are gelling agents extracted from citrus peel or apple pomace. Fruit contains pectin naturally, but the additive is a purified extract.',
  'en:e433': 'Polysorbate 80 is a synthetic emulsifier used in ice cream and some sauces to keep fats evenly dispersed.',
  'en:e466': 'Carboxymethyl cellulose is a thickener made by chemically modifying cellulose from wood or cotton.',
  'en:e476':
    'Polyglycerol polyricinoleate (PGPR) is an emulsifier made from castor oil. In chocolate it makes the melted mass flow more easily, which lets manufacturers use less cocoa butter.',
  'en:e903': 'Carnauba wax comes from the leaves of a Brazilian palm and gives sweets and coated chocolates their shine.',
  'en:e904': 'Shellac is a resin secreted by lac insects, used as a glazing agent on sweets, coated chocolates and fruit.',
  'en:e905': 'Microcrystalline wax is a petroleum-derived wax used as a glazing agent.',
  'en:e102':
    'Tartrazine is a synthetic yellow azo dye (FD&C Yellow No. 5 in the US). In the EU, foods containing it must carry the warning "may have an adverse effect on activity and attention in children" (Regulation (EC) No 1333/2008).',
  'en:e110':
    'Sunset yellow FCF is a synthetic orange azo dye (FD&C Yellow No. 6 in the US). In the EU, foods containing it must carry the warning "may have an adverse effect on activity and attention in children".',
  'en:e129':
    'Allura red AC is a synthetic red azo dye (FD&C Red No. 40 in the US). In the EU, foods containing it must carry the warning "may have an adverse effect on activity and attention in children".',
  'en:e133': 'Brilliant blue FCF is a synthetic blue dye, listed in the US as FD&C Blue No. 1.',
  'en:e127':
    'Erythrosine is a synthetic red dye (FD&C Red No. 3 in the US). The US Food and Drug Administration revoked its authorisation for food in January 2025, giving manufacturers until January 2027 to reformulate.',
  'en:e171':
    'Titanium dioxide is a white pigment. It has not been authorised as a food additive in the EU since 2022, after the European Food Safety Authority could not rule out concerns about genotoxicity. It remains permitted in the US.',
  'en:e150a': 'Plain caramel is a brown colour made by heating sugars.',
  'en:e150c': 'Ammonia caramel is a brown colour made by heating sugars with ammonia compounds.',
  'en:e150d': 'Sulphite ammonia caramel is the dark brown colour in colas and many sauces, made by heating sugars with sulphite and ammonia compounds.',
  'en:e160a': 'Carotenes are orange-yellow pigments, either synthesised or extracted from carrots, algae or palm oil.',
  'en:e160c': 'Paprika extract is a red-orange colour extracted from paprika peppers.',
  'en:e120': 'Carmine is a red colour made from cochineal insects.',
  'en:e621': 'Monosodium glutamate (MSG) is the sodium salt of glutamic acid, made by fermentation and used to strengthen savoury taste.',
  'en:e627': 'Disodium guanylate is a flavour enhancer usually used together with MSG.',
  'en:e631': 'Disodium inosinate is a flavour enhancer usually used together with MSG.',
  'en:e951': 'Aspartame is a synthetic sweetener about 200 times sweeter than sugar, used in diet drinks and sugar-free products.',
  'en:e950': 'Acesulfame K is a synthetic sweetener about 200 times sweeter than sugar, often combined with aspartame or sucralose.',
  'en:e955': 'Sucralose is a sweetener made by chlorinating sugar. It is about 600 times sweeter than sugar.',
  'en:e960': 'Steviol glycosides are sweet compounds extracted and purified from the leaves of the stevia plant.',
  'en:e420':
    'Sorbitol is a sugar alcohol used as a sweetener and to keep products moist. In large amounts it has a laxative effect, which EU labels must mention above a set content.',
  'en:e965': 'Maltitol is a sugar alcohol made from starch, used as a sweetener in "no added sugar" sweets and chocolate.',
  'en:e422': 'Glycerol is a sweet-tasting liquid used to keep products moist and soft.',
  'en:e450': 'Diphosphates are phosphate salts used as raising agents in baking powder, and to hold water in processed meats and cheese.',
  'en:e428': 'Gelatine is a gelling agent made from collagen in animal skin and bones.',
  'en:e1400': 'Dextrin is starch partly broken down by heat or acid, used as a thickener, binder and coating.',
  'en:e14xx': 'Modified starches (E1400 to E1452) are starches treated physically, with enzymes or chemically so that they thicken and hold up to heating, freezing or acidity better than ordinary starch.',
  'en:e1422': 'Acetylated distarch adipate is a chemically modified starch that holds up to heating, freezing and acidity, used to thicken sauces and fillings.',
  'en:e1442': 'Hydroxypropyl distarch phosphate is a chemically modified starch used to thicken and stabilise desserts, sauces and soups.',

  // --- group 3 markers -------------------------------------------------------
  'en:sugar': 'Sugar refined from sugar cane or beet.',
  'en:salt': 'Salt, added for taste and preservation.',
  'en:vegetable-oil': 'Vegetable oils are pressed or extracted from seeds, nuts and fruits.',
  'en:vegetable-fat': 'Vegetable fats are oils that are solid at room temperature, such as palm or coconut fat.',
  'en:butter': 'Butter, the fat churned from cream.',
  'en:starch': 'Starch extracted from cereals or potatoes, used to thicken.',
  'en:honey': 'Honey, used as a sweetener.',
  'en:vinegar': 'Vinegar, used for flavour and preservation.',
  'en:milk-powder': 'Milk powder is milk with the water evaporated off: a preserved form of a whole food rather than an industrial extract.',
  'en:cheese': 'Cheese is milk preserved with salt, cultures and rennet.',
  'en:sauce': 'A prepared sauce used as an ingredient.',
  'en:preservative': 'Preservatives slow spoilage by microbes. NOVA allows additives that preserve a food\'s original properties in processed foods (group 3).',
  'en:enzyme': 'Enzymes carry out traditional processes such as cheese making and baking.',
  'en:microbial-culture': 'Microbial cultures ferment foods such as yoghurt, cheese and sourdough.',
};

/** What the marker is and does, without the "why NOVA counts it" part. */
export function describeMarker(m: Pick<Marker, 'tag' | 'type' | 'group'>): string {
  const curated = CURATED[m.tag];
  if (curated) return curated;

  if (m.type === 'categories') {
    const name = labels.categories[m.tag] ?? m.tag;
    return `Products in the category "${name}" are at least group ${m.group}.`;
  }

  // Fall back to the EU definition of the additive's first functional class.
  const cls = (markerByTag.get(m.tag)?.classes ?? []).map((c) => labels.additiveClasses[c]).find((c) => c?.description);
  if (cls?.description) return cls.description.replace(/\s+/g, ' ').trim();

  return m.type === 'additives'
    ? 'A food additive authorised for industrial food production.'
    : 'An ingredient mostly produced industrially and rarely used in home kitchens.';
}

/** Full explanation for marker pages: description plus why NOVA counts it. */
export function explainMarker(m: Pick<Marker, 'tag' | 'type' | 'group'>): { description: string; kind: MarkerKind } {
  return { description: describeMarker(m), kind: markerKind(m) };
}

/** Groups markers by kind, in the order kinds should be presented. */
export function groupByKind<T extends Pick<Marker, 'tag' | 'type' | 'group'>>(markers: T[]): [MarkerKind, T[]][] {
  const order: MarkerKind[] = ['cosmetic', 'extracted', 'processed-ingredient', 'culinary', 'preservation', 'category'];
  const groups = new Map<MarkerKind, T[]>();
  for (const m of markers) {
    const k = markerKind(m);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}
