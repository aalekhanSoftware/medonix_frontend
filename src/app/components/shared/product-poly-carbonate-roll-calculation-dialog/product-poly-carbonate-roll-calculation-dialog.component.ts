import { Component, Inject, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule, AbstractControl } from '@angular/forms';
import { Product } from '../../../models/product.model';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-product-poly-carbonate-roll-calculation-dialog',
  templateUrl: './product-poly-carbonate-roll-calculation-dialog.component.html',
  styleUrls: ['./product-poly-carbonate-roll-calculation-dialog.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule]
})
export class ProductPolyCarbonateRollCalculationDialogComponent implements OnDestroy {
  product: Product;
  
  calculationForm!: FormGroup;
  totals = {
    totalLength: 0,
    totalWidth: 0,
    totalTotal: 0
  };

  // Add calculationBase property with default 'SF'
  calculationBase: string = 'SF';
  manualQuantity: number = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private dialogRef: DialogRef<any>,
    @Inject(DIALOG_DATA) public data: { 
      product: Product;
      savedCalculations: any[];
      calculationBase?: string; // Add optional calculationBase property
      quantity?: number; // Add optional quantity property
    }
  ) {
    this.product = data.product;
    
    // Set calculationBase from data or default to 'SF' if null or empty
    if (data.calculationBase && data.calculationBase !== '') {
      this.calculationBase = data.calculationBase;
    } else {
      this.calculationBase = 'SF';
    }
    this.manualQuantity = data.quantity || 0;
    // this.calculationForm.get('manualQuantity')?.setValue(this.manualQuantity);
    
    this.initForm();
    if (data.savedCalculations?.length) {
      this.loadSavedCalculations();
    }
  }

  private initForm(): void {
    this.calculationForm = this.fb.group({
      calculations: this.fb.array([]),
      manualQuantity: [this.manualQuantity || 0, [Validators.min(0.01)]]
    });
    this.addRow();
  }

  // Getter to check if manual mode is selected
  get isManualMode(): boolean {
    return this.calculationBase === 'M';
  }

  get calculationsArray(): FormArray {
    return this.calculationForm.get('calculations') as FormArray;
  }

  // Method to update validators when calculationBase changes
  onCalculationBaseChange(): void {
    const validators = this.isManualMode ? [Validators.min(0.01)] : [Validators.required, Validators.min(0.01)];
    
    // Update validators on all existing rows
    this.calculationsArray.controls.forEach(control => {
      control.get('length')?.setValidators(validators);
      control.get('width')?.setValidators(validators);
      control.get('length')?.updateValueAndValidity({ emitEvent: false });
      control.get('width')?.updateValueAndValidity({ emitEvent: false });
    });
  }

  addRow(): void {
    // In manual mode, validators are optional; in SF mode, they're required
    const validators = this.isManualMode ? [Validators.min(0.01)] : [Validators.required, Validators.min(0.01)];
    
    // Initialize with null instead of 0 to avoid validation errors on initial load
    const row = this.fb.group({
      length: [null, validators],
      width: [null, validators],
      total: [{value: 0, disabled: true}]
    });

    const newIndex = this.calculationsArray.length;
    const subscription = row.valueChanges.subscribe(() => {
      this.calculateRow(newIndex);
    });
    this.subscriptions.push(subscription);
    
    this.calculationsArray.push(row);
  }

  removeRow(index: number): void {
    if (this.calculationsArray.length === 1) return;
    
    // Unsubscribe from the removed row's subscription
    if (this.subscriptions[index]) {
      this.subscriptions[index].unsubscribe();
      this.subscriptions.splice(index, 1);
    }
    
    this.calculationsArray.removeAt(index);
    
    // Re-subscribe remaining rows with correct indices
    this.calculationsArray.controls.forEach((control, newIndex) => {
      if (this.subscriptions[newIndex]) {
        this.subscriptions[newIndex].unsubscribe();
      }
      this.subscriptions[newIndex] = control.valueChanges.subscribe(() => {
        this.calculateRow(newIndex);
      });
    });

    this.calculateTotals();
  }

  isFormArrayInvalid(): boolean {
    if (this.isManualMode) {
      // In manual mode, calculations are optional
      return false;
    }
    
    // In SF mode, check if all required fields have valid values
    return this.calculationsArray.controls.some(control => {
      const length = control.get('length');
      const width = control.get('width');
      
      // Check if either field is empty (null/undefined/0) or invalid
      const lengthValue = length?.value;
      const widthValue = width?.value;
      
      // Fields are required, so check if they're filled and valid
      const lengthEmpty = lengthValue === null || lengthValue === undefined || lengthValue === 0 || lengthValue === '';
      const widthEmpty = widthValue === null || widthValue === undefined || widthValue === 0 || widthValue === '';
      
      // Return true if either field is empty or invalid
      return lengthEmpty || widthEmpty || length?.invalid || width?.invalid;
    });
  }

  private calculateRow(index: number): void {
    const row = this.calculationsArray.at(index);
    const lengthValue = row.get('length')?.value;
    const widthValue = row.get('width')?.value;
    
    // Only calculate if both values are provided and valid
    if (lengthValue !== null && lengthValue !== undefined && widthValue !== null && widthValue !== undefined) {
      const length = Number(lengthValue || 0);
      const width = Number(widthValue || 0);
      const total = Number((length * width).toFixed(4));

      row.patchValue({
        total: total
      }, { emitEvent: false });
    } else {
      row.patchValue({
        total: 0
      }, { emitEvent: false });
    }

    this.calculateTotals();
  }

  private calculateTotals(): void {
    this.totals = this.calculationsArray.controls.reduce((acc, control) => {
      const values = control.getRawValue();
      const length = values.length !== null && values.length !== undefined ? Number(values.length) : 0;
      const width = values.width !== null && values.width !== undefined ? Number(values.width) : 0;
      const total = Number(values.total || 0);

      return {
        totalLength: acc.totalLength + length,
        totalWidth: acc.totalWidth + width,
        totalTotal: acc.totalTotal + total
      };
    }, {
      totalLength: 0,
      totalWidth: 0,
      totalTotal: 0
    });
    
    // Round totalTotal to 4 decimal places
    this.totals.totalTotal = Number(this.totals.totalTotal.toFixed(4));
  }

  private loadSavedCalculations(): void {
    this.calculationsArray.clear();
    
    // Unsubscribe from all existing subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    
    if (!this.data.savedCalculations || !this.data.savedCalculations.length) {
      this.addRow();
      return;
    }

    // In manual mode, validators are optional; in SF mode, they're required
    const validators = this.isManualMode ? [Validators.min(0.01)] : [Validators.required, Validators.min(0.01)];

    this.data.savedCalculations.forEach((calc: any) => {
      // Handle both object format (from quotation) and direct properties
      const length = calc.length || 0;
      const width = calc.width || 0;
      const total = calc.total || (length * width);

      const row = this.fb.group({
        length: [length, validators],
        width: [width, validators],
        total: [{value: total, disabled: true}]
      });

      const currentIndex = this.calculationsArray.length;
      const subscription = row.valueChanges.subscribe(() => {
        this.calculateRow(currentIndex);
      });
      this.subscriptions.push(subscription);
      
      this.calculationsArray.push(row);
    });
    
    // Calculate totals for all rows
    this.calculationsArray.controls.forEach((_, index) => {
      this.calculateRow(index);
    });
    this.calculateTotals();
  }

  // Add keyboard shortcut listener for Alt+R
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Check if Alt+R is pressed
    if (event.altKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      this.addRow();
    }
  }

  onSave(): void {
    // If manual mode, validate manual quantity (required)
    if (this.isManualMode) {
      const manualQty = this.calculationForm.get('manualQuantity')?.value || 0;
      if (!manualQty || manualQty <= 0) {
        this.calculationForm.get('manualQuantity')?.markAsTouched();
        return;
      }
      // In manual mode, calculations are optional - no validation needed
    } else {
      // Validate calculation form for SF mode
      // Check if all calculation rows have valid length and width values
      const hasInvalidRows = this.calculationsArray.controls.some(control => {
        const lengthValue = control.get('length')?.value;
        const widthValue = control.get('width')?.value;
        
        // Both length and width must be provided and valid (> 0)
        if (!lengthValue || lengthValue <= 0 || !widthValue || widthValue <= 0) {
          // Mark fields as touched to show validation errors
          control.get('length')?.markAsTouched();
          control.get('width')?.markAsTouched();
          return true; // This row is invalid
        }
        
        // Check if the control itself is invalid
        if (control.invalid) {
          return true;
        }
        
        return false;
      });
      
      if (hasInvalidRows) {
        return; // Don't save if any row is invalid
      }
    }

    // Always save all calculation rows (length, width, total) as is, whether in SF or Manual mode
    const calculations = this.calculationsArray.controls.map(control => {
      const values = control.getRawValue();
      return {
        length: Number(values.length || 0),
        width: Number(values.width || 0),
        total: Number(values.total || 0)
      };
    });

    // Determine final quantity based on calculationBase
    let finalQuantity: number;
    if (this.isManualMode) {
      // Use manual quantity when 'M' is selected
      finalQuantity = Number(this.calculationForm.get('manualQuantity')?.value || 0);
    } else {
      // Use calculated total for 'SF' mode
      finalQuantity = this.totals.totalTotal;
    }

    const result = {
      calculations: calculations, // Always save calculations (length, width, total) as is
      totals: this.totals,
      finalValue: finalQuantity,
      quantity: finalQuantity, // Final quantity from manual input or calculated total
      calculationBase: this.calculationBase // Include calculationBase in result
    };

    this.dialogRef.close(result);
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

    // Reset form to release form subscriptions
    if (this.calculationForm) {
      this.calculationForm.reset();
    }
  }
}
