import { Component, Input, Output, EventEmitter, Inject, HostListener, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { PolyCarbonateType, Product, ProductCalculationType, ProductMainType } from '../../../models/product.model';
import { MMProductCalculationTotal, SQFTProductCalculationTotal } from '../../../models/product-calculation.model';
import { CommonModule } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CalculationService } from '../../../shared/services/calculation.service';
import { Subscription } from 'rxjs';
import { ProductCalculationService } from '../../../services/product-calculation.service';

@Component({
  selector: 'app-product-calculation-dialog',
  templateUrl: './product-calculation-dialog.component.html',
  styleUrls: ['./product-calculation-dialog.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  providers: [CalculationService, ProductCalculationService]
})
export class ProductCalculationDialogComponent implements OnDestroy {
  product: any = null;
  calculationType: ProductCalculationType;
  // Add calculationBase property
  calculationBase: string = 'W'; // Default to Weight
  
  calculationForm!: FormGroup;
  sqftTotals: SQFTProductCalculationTotal = {
    totalFeet: 0,
    totalInch: 0,
    totalNos: 0,
    totalRunningFeet: 0,
    totalSqFeet: 0,
    totalMeter: 0,
    ...(this.product?.type !== 'POLY_CARBONATE' ? {totalWeight: 0} : {})
  };
  mmTotals: MMProductCalculationTotal = {
    totalSizeInMM: 0,
    totalNos: 0,
    totalSizeInRunningFeet: 0,
    totalRunningFeet: 0,
    totalSqFeet: 0,
    totalMeter: 0,
    ...(this.product?.type !== 'POLY_CARBONATE' ? {totalWeight: 0} : {})
  };

  // Add calculation base options
  calculationBaseOptions = [
    { value: 'W', label: 'Weight' },
    { value: 'RF', label: 'Running Feet' },
    { value: 'SF', label: 'Sq.Feet' },
    { value: 'N', label: 'NOS' }
  ];

  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private dialogRef: DialogRef<any>,
    @Inject(DIALOG_DATA) public data: { 
      product: Product; 
      calculationType: ProductCalculationType;
      savedCalculations: any[];
      calculationBase?: string; // Add optional calculationBase property
    },
    private calculationService: CalculationService,
    private productCalculationService: ProductCalculationService
  ) {
    this.product = data.product;
    this.calculationType = data.calculationType;

    // Set default calculation base from data if available
    if (data && data.calculationBase) {
      this.calculationBase = data.calculationBase;
    }

    if(this.product.type === 'POLY_CARBONATE'){
      this.sqftTotals.totalWeight = 0;
      this.mmTotals.totalWeight = 0;
    }

    this.initForm();
    if (data.savedCalculations?.length) {
      this.loadSavedCalculations();
    }
  }

  private initForm(): void {
    this.calculationForm = this.fb.group({
      calculations: this.fb.array([])
    });
    this.addRow();
  }

  get calculationsArray(): FormArray {
    return this.calculationForm.get('calculations') as FormArray;
  }

  get canSelectNOS(): boolean {
    return this.calculationsArray.length === 1;
  }

  addRow(): void {
    let row: FormGroup;
    const newIndex = this.calculationsArray.length;

    if(this.calculationType === 'MM') {
      row = this.fb.group({
        mm: [0, [Validators.required, Validators.min(0)]],
        size_in_rfeet: [{value: 0, disabled: true}],
        nos: [1, [Validators.required, Validators.min(1)]],
        runningFeet: [{value: 0, disabled: true}],
        ...(this.product.type === 'POLY_CARBONATE' 
          ? {sqFeet: [{value: 0, disabled: true}]} 
          : {weight: [{value: 0, disabled: true}]}),
        meter: [{ value: 0, disabled: true }]
      }, { validators: this.feetInchValidator() });
    } else {
      row = this.fb.group({
        feet: [0, [Validators.required, Validators.min(0)]],
        inch: [0, [Validators.required, Validators.min(0)]],
        nos: [1, [Validators.required, Validators.min(1)]],
        runningFeet: [{value: 0, disabled: true}],
        sqFeet: [{value: 0, disabled: true}],
        ...(this.product.type !== 'POLY_CARBONATE' ? {weight: [{value: 0, disabled: true}]}:{}),
        meter: [{ value: 0, disabled: true }]
      }, { validators: this.feetInchValidator() });
    }

    this.calculationsArray.push(row);
    const subscription = row.valueChanges.subscribe(() => this.calculateRow(newIndex));
    this.subscriptions.push(subscription);
    
    // If calculationBase is 'N' and rows are now > 1, reset to 'W'
    if (this.calculationBase === 'N' && this.calculationsArray.length > 1) {
      this.calculationBase = 'W';
    }
  }

  isFormArrayInvalid(){
    return this.calculationsArray.controls.some(control => {
      return control.invalid;
    });
  }

  removeRow(index: number): void {
    if (this.calculationsArray.length === 1) return;
    
    // Unsubscribe from the removed row's subscription
    if (this.subscriptions[index]) {
      this.subscriptions[index].unsubscribe();
      this.subscriptions.splice(index, 1);
    }
    
    this.calculationsArray.removeAt(index);
    
    // Resubscribe remaining rows with correct indices
    this.calculationsArray.controls.forEach((control, newIndex) => {
      if (this.subscriptions[newIndex]) {
        this.subscriptions[newIndex].unsubscribe();
      }
      this.subscriptions[newIndex] = control.valueChanges.subscribe(() => {
        this.calculateRow(newIndex);
      });
    });

    this.calculateTotals();
    
    // If calculationBase is 'N' and rows are still > 1 after removal, reset to 'W'
    // Note: This should rarely happen since removeRow prevents removal when length === 1
    if (this.calculationBase === 'N' && this.calculationsArray.length > 1) {
      this.calculationBase = 'W';
    }
  }

  private getWeightMultiplier(): number {
    if (this.product.type.toString() === 'POLY_CARBONATE') {
      switch (this.product.polyCarbonateType) {
        case PolyCarbonateType.SINGLE: {
          return 1.16;
        }
        case PolyCarbonateType.DOUBLE: {
          return 2;
        }
        case PolyCarbonateType.FULL_SHEET: {
          return 4;
        }
        default: {
          return 1;
        }
      }
    }
    return 1;
  }

  private calculateRow(index: number): void {
    const row = this.calculationsArray.at(index);
    const weightMultiplier = this.getWeightMultiplier();

    if(this.calculationType === ProductCalculationType.SQ_FEET) {
      const feet = row.get('feet')?.value || 0;
      const inch = row.get('inch')?.value || 0;
      const nos = row.get('nos')?.value || 1;
      
      const totalInches = (feet * 12) + inch;
      const runningFeet = (totalInches / 12) * nos;
      
      // Use the product-specific multiplier for REGULAR products
      const sqFeet = this.product.type.toUpperCase() === ProductMainType.REGULAR.toUpperCase() 
        ? this.productCalculationService.calculateSqFeet(runningFeet, this.product)
        : runningFeet * weightMultiplier;

      const weight = this.product.type.toUpperCase() === ProductMainType.REGULAR.toUpperCase() 
        ? runningFeet * (this.product.weight || 0)
        : runningFeet * weightMultiplier;
        
      if(this.product.type === 'POLY_CARBONATE'){
        row.patchValue({
          runningFeet: Number(runningFeet.toFixed(3)),
          sqFeet: Number(sqFeet.toFixed(3)),
          weight: Number(weight.toFixed(3))
        }, { emitEvent: false });
      } else {
        row.patchValue({
          runningFeet: Number(runningFeet.toFixed(3)),
          sqFeet: Number(sqFeet.toFixed(2)),
          weight: Number(weight.toFixed(3))
        }, { emitEvent: false });
      }
      const meter = this.calculationService.calculateMeterFromSqFeet(sqFeet);
      row.patchValue({
        meter: meter
      }, { emitEvent: false });
    } else {
      const mm = row.get('mm')?.value || 0;
      const nos = row.get('nos')?.value || 1;
      
      const mmToRFeetConversion = 304.8;
      const calcSizeInRFeet = mm / mmToRFeetConversion;
      const calcRunningFeet = calcSizeInRFeet * nos;
      const sqFeet = calcRunningFeet * weightMultiplier;
      
      if(this.product.type === 'POLY_CARBONATE') {
        row.patchValue({
          size_in_rfeet: Number(calcSizeInRFeet.toFixed(3)),
          runningFeet: Number(calcRunningFeet.toFixed(3)),
          sqFeet: Number(sqFeet.toFixed(3))
        }, { emitEvent: false });
      } else {
        const weight = calcRunningFeet * (this.product.weight || 0);
        row.patchValue({
          size_in_rfeet: Number(calcSizeInRFeet.toFixed(3)),
          runningFeet: Number(calcRunningFeet.toFixed(3)),
          weight: Number(weight.toFixed(3))
        }, { emitEvent: false });
      }
      const meter = this.calculationService.calculateMeterFromMM(mm);
      row.patchValue({
        meter: meter
      }, { emitEvent: false });
    }
    this.calculateTotals();
  }

  private calculateTotals(): void {
    if (this.calculationType === 'SQ_FEET') {
      this.sqftTotals = this.calculationsArray.controls.reduce((acc, control) => {
        const values = control.getRawValue();
        return {
          totalFeet: acc.totalFeet + (values.feet || 0),
          totalInch: acc.totalInch + (values.inch || 0),
          totalNos: acc.totalNos + (values.nos || 0),
          totalRunningFeet: acc.totalRunningFeet + (values.runningFeet || 0),
          totalSqFeet: acc.totalSqFeet + (values.sqFeet || 0),
          totalMeter: acc.totalMeter + (values.meter || 0),
          ...(this.product.type !== 'POLY_CARBONATE' ? {totalWeight: acc.totalWeight + (values.weight || 0)} : {})
        };
      }, {
        totalFeet: 0,
        totalInch: 0,
        totalNos: 0,
        totalRunningFeet: 0,
        totalSqFeet: 0,
        totalMeter: 0,
        ...(this.product.type !== 'POLY_CARBONATE' ? {totalWeight: 0} : {})
      });
    } else {
      this.mmTotals = this.calculationsArray.controls.reduce((acc, control) => {
        const values = control.getRawValue();
        return {
          totalSizeInMM: acc.totalSizeInMM + (values.mm || 0),
          totalNos: acc.totalNos + (values.nos || 0),
          totalSizeInRunningFeet: acc.totalSizeInRunningFeet + (values.size_in_rfeet || 0),
          totalRunningFeet: acc.totalRunningFeet + (values.runningFeet || 0),
          totalSqFeet: acc.totalSqFeet + (values.sqFeet || 0),
          totalMeter: acc.totalMeter + (values.meter || 0),
          ...(this.product.type !== 'POLY_CARBONATE' ? {totalWeight: acc.totalWeight + (values.weight || 0)} : {})
        };
      }, {
        totalSizeInMM: 0,
        totalNos: 0,
        totalSizeInRunningFeet: 0,
        totalRunningFeet: 0,
        totalSqFeet: 0,
        totalMeter: 0,
        ...(this.product.type !== 'POLY_CARBONATE' ? {totalWeight: 0} : {})
      });
    }
  }

  private loadSavedCalculations(): void {
    this.calculationsArray.clear();
    
    if (!this.data.savedCalculations || !this.data.savedCalculations.length) {
      this.addRow();
      return;
    }

    this.data.savedCalculations.forEach((calc: any) => {
      let row: FormGroup;
      if (this.calculationType === 'MM') {
        row = this.fb.group({
          mm: [calc.mm || 0, [Validators.required, Validators.min(0)]],
          size_in_rfeet: [{value: calc.size_in_rfeet || 0, disabled: true}],
          nos: [calc.nos || 1, [Validators.required, Validators.min(1)]],
          runningFeet: [{value: calc.runningFeet || 0, disabled: true}],
          ...(this.product.type === 'POLY_CARBONATE' 
            ? {sqFeet: [{value: calc.sqFeet || 0, disabled: true}]} 
            : {weight: [{value: calc.weight || 0, disabled: true}]}),
          meter: [{ value: 0, disabled: true }]
        }, { validators: this.feetInchValidator() });
      } else {
        row = this.fb.group({
          feet: [calc.feet || 0, [Validators.required, Validators.min(0)]],
          inch: [calc.inch || 0, [Validators.required, Validators.min(0)]],
          nos: [calc.nos || 1, [Validators.required, Validators.min(1)]],
          runningFeet: [{value: calc.runningFeet || 0, disabled: true}],
          sqFeet: [{value: calc.sqFeet || 0, disabled: true}],
          ...(this.product.type !== 'POLY_CARBONATE' ? {weight: [{value: calc.weight || 0, disabled: true}]}:{}),
          meter: [{ value: 0, disabled: true }]
        }, { validators: this.feetInchValidator() });
      }

      this.calculationsArray.push(row);
      const currentIndex = this.calculationsArray.length - 1;
      const subscription = row.valueChanges.subscribe(() => this.calculateRow(currentIndex));
      this.subscriptions.push(subscription);
    });
    
    this.calculationsArray.controls.forEach((_, index) => {
      this.calculateRow(index);
    });
    this.calculateTotals();
  }

  onSave(): void {
    if (this.calculationForm.valid) {
      const latestCalculations = this.calculationsArray.controls.map(control => {
        const values = control.getRawValue();
        return this.calculationType === 'MM' ? {
          mm: values.mm || 0,
          size_in_rfeet: Number(values.size_in_rfeet?.toFixed(3)) || 0,
          nos: values.nos || 0,
          runningFeet: Number(values.runningFeet?.toFixed(3)) || 0,
          sqFeet: this.product.type === 'POLY_CARBONATE' ? Number(values.sqFeet?.toFixed(3)) || 0 : 0,
          weight: this.product.type !== 'POLY_CARBONATE' ? Number(values.weight?.toFixed(3)) || 0 : 0
        } : {
          feet: values.feet || 0,
          inch: values.inch || 0,
          nos: values.nos || 0,
          runningFeet: Number(values.runningFeet?.toFixed(3)) || 0,
          sqFeet: this.product.type === 'POLY_CARBONATE' ? Number(values.sqFeet?.toFixed(3)) || 0 : 0,
          weight: this.product.type !== 'POLY_CARBONATE' ? Number(values.weight?.toFixed(3)) || 0 : 0
        };
      });

      this.calculateTotals();
      
      // Determine the final value based on calculationBase
      let finalValue = 0;
      if (this.product.type === 'POLY_CARBONATE') {
        finalValue = this.calculationType === 'SQ_FEET' ? this.sqftTotals.totalSqFeet : this.mmTotals.totalSqFeet;
      } else {
        // For non-POLY_CARBONATE products, use the selected calculation base
        switch (this.calculationBase) {
          case 'N': // NOS
            finalValue = this.calculationType === 'SQ_FEET' ? this.sqftTotals.totalNos : this.mmTotals.totalNos;
            break;
          case 'RF': // Running Feet
            finalValue = this.calculationType === 'SQ_FEET' ? this.sqftTotals.totalRunningFeet : this.mmTotals.totalRunningFeet;
            break;
          case 'SF': // Sq. Feet
            finalValue = this.calculationType === 'SQ_FEET' ? this.sqftTotals.totalSqFeet : this.mmTotals.totalSqFeet;
            break;
          case 'W': // Weight (default)
          default:
            finalValue = this.calculationType === 'SQ_FEET' ? (this.sqftTotals.totalWeight || 0) : (this.mmTotals.totalWeight || 0);
            break;
        }
      }

      const result = {
        calculations: latestCalculations,
        totals: this.calculationType === 'SQ_FEET' ? this.sqftTotals : this.mmTotals,
        finalValue: finalValue,
        calculationBase: this.calculationBase // Pass the selected calculation base
      };

      this.dialogRef.close(result);
    }
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  private feetInchValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      if(this.calculationType === 'SQ_FEET'){
        const feet = group.get('feet')?.value || 0;
        const inch = group.get('inch')?.value
        if (feet === 0 && inch === 0) {
          return { bothZero: true };
        }
      }

      if(this.calculationType === 'MM'){
        const mm = group.get('mm')?.value || 0;
        if (mm === 0){
          return { mmZero: true };
        }
      }
      return null;
    };
  }

  private createCalculationGroup(item: any, calculationType: string): FormGroup {
    return this.fb.group({
      mm: [item.mm, calculationType === 'MM' ? Validators.required : null],
      feet: [item.feet],
      nos: [item.nos, Validators.required],
      weight: [item.weight, Validators.required],
      id: [item?.id],
      inch: [item.inch],
      sqFeet: [item.sqFeet, Validators.required],
      runningFeet: [item.runningFeet, Validators.required],
      meter: [{ value: 0, disabled: true }]
    }, { validators: this.feetInchValidator() });
  }

  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];

    // Reset form to release form subscriptions
    if (this.calculationForm) {
      this.calculationForm.reset();
    }
  }

  // Add keyboard shortcut listener for Alt+A
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Check if Alt+A is pressed
    if (event.altKey && event.key.toLowerCase() === 'r') {
      event.preventDefault(); // Prevent default browser behavior
      this.addRow();
    }
  }
}