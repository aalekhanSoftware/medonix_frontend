import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CollectionOutstandingSearchPayload {
  currentPage: number;
  perPageRecord: number;
  search?: string;
}

export interface PaymentDoneSearchPayload {
  currentPage: number;
  perPageRecord: number;
  startDate: string;
  endDate: string;
}

export interface ReportPageResponse<T = any> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number?: number;
  size?: number;
  pageable?: any;
  last?: boolean;
  first?: boolean;
  numberOfElements?: number;
  empty?: boolean;
  sort?: any;
}

@Injectable({
  providedIn: 'root'
})
export class CollectionPaymentReportService {
  private collectionOutstandingBaseUrl = `${environment.apiUrl}/api/reports/collection-outstanding`;
  private paymentDoneBaseUrl = `${environment.apiUrl}/api/reports/payment-done`;

  constructor(private http: HttpClient) {}

  searchCollectionOutstanding(payload: CollectionOutstandingSearchPayload): Observable<ReportPageResponse> {
    return this.http.post<ReportPageResponse>(`${this.collectionOutstandingBaseUrl}/search`, payload);
  }

  exportCollectionOutstandingExcel(payload: CollectionOutstandingSearchPayload): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .post(`${this.collectionOutstandingBaseUrl}/export-excel`, payload, {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        map(response => {
          const contentDisposition = response.headers.get('Content-Disposition');
          const filename =
            contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ||
            `collection_outstanding_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
          const blob = new Blob([response.body!], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          return { blob, filename };
        })
      );
  }

  searchPaymentDone(payload: PaymentDoneSearchPayload): Observable<ReportPageResponse> {
    return this.http.post<ReportPageResponse>(`${this.paymentDoneBaseUrl}/search`, payload);
  }

  exportPaymentDoneExcel(payload: PaymentDoneSearchPayload): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .post(`${this.paymentDoneBaseUrl}/export-excel`, payload, {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        map(response => {
          const contentDisposition = response.headers.get('Content-Disposition');
          const filename =
            contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ||
            `payment_done_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
          const blob = new Blob([response.body!], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          return { blob, filename };
        })
      );
  }
}
