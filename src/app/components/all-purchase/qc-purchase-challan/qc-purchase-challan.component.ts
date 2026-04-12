import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PurchaseChallanService } from '../../../services/purchase-challan.service';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';

@Component({
  selector: 'app-qc-purchase-challan',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule
  ],
  templateUrl: './qc-purchase-challan.component.html',
  styleUrls: ['./qc-purchase-challan.component.scss']
})
export class QcPurchaseChallanComponent implements OnInit, OnDestroy {
  qcForm: FormGroup;
  isLoading = false;
  isSaving = false;
  purchaseChallanDetails: any;
  products: any[] = [];
  savingItemId: number | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private purchaseChallanService: PurchaseChallanService,
    private productService: ProductService,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService
  ) {
    this.qcForm = this.fb.group({
      items: this.fb.array([])
    });
  }

  get itemsFormArray(): FormArray {
    return this.qcForm.get('items') as FormArray;
  }

  trackByItemIndex(index: number): number {
    return index;
  }

  ngOnInit(): void {
    const encryptedId = this.route.snapshot.paramMap.get('id');
    if (!encryptedId) {
      this.snackbar.error('Invalid purchase challan id');
      return;
    }

    const decryptedId = this.encryptionService.decrypt(encryptedId);
    const id = decryptedId ? Number(decryptedId) : NaN;
    if (!id || isNaN(id)) {
      this.snackbar.error('Invalid purchase challan id');
      return;
    }

    this.loadProducts();
    this.loadPurchaseChallanDetails(id);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadProducts(): void {
    this.productService.getProducts({ status: 'A' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
          this.products = response.data.content || response.data;
        }
        this.mapProductNames();
      },
      error: () => {
        this.snackbar.error('Failed to load products');
      }
    });
  }

  private loadPurchaseChallanDetails(id: number): void {
    this.isLoading = true;
    this.purchaseChallanService.getPurchaseChallanDetails(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        this.purchaseChallanDetails = response;
        const items = response.items || [];
        this.buildItemsForm(items);
        this.isLoading = false;
      },
      error: (error: any) => {
        this.snackbar.error(error?.error?.message || 'Failed to load purchase challan details');
        this.isLoading = false;
      }
    });
  }

  private buildItemsForm(items: any[]): void {
    this.itemsFormArray.clear();
    items.forEach(item => {
      const group = this.fb.group({
        challanItemId: [item.id],
        productId: [item.productId],
        productName: [null],
        quantity: [item.quantity],
        batchNumber: [item.batchNumber],
        qcPass: [item.qcPass, [Validators.min(0), Validators.max(item.quantity)]],
        remarks: [item.remarks]
      });
      this.itemsFormArray.push(group);
    });
    this.mapProductNames();
  }

  private mapProductNames(): void {
    if (!this.products || this.products.length === 0) {
      return;
    }
    this.itemsFormArray.controls.forEach(group => {
      const productId = group.get('productId')?.value;
      if (productId) {
        const product = this.products.find((p: any) => p.id === productId);
        if (product) {
          group.get('productName')?.setValue(product.name, { emitEvent: false });
        }
      }
    });
  }

  get isAllQcPassed(): boolean {
    if (!this.itemsFormArray || this.itemsFormArray.length === 0) {
      return false;
    }
    return this.itemsFormArray.controls.every(group => {
      const quantity = Number(group.get('quantity')?.value || 0);
      const qcPassControl = group.get('qcPass');
      const rawQcPass = qcPassControl?.value;

      if (rawQcPass === null || rawQcPass === '') {
        return false; // Pending if any null/empty
      }

      const qcPass = Number(rawQcPass);
      return !isNaN(qcPass) && qcPass <= quantity; // 0 also Pass
    });
  }

  isItemQcPassed(control: AbstractControl | null): boolean {
    if (!control) {
      return false; // Pending
    }

    const quantity = Number(control.get('quantity')?.value || 0);
    const qcPassControl = control.get('qcPass');
    const rawQcPass = qcPassControl?.value;

    if (rawQcPass === null || rawQcPass === '') {
      return false; // Pending
    }

    const qcPass = Number(rawQcPass);
    return !isNaN(qcPass) && qcPass <= quantity; // any number incl. 0 is Pass
  }

  isQcPassInvalid(index: number): boolean {
    const control = this.itemsFormArray.at(index).get('qcPass');
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  onQcPassBlur(index: number): void {
    this.updateQcPass(index);
  }

  onQcPassKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.updateQcPass(index);
    }
  }

  onFormSubmit(event: Event): void {
    event.preventDefault();
  }

  private updateQcPass(index: number): void {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const challanItemId = group.get('challanItemId')?.value;
    const quantity = Number(group.get('quantity')?.value || 0);
    const qcPassControl = group.get('qcPass');
    const rawValue = qcPassControl?.value;

    // If the field is empty, treat it as "no value" and do not update the backend.
    if (rawValue === null || rawValue === '') {
      return;
    }

    const qcPass = Number(rawValue);

    if (!challanItemId) {
      this.snackbar.error('challanItemId is required');
      return;
    }

    if (isNaN(qcPass) || qcPass < 0) {
      this.snackbar.error('QC pass quantity cannot be negative');
      qcPassControl?.setValue(0);
      return;
    }

    if (qcPass > quantity) {
      this.snackbar.error('QC pass quantity cannot exceed ordered quantity');
      qcPassControl?.setValue(quantity);
      return;
    }

    if (this.savingItemId === challanItemId) {
      return;
    }

    this.isSaving = true;
    this.savingItemId = challanItemId;

    this.purchaseChallanService.updateQcPass({ challanItemId, qcPass }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        if (res?.success) {
          this.snackbar.success(res.message || 'QC pass updated successfully');
        } else {
          this.snackbar.error(res?.message || 'Failed to update QC pass');
        }
        this.isSaving = false;
        this.savingItemId = null;
      },
      error: (error: any) => {
        const message = error?.error?.message || 'Failed to update QC pass';
        this.snackbar.error(message);
        this.isSaving = false;
        this.savingItemId = null;
      }
    });
  }
}

