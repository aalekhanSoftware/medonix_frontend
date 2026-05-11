import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface UnpaidSalesSearchPayload {
  customerId?: number;
  days?: number;
  currentPage: number;
  perPageRecord: number;
}

export interface UnpaidSaleRow {
  id: number;
  invoiceNumber: string;
  saleDate: string;
  customerId: number;
  customerName: string;
  totalSaleAmount: number;
  paymentDoneAmount: number;
  pendingAmount: number;
}

export interface UnpaidSalesPageResponse {
  content: UnpaidSaleRow[];
  pageable?: {
    pageNumber: number;
    pageSize: number;
  };
  totalElements: number;
  totalPages: number;
  last?: boolean;
  first?: boolean;
  size?: number;
  number?: number;
  numberOfElements?: number;
  empty?: boolean;
}

interface UnpaidSalesApiResponse {
  success: boolean;
  message: string;
  data?: UnpaidSalesPageResponse;
}

@Injectable({
  providedIn: 'root'
})
export class UnpaidSalesService {
  private readonly unpaidSalesUrl = `${environment.apiUrl}/api/sales/unpaid`;

  constructor(private http: HttpClient) {}

  searchUnpaidSales(payload: UnpaidSalesSearchPayload): Observable<UnpaidSalesPageResponse> {
    return this.http
      .post<UnpaidSalesApiResponse>(`${this.unpaidSalesUrl}/search`, payload)
      .pipe(
        map((response) => response?.data ?? this.emptyPage(payload.currentPage, payload.perPageRecord))
      );
  }

  /**
   * Payment receipt PDF for a sale (unpaid list row `id` is the sale id).
   * Backend: POST /api/sales/unpaid/generate-payment-receipt-pdf  body: { id }
   */
  generatePaymentReceiptPdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .post(`${this.unpaidSalesUrl}/generate-payment-receipt-pdf`, { id }, {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        map((response) => {
          const contentDisposition = response.headers.get('Content-Disposition');
          const filename =
            contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ||
            `payment-receipt-${id}.pdf`;
          const blob = new Blob([response.body!], { type: 'application/pdf' });
          return { blob, filename };
        })
      );
  }

  private emptyPage(currentPage: number, perPageRecord: number): UnpaidSalesPageResponse {
    return {
      content: [],
      pageable: {
        pageNumber: currentPage,
        pageSize: perPageRecord
      },
      totalElements: 0,
      totalPages: 0,
      number: currentPage,
      size: perPageRecord,
      numberOfElements: 0,
      empty: true,
      first: currentPage === 0,
      last: true
    };
  }
}
