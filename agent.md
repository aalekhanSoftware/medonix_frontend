# Medonix Frontend - Agent/Developer Guide

## Project Overview
Angular 17+ standalone components, lazy-loaded modules, OnPush change detection, RxJS for async.

## Architecture Patterns

### Module Structure
```
src/app/components/
├── all-purchase/
│   ├── purchase/           # Purchase list + create/edit
│   ├── add-purchase/       # Purchase form (create/edit)
│   ├── purchase-challan/   # Challan list + create/edit
│   ├── purchase-order/     # PO list + create/edit
│   ├── purchase-return-list/  # Returns list
│   ├── add-purchase-return/   # Purchase return form
│   ├── add-standalone-purchase-return/  # Standalone return
│   └── qc-purchase/        # QC screen
├── all-sale/
│   ├── sale/               # Sale list + create/edit
│   ├── add-sale/           # Sale form
│   ├── add-sale-return/    # Sale return form
│   └── sale-return-list/   # Returns list
├── all-quotation/
│   ├── quotation/          # Quotation list
│   ├── add-quotation/      # Quotation form
│   ├── dispatch-quotation/ # Dispatch form
│   └── ...
└── shared/                 # Shared components, pipes, services
```

### Routing Pattern
- **Lazy-loaded modules** in `app-routing.module.ts`
- **Child routes** in `*-routing.module.ts`
- **Edit routes**: `/module/edit/:encryptedId`
- **Create routes**: `/module/create`
- **Same component** for create/edit, differentiated by `isEdit` flag
- **Encrypted IDs** in URLs (never expose raw IDs)

### Component Pattern (Create/Edit)
```typescript
@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.OnPush })
export class AddXxxComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  isEdit = false;
  entityId: number | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private service: XxxService,
    private encryption: EncryptionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const encryptedId = this.route.snapshot.paramMap.get('id');
    if (encryptedId) {
      const id = this.decryptId(encryptedId);
      if (id) { this.isEdit = true; this.entityId = id; this.loadDetails(id); }
    }
    this.loadDependencies();
  }

  private decryptId(encrypted: string): number | null {
    const decrypted = this.encryption.decrypt(encrypted);
    return decrypted ? Number(decrypted) : null;
  }

  onSubmit() {
    const data = this.prepareData();
    const call = this.isEdit ? this.service.update(data) : this.service.create(data);
    call.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => { if (res.success) { this.router.navigate(['/list']); } }
    });
  }
}
```

### Form Patterns
- **Reactive Forms** with `FormBuilder`
- **FormArray** for line items (products)
- **Virtual scrolling** for large product lists (CDK)
- **OnPush** + manual `cdr.markForCheck()` after async updates
- **Debounced valueChanges** for calculations (150-300ms)
- **Subscription cleanup** in `ngOnDestroy` via `destroy$` Subject

### Product Line Items
```typescript
products: this.fb.array([
  this.fb.group({
    id: [null],           // for update
    productId: ['', Validators.required],
    quantity: ['', [Validators.required, Validators.min(1)]],
    unitPrice: ['', [Validators.required, Validators.min(0.01)]],
    discountType: ['percentage'],
    discountPercentage: [0],
    discountAmount: [0],
    batchNumber: [''],
    taxPercentage: [{ value: 0, disabled: true }],
    taxAmount: [{ value: 0, disabled: true }],
    // computed fields (disabled):
    price: [{ value: 0, disabled: true }],
    discountPrice: [{ value: 0, disabled: true }],
    totalDiscount: [{ value: 0, disabled: true }],
    remarks: [null]
  })
])
```

### Calculations (GST)
- **Tax split**: CGST/SGST (intra-state) or IGST (inter-state)
- `calculateGstTaxes(taxAmount, customerGst)` from `gst.utils.ts`
- Customer GST type determines split
- Bill-level discount applied per item proportionally

### Services
- **One service per module**: `PurchaseService`, `SaleService`, `QuotationService`, etc.
- **Methods**: `search()`, `create()`, `update()`, `delete()`, `getDetail()`, `generatePdf()`, `exportExcel()`
- **Observable-based**: Return `Observable<ApiResponse<T>>`
- **Error handling**: Let component handle via subscription error callback

### State Management
- **No NgRx/Redux** - uses RxJS Subjects + Services
- `CacheService` for in-memory product/customer caching
- Local component state for forms
- `BehaviorSubject` in services for shared data (rare)

### Encryption/Decryption
```typescript
// Navigation TO edit
const encrypted = this.encryptionService.encrypt(id.toString());
this.router.navigate(['/module/edit', encrypted]);

// Reading IN edit component
const encryptedId = this.route.snapshot.paramMap.get('id');
const id = this.encryptionService.decrypt(encryptedId);
```

### Common Utilities
| Utility | Location | Purpose |
|---------|----------|---------|
| `formatDate` | `@angular/common` | Date formatting |
| `calculateGstTaxes` | `utils/gst.utils.ts` | GST split |
| `getCustomerGst` | `utils/gst.utils.ts` | Customer GST type |
| `EncryptionService` | `shared/services/encryption.service.ts` | AES encrypt/decrypt |
| `SnackbarService` | `shared/services/snackbar.service.ts` | Toast notifications |
| `LoaderComponent` | `shared/components/loader/` | Loading spinner |
| `SearchableSelectComponent` | `shared/components/searchable-select/` | Product/customer search |

### Styling
- **SCSS** with CSS custom properties (variables)
- **Design tokens**: `--primary`, `--border-color`, `--border-radius`, etc.
- **Component-scoped** styles (no global leakage)
- **Bootstrap 5** utility classes available
- **FontAwesome** icons

### Performance Optimizations
- **OnPush** change detection everywhere
- **Virtual scrolling** (`cdk-virtual-scroll-viewport`) for 1000+ rows
- **Chunked Map building** for product lookups (1000+ products)
- **Debounced** form value changes (150-300ms)
- **trackBy** functions for `*ngFor`
- **Lazy loading** all feature modules

### Key Files to Understand
| File | Purpose |
|------|---------|
| `src/app/app-routing.module.ts` | Root routes, lazy loading config |
| `src/app/shared/services/encryption.service.ts` | ID encryption |
| `src/app/shared/services/snackbar.service.ts` | Notifications |
| `src/app/utils/gst.utils.ts` | GST calculations |
| `src/app/shared/pipes/transaction-label.pipe.ts` | i18n labels |
| `src/app/components/all-purchase/add-purchase/add-purchase.component.ts` | Reference create/edit component |

### Common Tasks

#### Adding a New Date Field
1. Add to `initForm()`: `fieldName: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required]`
2. Add to HTML template with `<input type="date" formControlName="fieldName">`
3. In `prepareData()`: `formatDate(formValue.fieldName, 'dd-MM-yyyy', 'en')`
4. For +1 day: parse `new Date()`, `setDate(getDate() + 1)`, then format

#### Adding a New Module
1. Create component folder with `.component.ts`, `.html`, `.scss`
2. Create `*-routing.module.ts` with child routes
3. Create `*.module.ts` with declarations/imports
4. Add lazy-loaded route to `app-routing.module.ts`
5. Add to sidebar navigation in `header.component.html`

#### Adding Product Selection
- Use `<app-searchable-select>` or `<app-sale-product-select>` component
- Handles search, barcode scan, virtual scroll, batch numbers
- Emits `productId` to form

### Testing
- No test files currently in project
- Manual testing via `npm run build` and `npm start`

### Build/Deploy
```bash
npm run build          # Production build to docs/
npm run start          # Dev server on localhost:4200
npm run lint           # ESLint (if configured)
```

### Git Workflow
- Main branch: `main`
- Feature branches for changes
- No CI/CD configured in repo