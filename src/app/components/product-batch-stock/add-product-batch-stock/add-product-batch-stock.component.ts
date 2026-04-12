import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ProductBatchStockService } from '../../../services/product-batch-stock.service';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ProductBatchStock } from '../../../models/product-batch-stock.model';

@Component({
  selector: 'app-add-product-batch-stock',
  standalone: false,
  templateUrl: './add-product-batch-stock.component.html',
  styleUrls: ['./add-product-batch-stock.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddProductBatchStockComponent implements OnInit, OnDestroy {
  batchStockForm!: FormGroup;
  products: any[] = [];
  isLoading = false;
  isSaving = false;
  isEdit = false;
  batchStockId: number | null = null;

  private destroy$ = new Subject<void>();
  private productMap: Map<number, any> = new Map();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private productBatchStockService: ProductBatchStockService,
    private productService: ProductService,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadProducts();
    
    // Check if editing
    const encryptedId = this.route.snapshot.paramMap.get('id');
    if (encryptedId) {
      const decryptedId = this.encryptionService.decrypt(encryptedId);
      const id = decryptedId ? Number(decryptedId) : NaN;
      
      if (id && !isNaN(id)) {
        this.isEdit = true;
        this.batchStockId = id;
        this.loadBatchStockDetails(id);
      } else {
        this.snackbar.error('Invalid batch stock ID');
        this.router.navigate(['/product-batch-stock']);
      }
    }

    // Setup quantity calculations
    this.setupQuantityCalculations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.productMap.clear();
  }

  private initializeForm(): void {
    this.batchStockForm = this.fb.group({
      batchName: ['', [Validators.required, Validators.maxLength(100)]],
      productId: ['', Validators.required],
      remainingQuantity: [0, [Validators.required, Validators.min(0)]],
      blockedQuantity: [0, [Validators.required, Validators.min(0)]],
      totalRemainingQuantity: [{ value: 0, disabled: true }]
    });
  }

  private setupQuantityCalculations(): void {
    // Calculate total when remaining or blocked quantity changes
    this.batchStockForm.get('remainingQuantity')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.calculateTotalQuantity();
      });

    this.batchStockForm.get('blockedQuantity')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.calculateTotalQuantity();
      });
  }

  private calculateTotalQuantity(): void {
    const remaining = Number(this.batchStockForm.get('remainingQuantity')?.value || 0);
    const blocked = Number(this.batchStockForm.get('blockedQuantity')?.value || 0);
    const total = remaining + blocked;
    
    this.batchStockForm.patchValue({
      totalRemainingQuantity: total
    }, { emitEvent: false });
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success && response.data) {
            this.products = Array.isArray(response.data) ? response.data : (response.data.content || []);
            this.buildProductMap();
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.snackbar.error('Failed to load products');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private buildProductMap(): void {
    this.productMap.clear();
    for (const product of this.products) {
      this.productMap.set(product.id, product);
    }
  }

  refreshProducts(): void {
    this.isLoading = true;
    this.productService.refreshProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success && response.data) {
            this.products = Array.isArray(response.data) ? response.data : (response.data.content || []);
            this.buildProductMap();
            this.snackbar.success('Products refreshed successfully');
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.snackbar.error('Failed to refresh products');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadBatchStockDetails(id: number): void {
    this.isLoading = true;
    this.productBatchStockService.getProductBatchStockById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          // Handle both response formats: wrapped (success/data) or direct data
          let data = null;
          if (response?.success && response.data) {
            data = response.data;
          } else if (response && (response.id || response.batchName)) {
            // Direct response format - data is at root level
            data = response;
          }

          if (data) {
            this.batchStockForm.patchValue({
              batchName: data.batchName || '',
              productId: data.productId || '',
              remainingQuantity: data.remainingQuantity || 0,
              blockedQuantity: data.blockedQuantity || 0,
              totalRemainingQuantity: data.totalRemainingQuantity || 0
            });
            this.calculateTotalQuantity();
          } else {
            this.snackbar.error('Failed to load batch stock details - Invalid response format');
            this.router.navigate(['/product-batch-stock']);
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load batch stock details');
          this.isLoading = false;
          this.router.navigate(['/product-batch-stock']);
          this.cdr.markForCheck();
        }
      });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.batchStockForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  getFieldError(fieldName: string): string {
    const field = this.batchStockForm.get(fieldName);
    if (!field || !field.errors) {
      return '';
    }

    if (field.errors['required']) {
      return `${this.getFieldLabel(fieldName)} is required`;
    }
    if (field.errors['min']) {
      return `${this.getFieldLabel(fieldName)} must be 0 or greater`;
    }
    if (field.errors['maxlength']) {
      return `${this.getFieldLabel(fieldName)} exceeds maximum length`;
    }

    return 'Invalid value';
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      batchName: 'Batch Name',
      productId: 'Product',
      remainingQuantity: 'Remaining Quantity',
      blockedQuantity: 'Blocked Quantity'
    };
    return labels[fieldName] || fieldName;
  }

  onSubmit(): void {
    if (this.batchStockForm.invalid) {
      this.batchStockForm.markAllAsTouched();
      const firstError = document.querySelector('.is-invalid');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    this.isSaving = true;
    const formValue = this.batchStockForm.getRawValue();
    
    const payload: Partial<ProductBatchStock> = {
      batchName: formValue.batchName.trim(),
      productId: Number(formValue.productId),
      remainingQuantity: Number(formValue.remainingQuantity) || 0,
      blockedQuantity: Number(formValue.blockedQuantity) || 0,
      totalRemainingQuantity: Number(formValue.totalRemainingQuantity) || 0
    };

    if (this.isEdit && this.batchStockId) {
      payload.id = this.batchStockId;
    }

    const serviceCall = this.isEdit
      ? this.productBatchStockService.updateProductBatchStock(payload)
      : this.productBatchStockService.createProductBatchStock(payload);

    serviceCall
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success) {
            this.snackbar.success(
              response.message || `Batch stock ${this.isEdit ? 'updated' : 'created'} successfully`
            );
            this.router.navigate(['/product-batch-stock']);
          } else {
            this.snackbar.error(
              response?.message || `Failed to ${this.isEdit ? 'update' : 'create'} batch stock`
            );
            this.isSaving = false;
            this.cdr.markForCheck();
          }
        },
        error: (error: any) => {
          this.snackbar.error(
            error?.error?.message || `Failed to ${this.isEdit ? 'update' : 'create'} batch stock`
          );
          this.isSaving = false;
          this.cdr.markForCheck();
        }
      });
  }

  onCancel(): void {
    this.router.navigate(['/product-batch-stock']);
  }

  getTotalQuantity(): number {
    const remaining = Number(this.batchStockForm.get('remainingQuantity')?.value || 0);
    const blocked = Number(this.batchStockForm.get('blockedQuantity')?.value || 0);
    return remaining + blocked;
  }
}
