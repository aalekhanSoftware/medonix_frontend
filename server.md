# Medonix Frontend - Server/API Documentation

## Backend API Base URL
- Base URL: Configured via `environment.ts` → `apiUrl`
- All API calls go through `HttpClient` with interceptors for auth headers

## Authentication
- JWT-based authentication
- Token stored in localStorage (`auth_token`)
- `AuthInterceptor` adds `Authorization: Bearer <token>` to all requests
- Roles: `ADMIN`, `STAFF_ADMIN`, `DEALER`
- Route guards: `AuthGuard`, `RoleGuard`

## API Endpoints by Module

### Purchase Module (`/api/purchases`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/searchPurchase` | Paginated search with filters |
| GET | `/last-6-months` | Recent purchases for quick select |
| POST | `/create` | Create new purchase (also used for update) |
| DELETE | `/{id}` | Delete purchase |
| POST | `/detail` | Get purchase details with items |
| POST | `/update-qc-pass` | Update QC pass status |
| POST | `/generate-pdf` | Generate PDF |
| POST | `/export-excel` | Export to Excel |

### Purchase Returns (`/api/purchase-returns`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/create` | Create purchase return |
| POST | `/create-standalone` | Create standalone return |
| POST | `/detail` | Get return details |
| POST | `/searchPurchaseReturn` | Search returns |
| POST | `/delete` | Delete return |
| POST | `/generate-pdf` | Generate PDF |

### Purchase Orders (`/api/purchase-orders`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Search POs |
| POST | `/create` | Create PO |
| PUT | `/update` | Update PO |
| POST | `/detail` | Get PO details |
| POST | `/delete` | Delete PO |
| POST | `/convert-to-purchase` | Convert PO to Purchase |
| POST | `/create-from-quotation` | Create PO from quotation |
| POST | `/pending-item/search` | Search pending items |

### Purchase Challans (`/api/purchase-challans`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Search challans |
| POST | `/create` | Create challan |
| PUT | `/update` | Update challan |
| POST | `/detail` | Get details |
| POST | `/delete` | Delete |
| POST | `/convert-to-purchase` | Convert to Purchase |
| POST | `/update-qc-pass` | Update QC |

### Sales Module (`/api/sales`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Search sales |
| POST | `/create` | Create sale |
| PUT | `/update` | Update sale |
| POST | `/detail` | Get sale details |
| POST | `/delete` | Delete sale |
| POST | `/generate-pdf` | Generate PDF |
| POST | `/export-excel` | Export Excel |

### Sales Returns (`/api/sale-returns`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/create` | Create return |
| PUT | `/update` | Update return |
| POST | `/detail` | Get details |
| POST | `/search` | Search returns |
| POST | `/delete` | Delete |
| POST | `/generate-pdf` | Generate PDF |

### Quotations (`/api/quotations`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Search quotations |
| POST | `/create` | Create quotation |
| PUT | `/update` | Update quotation |
| POST | `/detail` | Get details |
| POST | `/delete` | Delete |
| POST | `/generate-pdf` | Generate PDF |
| POST | `/generate-dispatch-slip` | Dispatch slip |
| PUT | `/update-status` | Update status |

### Products (`/api/products`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Search products |
| GET | `/last-6-months` | Recent products |
| POST | `/create` | Create product |
| PUT | `/update` | Update product |
| POST | `/detail` | Get details |
| POST | `/delete` | Delete |
| POST | `/refresh` | Refresh cache |

### Customers (`/api/customers`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Search customers |
| POST | `/create` | Create customer |
| PUT | `/update` | Update customer |
| POST | `/detail` | Get details |
| POST | `/delete` | Delete |
| POST | `/refresh` | Refresh cache |

### Product Batch Stock (`/api/product-batch-stock`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/available-batch-names/{productId}` | Get available batches |

## Request/Response Format

### Standard Response
```typescript
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  content?: T[]; // for paginated
  totalPages?: number;
  totalElements?: number;
}
```

### Paginated Search Request
```typescript
interface SearchRequest {
  currentPage: number;
  perPageRecord: number;
  startDate?: string; // dd-MM-yyyy
  endDate?: string;
  [key: string]: any; // additional filters
}
```

## Date Format
- **Frontend input**: `yyyy-MM-dd` (HTML date input)
- **API request**: `dd-MM-yyyy`
- **API response**: ISO string or `dd-MM-yyyy`
- Use `formatDate(date, 'dd-MM-yyyy', 'en')` for API requests

## Error Handling
- HTTP errors caught in service subscriptions
- Backend returns `{ success: false, message: "..." }` for business errors
- `SnackbarService` shows user-facing errors
- 401 → redirect to login (handled by interceptor)

## File Upload/Download
- PDF generation returns `{ blob: Blob, filename: string }`
- Excel export returns `{ blob: Blob, filename: string }`
- Downloaded via `URL.createObjectURL()` and anchor click

## Encryption
- `EncryptionService` uses AES encryption
- IDs encrypted in URLs: `router.navigate(['/purchase/edit', encryptedId])`
- Decrypted in component: `encryptionService.decrypt(encryptedId)`

## Caching
- `CacheService` for in-memory caching
- `refreshProducts()`, `refreshCustomers()` force cache invalidation
- Product/customer lists cached after first load