import { Direction } from '../enums/index.js';

export interface DXYCorrelation {
  dxyStructure: Direction;
  eurusdConfirms: boolean;
  eurusdConfluencePoints: number;
  divergenceAlert: boolean;
  dxyAtPOI: boolean;
  dxyBiasSummary: string;
  recommendation: string;
}

export interface SMTDivergence {
  detected: boolean;
  instrument1: string;
  instrument2: string;
  type: 'bullish' | 'bearish';
  description: string;
  significance: 'HIGH' | 'MEDIUM' | 'LOW';
}
