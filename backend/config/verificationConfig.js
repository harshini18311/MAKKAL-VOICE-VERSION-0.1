/**
 * Configurable weights for the six signal categories (must sum to 1).
 * Each stage produces a contribution 0–100; final score is the weighted average.
 */
module.exports = {
  categoryWeights: {
    firewall: 0.1,
    identityTrust: 0.15,
    geoExif: 0.2,
    aiContent: 0.25,
    duplicateRelated: 0.15,
    behavioural: 0.15
  },
  thresholds: {
    real: 70,
    reviewMin: 40
  },
  /** Flags that count toward “stacked” fake penalties (cross-stage). */
  seriousFakeFlags: [
    'object_category_mismatch',
    'semantic_contradiction',
    'description_image_contradiction',
    'image_manipulation_detected',
    'exif_coordinate_mismatch',
    'vpn_detected',
    'suspicious_location',
    'stale_timestamp',
    'stale_gps',
    'missing_evidence',
    'coordinated_cluster_flag',
    'possible_sim_swap'
  ],
  /** Extra points shaved off final score per serious flag after the first (compounds fake likelihood). */
  fakeStackPenaltyPerFlag: 6,
  /** If enough serious signals and score is weak, force FAKE (unless duplicate/related). */
  fakeForceMinSeriousFlags: 3,
  fakeForceMaxScore: 52,
  trust: {
    initial: 50,
    highExpedite: 75,
    lowMandatoryReview: 30,
    fakePenalty: 10,
    realBonus: 5
  },
  duplicateCosineHigh: 0.88,
  duplicateCosineRelated: 0.7,
  duplicateLookbackDays: 7,
  duplicateRadiusM: 10,
  gpsMaxAgeMs: 60 * 1000,
  exifDistanceMaxM: 20,
  exifTimeMaxHours: 24,
  ipGpsMaxKm: 50,
  cluster: {
    minAccounts: 5,
    radiusM: 50,
    windowMs: 10 * 60 * 1000
  },
  semanticContradictionMinSimilarity: 0.35,
  visionCategoryMismatchMaxConfidence: 0.55,
  fakeFlagsBanWindowDays: 30,
  fakeFlagsBanThreshold: 3,
  maxBodyTextLength: 20000,
  abortOnStage3HardFail: false
};
