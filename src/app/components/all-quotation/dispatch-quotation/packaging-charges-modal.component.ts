import { Component, EventEmitter, Input, Output, OnChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { formatDate } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, takeUntil } from 'rxjs';
import { PurchaseService } from '../../../services/purchase.service';
import { PurchaseRecent } from '../../../models/purchase.model';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-packaging-charges-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SearchableSelectComponent],
  template: `
    <div class="modal-overlay" *ngIf="show" (click)="onCancel()">
      <div class="modal-content" (click)="$event.stopPropagation()" [@modalAnimation]>
        <div class="modal-header">
          <h3><i class="fas fa-box"></i> Packaging & Forwarding Charges</h3>
        </div>
        <form [formGroup]="chargesForm" (ngSubmit)="onSubmit()">
          <div class="modal-body">
            <!-- Purchase dropdown only when modal is opened from Purchase Order -->
            <div class="form-group" *ngIf="openedFromPurchaseOrder">
              <label>
                <i class="fas fa-link"></i> Purchase (optional)
              </label>
              <div class="select-group">
                <app-searchable-select
                  formControlName="purchaseId"
                  [options]="purchaseOptions"
                  labelKey="displayLabel"
                  valueKey="id"
                  [defaultOption]="{ label: 'Create new Purchase (auto)', value: null }"
                  [searchPlaceholder]="'Search purchases by invoice/customer...'"
                ></app-searchable-select>
                <button
                  type="button"
                  class="btn btn-sm btn-primary refresh"
                  (click)="refreshPurchases()"
                  [disabled]="isLoadingPurchases"
                  title="Refresh Purchases"
                >
                  <i class="fas" [ngClass]="isLoadingPurchases ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
                </button>
              </div>
              <small class="text-muted">
                Purchases shown are from the last 6 months. Leave blank to create a new Purchase automatically; select one to append items into an existing Purchase.
              </small>
            </div>

            <div class="form-group" *ngIf="requireInvoiceNumber">
              <label for="invoiceNumber">
                <i class="fas fa-file-invoice"></i> Invoice Number <span class="required" *ngIf="isInvoiceRequired()">*</span>
              </label>
              <input 
                type="text" 
                id="invoiceNumber" 
                formControlName="invoiceNumber" 
                class="form-control"
                placeholder="Enter invoice number"
                [class.is-invalid]="chargesForm.get('invoiceNumber')?.invalid && chargesForm.get('invoiceNumber')?.touched"
              >
              <div class="invalid-feedback" *ngIf="chargesForm.get('invoiceNumber')?.errors?.['required']">
                Invoice number is required
              </div>
            </div>

            <div class="form-group">
              <label for="packagingAndForwadingCharges">
                <i class="fas fa-rupee-sign"></i> Packaging & Forwarding Charges <span class="required">*</span>
              </label>
              <input 
                type="number" 
                id="packagingAndForwadingCharges" 
                formControlName="packagingAndForwadingCharges" 
                class="form-control"
                min="0"
                step="0.01"
                placeholder="Enter packaging and forwarding charges"
                [class.is-invalid]="chargesForm.get('packagingAndForwadingCharges')?.invalid && chargesForm.get('packagingAndForwadingCharges')?.touched"
              >
              <div class="invalid-feedback" *ngIf="chargesForm.get('packagingAndForwadingCharges')?.errors?.['required']">
                Packaging and forwarding charges is required
              </div>
              <div class="invalid-feedback" *ngIf="chargesForm.get('packagingAndForwadingCharges')?.errors?.['min']">
                Charges must be 0 or greater
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="onCancel()">
              <i class="fas fa-times"></i> Cancel
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="chargesForm.invalid || isLoading">
              <i class="fas" [ngClass]="isLoading ? 'fa-spinner fa-spin' : 'fa-check'"></i>
              {{ isLoading ? 'Creating...' : 'Create Sale' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styleUrls: ['./packaging-charges-modal.component.scss'],
  animations: [
    trigger('modalAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-20px)' }))
      ])
    ])
  ]
})
export class PackagingChargesModalComponent implements OnChanges, OnDestroy {
  @Input() show = false;
  @Input() defaultCharges: number = 0;
  @Input() requireInvoiceNumber: boolean = false;
  @Input() orderId?: number;
  /**
   * When true, this modal is being used from Purchase Order screens and should show the Purchase dropdown.
   * (Dispatch quotation and other usages leave this false by default.)
   */
  @Input() openedFromPurchaseOrder: boolean = false;
  @Input() customerId?: number | string | null;

  @Output() confirm = new EventEmitter<
    | number
    | { id: number; invoiceNumber: string; packagingAndForwadingCharges: number; purchaseId?: number | null }
  >();
  @Output() cancel = new EventEmitter<void>();

  chargesForm: FormGroup;
  isLoading = false;
  isLoadingPurchases = false;
  purchaseOptions: Array<PurchaseRecent & { displayLabel: string }> = [];
  private purchaseOptionsRaw: PurchaseRecent[] = [];

  private destroy$ = new Subject<void>();
  private open$ = new Subject<void>();

  constructor(private fb: FormBuilder, private purchaseService: PurchaseService) {
    this.chargesForm = this.fb.group({
      invoiceNumber: [''],
      purchaseId: [null],
      packagingAndForwadingCharges: [
        0,
        [Validators.required, Validators.min(0)]
      ]
    });
  }

  ngOnChanges(): void {
    if (this.show) {
      // New open-cycle boundary (prevents stacking subscriptions across opens)
      this.open$.next();

      // Set validators for invoice number if required
      this.updateInvoiceNumberValidators();
      
      this.chargesForm.patchValue({
        packagingAndForwadingCharges: this.defaultCharges !== undefined ? this.defaultCharges : 0,
        invoiceNumber: '',
        purchaseId: null
      });

      // Dynamically toggle invoice requirement when purchase changes (Purchase Order flow)
      this.chargesForm.get('purchaseId')?.valueChanges
        .pipe(takeUntil(this.destroy$), takeUntil(this.open$))
        .subscribe(() => {
          this.updateInvoiceNumberValidators();
        });

      if (this.openedFromPurchaseOrder) {
        this.loadPurchases();
      }
    }
  }

  isInvoiceRequired(): boolean {
    if (!this.requireInvoiceNumber) return false;

    // In Purchase Order flow: invoice is required only when purchase is not selected.
    if (this.openedFromPurchaseOrder) {
      const purchaseId = this.chargesForm.get('purchaseId')?.value;
      return purchaseId === null || purchaseId === undefined || purchaseId === '';
    }

    // Default behavior for other flows
    return true;
  }

  private updateInvoiceNumberValidators(): void {
    const invoiceNumberControl = this.chargesForm.get('invoiceNumber');
    if (!invoiceNumberControl) return;

    if (!this.requireInvoiceNumber) {
      invoiceNumberControl.clearValidators();
      invoiceNumberControl.updateValueAndValidity({ emitEvent: false });
      return;
    }

    // Purchase Order flow: required only when no purchase is selected.
    if (this.openedFromPurchaseOrder) {
      const isRequired = this.isInvoiceRequired();
      if (isRequired) {
        invoiceNumberControl.setValidators([Validators.required]);
      } else {
        invoiceNumberControl.clearValidators();
      }
      invoiceNumberControl.updateValueAndValidity({ emitEvent: false });
      return;
    }

    // Other flows: keep legacy behavior
    invoiceNumberControl.setValidators([Validators.required]);
    invoiceNumberControl.updateValueAndValidity({ emitEvent: false });
  }

  refreshPurchases(): void {
    this.loadPurchases(true);
  }

  private loadPurchases(force: boolean = false): void {
    if (!force && this.purchaseOptionsRaw.length > 0) {
      this.updatePurchaseOptions();
      return;
    }

    this.isLoadingPurchases = true;
    this.purchaseService.getPurchasesLast6Months()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success) {
            this.purchaseOptionsRaw = Array.isArray(response.data) ? response.data : [];
            this.updatePurchaseOptions();
          } else {
            this.purchaseOptionsRaw = [];
            this.purchaseOptions = [];
          }
          this.isLoadingPurchases = false;
        },
        error: () => {
          this.purchaseOptionsRaw = [];
          this.purchaseOptions = [];
          this.isLoadingPurchases = false;
        }
      });
  }

  private updatePurchaseOptions(): void {
    const rawCustomerId = this.customerId;
    const customerId =
      rawCustomerId === null || rawCustomerId === undefined || rawCustomerId === ''
        ? null
        : Number(rawCustomerId);

    // Show ALL purchases from the last 6 months (do not filter),
    // but prioritize the selected customer's purchases first for better UX.
    const list = [...this.purchaseOptionsRaw].sort((a, b) => {
      if (!customerId) return 0;
      const aMatch = Number(a.customerId) === customerId ? 0 : 1;
      const bMatch = Number(b.customerId) === customerId ? 0 : 1;
      return aMatch - bMatch;
    });

    this.purchaseOptions = list.map(p => ({
      ...p,
      displayLabel: this.formatPurchaseLabel(p)
    }));
  }

  private formatPurchaseLabel(p: PurchaseRecent): string {
    const dateLabel = p.purchaseDate ? formatDate(new Date(p.purchaseDate), 'dd-MM-yyyy', 'en') : '-';
    const amount = typeof p.totalPurchaseAmount === 'number' ? p.totalPurchaseAmount : Number(p.totalPurchaseAmount || 0);
    const amountLabel = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
    const qcLabel = p.isQcPass ? 'QC Pass' : 'QC Pending';

    // Keep the most important fields first (requested): invoiceNumber, customerName, purchaseDate, totalPurchaseAmount
    // Then include the remaining API fields for clarity.
    return `${p.invoiceNumber} • ${p.customerName} • ${dateLabel} • ₹${amountLabel} • Items: ${p.numberOfItems} • ${qcLabel} • #${p.id}`;
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onSubmit(): void {
    if (this.chargesForm.valid) {
      const charges = Number(this.chargesForm.get('packagingAndForwadingCharges')?.value || 0);
      const purchaseIdControlValue = this.chargesForm.get('purchaseId')?.value;
      const purchaseId =
        purchaseIdControlValue === null || purchaseIdControlValue === undefined || purchaseIdControlValue === ''
          ? null
          : Number(purchaseIdControlValue);
      
      // If orderId is provided and invoice number is required, emit object with all fields
      if (this.requireInvoiceNumber && this.orderId !== undefined && this.orderId !== null) {
        const invoiceNumber = this.chargesForm.get('invoiceNumber')?.value || '';
        this.confirm.emit({
          id: this.orderId,
          invoiceNumber: invoiceNumber,
          packagingAndForwadingCharges: charges,
          ...(this.openedFromPurchaseOrder ? { purchaseId } : {})
        });
      } else {
        // Otherwise emit just the charges number for backward compatibility (dispatch-quotation)
        this.confirm.emit(charges);
      }
    } else {
      this.chargesForm.markAllAsTouched();
    }
  }

  ngOnDestroy(): void {
    // Complete destroy subject
    this.destroy$.next();
    this.destroy$.complete();
    this.open$.next();
    this.open$.complete();

    // Complete EventEmitters
    if (this.confirm && typeof (this.confirm as any).complete === 'function') {
      (this.confirm as any).complete();
    }
    if (this.cancel && typeof (this.cancel as any).complete === 'function') {
      (this.cancel as any).complete();
    }

    // Reset form to release form subscriptions
    if (this.chargesForm) {
      this.chargesForm.reset();
    }
  }
}
