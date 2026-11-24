import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// TOP_CUSTOMER_CHART
export type TopCustomerReportType = 'SALES' | 'SALE_RETURN' | 'PURCHASE' | 'PURCHASE_RETURN';

export interface TopCustomerChartSearchPayload {
  reportType: TopCustomerReportType;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  customerId?: number | null;
  limit?: number;
}

export interface TopCustomerChartPoint {
  customerId?: number;
  customerName: string;
  mobile?: string;
  totalAmount: number;
  documentCount: number;
}

export interface TopCustomerChartApiResponse {
  reportType?: string;
  totalAmount?: number;
  data: TopCustomerChartPoint[];
}

@Injectable({
  providedIn: 'root'
})
export class TopCustomerTransactionChartService {
  private readonly baseUrl = `${environment.apiUrl}/api/reports/top-customers`;

  constructor(private http: HttpClient) {}

  searchTopCustomers(payload: TopCustomerChartSearchPayload): Observable<TopCustomerChartApiResponse> {
    return this.http.post<TopCustomerChartApiResponse>(`${this.baseUrl}/chart`, this.buildBody(payload));
  }

  /**
   * Downloads every customer (not only the top N shown in the chart) for the
   * selected report type and period.
   */
  exportExcel(payload: TopCustomerChartSearchPayload): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .post(`${this.baseUrl}/export-excel`, this.buildBody(payload), {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        map(response => {
          const contentDisposition = response.headers.get('Content-Disposition');
          const filename =
            contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ||
            `top_customers_${payload.reportType.toLowerCase()}_${payload.startDate}_${payload.endDate}.xlsx`;
          const blob = new Blob([response.body!], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          return { blob, filename };
        })
      );
  }

  private buildBody(payload: TopCustomerChartSearchPayload): Record<string, unknown> {
    const body: Record<string, unknown> = {
      reportType: payload.reportType,
      startDate: payload.startDate,
      endDate: payload.endDate
    };

    const customerId = payload.customerId;
    if (customerId !== undefined && customerId !== null && String(customerId).trim() !== '') {
      body['customerId'] = Number(customerId);
    }

    if (payload.limit !== undefined && payload.limit !== null) {
      body['limit'] = Number(payload.limit);
    }

    return body;
  }
}
