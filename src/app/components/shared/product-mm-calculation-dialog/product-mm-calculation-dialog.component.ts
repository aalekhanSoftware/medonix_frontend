import { Component, Input, Output, EventEmitter, Inject, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { PolyCarbonateType, Product, ProductMainType } from '../../../models/product.model';
import { ProductCalculationService } from '../../../services/product-calculation.service';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-product-mm-calculation-dialog',
  templateUrl: './product-mm-calculation-dialog.component.html',
  styleUrls: ['./product-mm-calculation-dialog.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class ProductMMCalculationDialogComponent implements OnDestroy {
  product: Product;
  
  calculationForm!: FormGroup;
  totals = {
    totalLength: 0,
    totalWidth: 0,
    totalNos: 0,
    totalSqMM: 0,
    totalSqFeet: 0,
    totalWeight: 0
  };

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private calculationService: ProductCalculationService,
    private dialogRef: DialogRef<any>,
    @Inject(DIALOG_DATA) public data: { 
      product: Product;
      savedCalculations: any[];
    }
  ) {
    this.product = data.product;
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

  addRow(): void {
    const row = this.fb.group({
      length: [0, [Validators.required, Validators.min(0)]],
      width: [0, [Validators.required, Validators.min(0)]],
      nos: [1, [Validators.required, Validators.min(1)]],
      sqMM: [{value: 0, disabled: true}],
      sqFeet: [{value: 0, disabled: true}],
      weight: [{value: 0, disabled: true}]
    });

    const sub = row.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.calculateRow(this.calculationsArray.length - 1));
    this.subscriptions.push(sub);
    this.calculationsArray.push(row);
  }

  removeRow(index: number): void {
    if (this.calculationsArray.length > 1) {
      this.calculationsArray.removeAt(index);
      this.calculateTotals();
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
    const length = row.get('length')?.value || 0;
    const width = row.get('width')?.value || 0;
    const nos = row.get('nos')?.value || 1;

    const sqMM = length * width * nos;
    const sqFeet = this.calculationService.convertMMToSqFeet(sqMM);
    
    // Use the product-specific multiplier for REGULAR products
    const runningFeet = sqFeet; // For MM calculations, sqFeet is equivalent to runningFeet in this context
    const sqFeetWithMultiplier =  this.product.type.toUpperCase() === ProductMainType.REGULAR.toUpperCase()
      ? this.calculationService.calculateSqFeet(runningFeet, this.product)
      : sqFeet;
    
    const weightMultiplier = this.getWeightMultiplier();
    
    const weight = this.product.type.toUpperCase() === ProductMainType.REGULAR.toUpperCase() 
      ? sqFeetWithMultiplier * (this.product.weight || 0)
      : sqFeetWithMultiplier * weightMultiplier;

    row.patchValue({
      sqMM: Number(sqMM.toFixed(2)),
      sqFeet: Number(sqFeetWithMultiplier.toFixed(2)),
      weight: Number(weight.toFixed(2))
    }, { emitEvent: false });

    this.calculateTotals();
  }

  private calculateTotals(): void {
    this.totals = this.calculationsArray.controls.reduce((acc, control) => {
      const values = control.value;
      const sqMM = control.get('sqMM')?.value || 0;
      const sqFeet = control.get('sqFeet')?.value || 0;
      const weight = control.get('weight')?.value || 0;

      return {
        totalLength: acc.totalLength + (values.length || 0),
        totalWidth: acc.totalWidth + (values.width || 0),
        totalNos: acc.totalNos + (values.nos || 0),
        totalSqMM: acc.totalSqMM + sqMM,
        totalSqFeet: acc.totalSqFeet + sqFeet,
        totalWeight: acc.totalWeight + weight
      };
    }, {
      totalLength: 0,
      totalWidth: 0,
      totalNos: 0,
      totalSqMM: 0,
      totalSqFeet: 0,
      totalWeight: 0
    });
  }

  private loadSavedCalculations(): void {
    this.calculationsArray.clear();
    
    this.data.savedCalculations.forEach(calc => {
      const row = this.fb.group({
        length: [calc.length || 0, [Validators.required, Validators.min(0)]],
        width: [calc.width || 0, [Validators.required, Validators.min(0)]],
        nos: [calc.nos || 1, [Validators.required, Validators.min(1)]],
        sqMM: [{value: calc.sqMM || 0, disabled: true}],
        sqFeet: [{value: calc.sqFeet || 0, disabled: true}],
        weight: [{value: calc.weight || 0, disabled: true}]
      });

      const sub = row.valueChanges
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.calculateRow(this.calculationsArray.length - 1));
      this.subscriptions.push(sub);
      this.calculationsArray.push(row);
    });
    
    this.calculateTotals();
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

  onSave(): void {
    if (this.calculationForm.valid) {
      const result = {
        ...this.totals,
        calculations: this.calculationsArray.controls.map(control => ({
          ...control.value,
          sqMM: control.get('sqMM')?.value,
          sqFeet: control.get('sqFeet')?.value,
          weight: control.get('weight')?.value
        }))
      };
      this.dialogRef.close(result);
    }
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];

    // Complete destroy subject
    this.destroy$.next();
    this.destroy$.complete();

    // Clear form array
    if (this.calculationForm) {
      this.calculationsArray.clear();
      this.calculationForm.reset();
    }
  }
}