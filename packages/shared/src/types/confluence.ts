export interface CriterionResult {
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
  detail: string;
}

export interface CategoryScore {
  name: string;
  score: number;
  maxScore: number;
  criteria: CriterionResult[];
}

export interface ConfluenceScore {
  totalScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'F';
  recommendation: string;
  tradeable: boolean;
  positionSizeModifier: number;
  categories: {
    A_STRUCTURE_BIAS: number;
    B_POI_QUALITY: number;
    C_ENTRY_CONFIRMATION: number;
    D_TIMING_SESSION: number;
    E_RISK_FACTORS: number;
  };
  details: string[];
}
