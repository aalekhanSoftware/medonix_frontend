export interface ProductCalculation {
  feet: number;
  inch: number;
  nos: number;
  mm: number;
  size_in_rfeet?: number;
  runningFeet: number;
  sqFeet: number;
  weight: number;
}

export interface SQFTProductCalculationTotal {
  totalFeet: number;
  totalInch: number;
  totalNos: number;
  totalRunningFeet: number;
  totalSqFeet: number;
  totalWeight?: number;
  totalMeter: number;
}

export interface MMProductCalculationTotal {
  totalSizeInMM: number;
  totalNos: number;
  totalSizeInRunningFeet: number;
  totalRunningFeet: number;
  totalSqFeet: number;
  totalWeight?: number;
  totalMeter: number;
}

export interface SqFeetProductCalculationTotal {
  totalFeet: number;
  totalInch: number;
  totalNos: number;
  totalRunningFeet: number;
  totalSqFeet: number;
  totalWeight?: number;
  totalMeter?: number;
}