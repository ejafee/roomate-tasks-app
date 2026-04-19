export type UserRole = 'admin' | 'member';

export interface Roommate {
  id: string;
  name: string;
  role: UserRole;
  avatar: string;
}

export const ROOMMATES: Record<string, Roommate> = {
  faeyza: { id: 'faeyza', name: 'Faeyza', role: 'admin', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Faeyza' },
  ryuta: { id: 'ryuta', name: 'Ryuta', role: 'member', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Ryuta' },
  igun: { id: 'igun', name: 'Igun', role: 'member', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Igun' },
  ilya: { id: 'ilya', name: 'Ilya', role: 'member', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Ilya' },
};

export const CHORE_CYCLES = {
  CLEANING: ['faeyza', 'ryuta', 'ilya', 'igun'], // sweeping and mopping
  TRASH_WET: ['ryuta', 'faeyza', 'igun', 'ilya'],
  KITCHEN: ['ilya', 'igun', 'faeyza', 'ryuta'],
  TOILET: ['igun', 'ryuta', 'faeyza'], // ilya is not in toilet cycle? User said: "igun-ryuta-faeyza and it repeats"
};

export const FINES = {
  WEEKLY_CHORE: 5,
  DRY_TRASH_VIOLATION: 5,
  WET_TRASH_VIOLATION: 5,
  DISHES_SPOON: 2,
  DISHES_COOKWARE: 7,
  DISHES_OTHERS: 5,
  AC_VIOLATION: 7,
};

export interface ChoreDefinition {
  id: string;
  title: string;
  description: string;
  fine: number;
  cycle: string[];
  type: 'weekly' | 'on-demand' | 'timed';
}

export const CHORES: Record<string, ChoreDefinition> = {
  sweeping: {
    id: 'sweeping',
    title: 'Sweeping & Mopping',
    description: 'Once per week, weekends. Deadline Sunday 10pm.',
    fine: FINES.WEEKLY_CHORE,
    cycle: CHORE_CYCLES.CLEANING,
    type: 'weekly',
  },
  trash_wet: {
    id: 'trash_wet',
    title: 'Wet Trash Disposal',
    description: 'Max 2 days per bag. Resets 2-day deadline once thrown.',
    fine: FINES.WET_TRASH_VIOLATION,
    cycle: CHORE_CYCLES.TRASH_WET,
    type: 'timed',
  },
  trash_dry: {
    id: 'trash_dry',
    title: 'Dry Trash Monitoring',
    description: 'Check if full throughout the week. Throw if full.',
    fine: FINES.DRY_TRASH_VIOLATION,
    cycle: CHORE_CYCLES.TRASH_WET,
    type: 'on-demand',
  },
  kitchen: {
    id: 'kitchen',
    title: 'Kitchen Cleanup',
    description: 'Once per week, weekends. Deadline Sunday 10pm.',
    fine: FINES.WEEKLY_CHORE,
    cycle: CHORE_CYCLES.KITCHEN,
    type: 'weekly',
  },
  toilet: {
    id: 'toilet',
    title: 'Toilet Cleanup',
    description: 'Once per week, weekends. Deadline Sunday 10pm.',
    fine: FINES.WEEKLY_CHORE,
    cycle: CHORE_CYCLES.TOILET,
    type: 'weekly',
  },
};
