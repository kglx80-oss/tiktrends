export * from './radar';
export * from './naming';
export * from './ingest';
export * from './tags';
export * from './diagnostic';
export * from './credits';
export * from './economics';
export * from './launch';
export * from './briefs';
export * from './angles';
// ADSMAP · `median` existe déjà dans ./angles (autre définition, autre usage) :
// on exporte celle du moteur de verdict sous un nom explicite.
export * from './adsmap/types';
export * from './adsmap/invariants';
export { median as medianOrNull } from './adsmap/stats';
export {
  logGamma, gammaP, chi2Quantile, poissonInterval, wilsonInterval, normalQuantile,
  deriveMetrics, type Interval, type AdMetrics, type DerivedMetrics,
} from './adsmap/stats';
export * from './adsmap/verdict';
export * from './adsmap/ai-budget';
