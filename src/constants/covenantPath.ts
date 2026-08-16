export interface CovenantMilestone {
  id: string;
  label: string;
  icon: string;
  iconFamily?: 'Ionicons' | 'MaterialCommunityIcons';
  /** Priesthood ordination only applies to men — see PersonCovenantPathTab. */
  maleOnly: boolean;
  /** Nothing starts checked — every step is marked by hand as it actually happens. */
  defaultComplete: boolean;
}

/**
 * The Church's standard convert covenant path, in the order it's walked.
 * Aaronic Priesthood ordination falls between confirmation and the patriarchal
 * blessing; Melchizedek falls between the blessing and the endowment.
 */
export const COVENANT_PATH_MILESTONES: CovenantMilestone[] = [
  // 'waves' over a plain droplet -- immersion, not a faucet.
  { id: 'baptism', label: 'Baptism', icon: 'waves', iconFamily: 'MaterialCommunityIcons', maleOnly: false, defaultComplete: false },
  // Neither icon set actually has a dove — this is MaterialCommunityIcons'
  // closest glyph, standing in for the gift of the Holy Ghost.
  { id: 'confirmation', label: 'Confirmation', icon: 'bird', iconFamily: 'MaterialCommunityIcons', maleOnly: false, defaultComplete: false },
  { id: 'aaronic_priesthood', label: 'Aaronic Priesthood', icon: 'key-outline', iconFamily: 'Ionicons', maleOnly: true, defaultComplete: false },
  { id: 'patriarchal_blessing', label: 'Patriarchal Blessing', icon: 'document-text-outline', iconFamily: 'Ionicons', maleOnly: false, defaultComplete: false },
  // Filled, pairing with Aaronic's outline key the way the old shield icons did.
  { id: 'melchizedek_priesthood', label: 'Melchizedek Priesthood', icon: 'key', iconFamily: 'Ionicons', maleOnly: true, defaultComplete: false },
  // Same chapel glyph the church/temple event types already share.
  { id: 'endowment', label: 'Endowment', icon: 'church', iconFamily: 'MaterialCommunityIcons', maleOnly: false, defaultComplete: false },
  { id: 'sealing', label: 'Sealing', icon: 'human-male-female-child', iconFamily: 'MaterialCommunityIcons', maleOnly: false, defaultComplete: false },
];

export const DEFAULT_COMPLETE_MILESTONES = COVENANT_PATH_MILESTONES
  .filter(m => m.defaultComplete)
  .map(m => m.id);

/** The path for a given gender — priesthood ordination dropped for a woman. */
export function milestonesFor(gender: 'male' | 'female' | undefined): CovenantMilestone[] {
  return COVENANT_PATH_MILESTONES.filter(m => !m.maleOnly || gender !== 'female');
}
