import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CalculationService {
  private readonly SQ_FEET_TO_METER = 10.764;
  private readonly MM_TO_METER = 1000;

  calculateMeterFromSqFeet(sqFeet: number): number {
    return Number((sqFeet / this.SQ_FEET_TO_METER).toFixed(3));
  }

  calculateMeterFromMM(mm: number): number {
    return Number((mm / this.MM_TO_METER).toFixed(3));
  }
} 