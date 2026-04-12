import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type SalesPurchaseReportType = 'PURCHASE' | 'SALES';

export interface SalesPurchaseReportSearchPayload {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  customerId?: number | string | null;
  startDate?: string;
  endDate?: string;
  batchNumber?: string;
}

export interface SalesPurchaseReportExportPayload {
  search?: string;
  customerId?: number | string | null;
  startDate?: string;
  endDate?: string;
  batchNumber?: string;
}

export interface SalesPurchaseReportPageResponse<T = any> {
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
export class SalesPurchaseReportService {
  private purchaseBaseUrl = `${environment.apiUrl}/api/purchases/report`;
  private salesBaseUrl = `${environment.apiUrl}/api/sales/report`;

  constructor(private http: HttpClient) {}

  searchPurchaseReport(payload: SalesPurchaseReportSearchPayload): Observable<SalesPurchaseReportPageResponse> {
    return this.http.post<SalesPurchaseReportPageResponse>(`${this.purchaseBaseUrl}/search`, payload);
  }

  exportPurchaseReportExcel(payload: SalesPurchaseReportExportPayload): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .post(`${this.purchaseBaseUrl}/export-excel`, payload, {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        map(response => {
          const contentDisposition = response.headers.get('Content-Disposition');
          const filename =
            contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ||
            `purchase_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
          const blob = new Blob([response.body!], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          return { blob, filename };
        })
      );
  }

  searchSalesReport(payload: SalesPurchaseReportSearchPayload): Observable<SalesPurchaseReportPageResponse> {
    return this.http.post<SalesPurchaseReportPageResponse>(`${this.salesBaseUrl}/search`, payload);
  }

  exportSalesReportExcel(payload: SalesPurchaseReportExportPayload): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .post(`${this.salesBaseUrl}/export-excel`, payload, {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        map(response => {
          const contentDisposition = response.headers.get('Content-Disposition');
          const filename =
            contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ||
            `sales_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
          const blob = new Blob([response.body!], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          return { blob, filename };
        })
      );
  }
}

