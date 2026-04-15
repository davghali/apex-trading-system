import { StateCreator } from 'zustand';

export type Grade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export interface CategoryScore {
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  details: string[];
}

export interface ConfluenceSlice {
  score: number;
  grade: Grade;
  recommendation: string;
  categories: CategoryScore[];
  lastUpdate: string;

  // Derived
  isTradeReady: boolean;
  gradeColor: string;
  scorePercentage: number;

  // Actions
  updateConfluence: (data: {
    score: number;
    grade: Grade;
    recommendation: string;
    categories: CategoryScore[];
  }) => void;
  resetConfluence: () => void;
}

const defaultCategories: CategoryScore[] = [
  { name: 'Bias Alignment', score: 0, maxScore: 25, weight: 0.25, details: [] },
  { name: 'Structure', score: 0, maxScore: 20, weight: 0.20, details: [] },
  { name: 'POI Quality', score: 0, maxScore: 20, weight: 0.20, details: [] },
  { name: 'Session Timing', score: 0, maxScore: 15, weight: 0.15, details: [] },
  { name: 'Confirmation', score: 0, maxScore: 20, weight: 0.20, details: [] },
];

function getGradeColor(grade: Grade): string {
  switch (grade) {
    case 'A+': return '#00C853';
    case 'A': return '#00C853';
    case 'B+': return '#4CAF50';
    case 'B': return '#8BC34A';
    case 'C': return '#FFD600';
    case 'D': return '#FF9800';
    case 'F': return '#FF1744';
    default: return '#6B7280';
  }
}

export const createConfluenceSlice: StateCreator<ConfluenceSlice, [], [], ConfluenceSlice> = (set) => ({
  score: 0,
  grade: 'F',
  recommendation: 'Awaiting analysis...',
  categories: [...defaultCategories],
  lastUpdate: '',
  isTradeReady: false,
  gradeColor: '#FF1744',
  scorePercentage: 0,

  updateConfluence: (data) =>
    set({
      score: data.score,
      grade: data.grade,
      recommendation: data.recommendation,
      categories: data.categories,
      lastUpdate: new Date().toISOString(),
      isTradeReady: data.score >= 65,
      gradeColor: getGradeColor(data.grade),
      scorePercentage: Math.min(data.score, 100),
    }),

  resetConfluence: () =>
    set({
      score: 0,
      grade: 'F',
      recommendation: 'Awaiting analysis...',
      categories: [...defaultCategories],
      lastUpdate: '',
      isTradeReady: false,
      gradeColor: '#FF1744',
      scorePercentage: 0,
    }),
});
