import type { NovaGroup } from '../../pipeline/lib/types.ts';

export interface NovaInfo {
  group: NovaGroup;
  name: string;
  short: string;
  /** Label under the step on the visual scale. */
  label: string;
  /** Lucide icon name for the group, see components/Icon.astro. */
  icon: 'apple' | 'chef-hat' | 'can' | 'factory';
  /** One plain-language line with familiar examples, for the scale and home page. */
  summary: string;
  /** One-paragraph definition used on product pages. */
  definition: string;
  examples: string;
}

// Definitions follow Monteiro et al., "Ultra-processed foods: what they are
// and how to identify them", Public Health Nutrition 22(5), 2019, which is
// the reference description of NOVA by the team that created it.
export const NOVA: Record<NovaGroup, NovaInfo> = {
  1: {
    group: 1,
    name: 'Unprocessed or minimally processed',
    short: 'minimally processed',
    label: 'Unprocessed',
    icon: 'apple',
    summary: 'Whole foods as nature made them, or only dried, frozen or pasteurised: fruit, eggs, plain milk, oats.',
    definition:
      'Group 1 foods are edible parts of plants, animals or fungi, either as they come or altered only by processes such as drying, crushing, roasting, boiling, pasteurisation, chilling, freezing or non-alcoholic fermentation. Those processes keep the food recognisably itself; nothing such as sugar, salt or oil is added.',
    examples: 'fresh or frozen vegetables and fruit, plain milk, eggs, dried beans, rice, plain nuts, coffee and tea',
  },
  2: {
    group: 2,
    name: 'Processed culinary ingredient',
    short: 'culinary ingredient',
    label: 'Kitchen staple',
    icon: 'chef-hat',
    summary: 'Ingredients pressed or refined from foods to cook with: oil, butter, sugar, salt.',
    definition:
      'Group 2 covers substances extracted from group 1 foods or from nature by pressing, refining, grinding or milling, and used in kitchens to prepare, season and cook group 1 foods. They are rarely eaten on their own.',
    examples: 'vegetable oils, butter, sugar, salt, honey, starches, vinegar',
  },
  3: {
    group: 3,
    name: 'Processed food',
    short: 'processed',
    label: 'Processed',
    icon: 'can',
    summary: 'Whole foods preserved with a few kitchen staples: canned beans, cheese, fresh bread, salted nuts.',
    definition:
      'Group 3 foods are made by adding group 2 ingredients such as salt, sugar or oil to group 1 foods, using preservation or cooking methods such as canning, bottling or, for breads and cheeses, non-alcoholic fermentation. Most have two or three ingredients and are recognisable as modified versions of the original food.',
    examples: 'canned vegetables in brine, fruit in syrup, salted nuts, cheeses, freshly made bread, cured meats',
  },
  4: {
    group: 4,
    name: 'Ultra-processed food',
    short: 'ultra-processed',
    label: 'Ultra-processed',
    icon: 'factory',
    summary: 'Industrial recipes with ingredients no home kitchen uses: soft drinks, most cereals, packaged snacks.',
    definition:
      'Group 4 foods are industrial formulations made mostly or entirely from substances extracted from foods or derived from food constituents, with little if any intact group 1 food. They are identified by ingredients rarely used in home kitchens, such as protein isolates, maltodextrin or invert sugar, and by "cosmetic" additives, such as flavourings, colours, emulsifiers and sweeteners, that make the final product palatable or appealing.',
    examples: 'soft drinks, packaged snacks, most breakfast cereals, mass-produced packaged breads, reconstituted meat products, instant noodles',
  },
};

/** CSS custom property suffix for each group's colour. */
export const novaToken = (g: NovaGroup) => `--nova-${g}`;
