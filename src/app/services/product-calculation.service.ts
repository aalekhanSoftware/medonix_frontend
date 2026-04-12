import { Injectable } from '@angular/core';
import { ProductCalculation, SQFTProductCalculationTotal } from '../models/product-calculation.model';
import { PolyCarbonateType, Product, ProductMainType } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductCalculationService {
  MM_TO_FEET_CONVERSION = 304.8; // 1 foot = 304.8 mm
  DEFAULT_SQ_FEET_MULTIPLIER = 3.5; // Default multiplier for REGULAR products

  calculateRunningFeet(feet: number, inch: number, nos: number): number {
    const totalInches = (feet * 12) + inch;
    return (totalInches / 12) * nos;
  }

  calculateSqFeet(runningFeet: number, product?: Product): number {
    // Use product-specific multiplier if available and for REGULAR products only
    if (product && product.type.toUpperCase() === ProductMainType.REGULAR.toUpperCase()) {
      const multiplier = product.sqFeetMultiplier && product.sqFeetMultiplier > 0 
        ? product.sqFeetMultiplier 
        : this.DEFAULT_SQ_FEET_MULTIPLIER;
      return runningFeet * multiplier;
    }
    // For non-REGULAR products or when no product is provided, return runningFeet as is
    return runningFeet;
  }

  calculateWeight(runningFeet: number, product: Product): number {
    const weightMultiplier = this.getPolyCarbonateWeightMultiplier(product);
    return runningFeet * product.weight * weightMultiplier;
  }

  private getPolyCarbonateWeightMultiplier(product: Product): number {
    if (product.type === ProductMainType.POLY_CARBONATE && product.polyCarbonateType) {
      switch (product.polyCarbonateType) {
        case PolyCarbonateType.SINGLE:
          return 1.16;
        case PolyCarbonateType.DOUBLE:
          return 2;
        case PolyCarbonateType.FULL_SHEET:
          return 4;
        default:
          return 1;
      }
    }
    return 1;
  }

  calculateTotals(calculations: ProductCalculation[]): SQFTProductCalculationTotal {
    return calculations.reduce((acc, curr) => ({
      totalFeet: acc.totalFeet + curr.feet,
      totalInch: acc.totalInch + curr.inch,
      totalNos: acc.totalNos + curr.nos,
      totalRunningFeet: acc.totalRunningFeet + curr.runningFeet,
      totalSqFeet: acc.totalSqFeet + curr.sqFeet,
      totalWeight: acc.totalWeight + curr.weight,
      totalMeter: 0 // This will be calculated elsewhere if needed
    }), {
      totalFeet: 0,
      totalInch: 0,
      totalNos: 0,
      totalRunningFeet: 0,
      totalSqFeet: 0,
      totalWeight: 0,
      totalMeter: 0
    });
  }

  convertMMToSqFeet(sqMM: number): number {
    return sqMM / (this.MM_TO_FEET_CONVERSION * this.MM_TO_FEET_CONVERSION);
  }

  convertSqFeetToMM(sqFeet: number): number {
    return sqFeet * (this.MM_TO_FEET_CONVERSION * this.MM_TO_FEET_CONVERSION);
  }
}