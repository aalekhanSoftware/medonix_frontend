import { Component, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PurchaseService } from '../../../services/purchase.service';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';

@Component({
  selector: 'app-qc-purchase',
  templateUrl: './qc-purchase.component.html',
  styleUrls: ['./qc-purchase.component.scss']
})
export class QcPurchaseComponent implements OnInit, OnDestroy {
  qcForm: FormGroup;
  isLoading = false;
  isSaving = false;
  purchaseDetails: any;
  products: any[] = [];
  savingItemId: number | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private purchaseService: PurchaseService,
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
      this.snackbar.error('Invalid purchase id');
      return;
    }

    const decryptedId = this.encryptionService.decrypt(encryptedId);
    const id = decryptedId ? Number(decryptedId) : NaN;
    if (!id || isNaN(id)) {
      this.snackbar.error('Invalid purchase id');
      return;
    }

    this.loadProducts();
    this.loadPurchaseDetails(id);
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

  private loadPurchaseDetails(id: number): void {
    this.isLoading = true;
    this.purchaseService.getPurchaseDetails(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        this.purchaseDetails = response;
        const items = response.items || [];
        this.buildItemsForm(items);
        this.isLoading = false;
      },
      error: (error: any) => {
        this.snackbar.error(error?.error?.message || 'Failed to load purchase details');
        this.isLoading = false;
      }
    });
  }

  private buildItemsForm(items: any[]): void {
    this.itemsFormArray.clear();
    items.forEach(item => {
      const group = this.fb.group({
        purchaseItemId: [item.id],
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
    const purchaseItemId = group.get('purchaseItemId')?.value;
    const quantity = Number(group.get('quantity')?.value || 0);
    const qcPassControl = group.get('qcPass');
    const rawValue = qcPassControl?.value;

    if (!purchaseItemId) {
      this.snackbar.error('purchaseItemId is required');
      return;
    }

    // If the field is empty or null, send null to the API
    if (rawValue === null || rawValue === '' || rawValue === undefined) {
      if (this.savingItemId === purchaseItemId) {
        return;
      }

      this.isSaving = true;
      this.savingItemId = purchaseItemId;

      this.purchaseService.updateQcPass({ purchaseItemId, qcPass: null }).pipe(takeUntil(this.destroy$)).subscribe({
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
      return;
    }

    const qcPass = Number(rawValue);

    if (isNaN(qcPass) || qcPass < 0) {
      this.snackbar.error('QC pass quantity cannot be negative');
      qcPassControl?.setValue(null);
      return;
    }

    if (qcPass > quantity) {
      this.snackbar.error('QC pass quantity cannot exceed ordered quantity');
      qcPassControl?.setValue(quantity);
      return;
    }

    if (this.savingItemId === purchaseItemId) {
      return;
    }

    this.isSaving = true;
    this.savingItemId = purchaseItemId;

    this.purchaseService.updateQcPass({ purchaseItemId, qcPass }).pipe(takeUntil(this.destroy$)).subscribe({
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
