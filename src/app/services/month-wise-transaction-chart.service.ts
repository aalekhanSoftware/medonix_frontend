import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MonthWiseTransactionChartReportType = 'SALES' | 'SALE_RETURN' | 'PURCHASE' | 'PURCHASE_RETURN' | 'PAYMENT_DONE';

export interface MonthWiseTransactionChartSearchPayload {
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  customerId?: number | null;
}

export interface MonthWiseChartPoint {
  month: string; // yyyy-MM
  value?: number;
  receivedCount?: number;
  paidCount?: number;
}

export interface MonthWiseChartApiResponse {
  data: MonthWiseChartPoint[];
}

@Injectable({
  providedIn: 'root'
})
export class MonthWiseTransactionChartService {
  private readonly salesUrl = `${environment.apiUrl}/api/sales/report/month-wise`;
  private readonly purchaseUrl = `${environment.apiUrl}/api/purchases/report/month-wise`;
  private readonly paymentDoneUrl = `${environment.apiUrl}/api/reports/payment-done/month-wise`;
  // TOP_CUSTOMER_CHART (existing-chart-extension)
  private readonly saleReturnUrl = `${environment.apiUrl}/api/sales/report/sale-return/month-wise`;
  private readonly purchaseReturnUrl = `${environment.apiUrl}/api/purchases/report/purchase-return/month-wise`;

  constructor(private http: HttpClient) {}

  searchSalesMonthWise(payload: MonthWiseTransactionChartSearchPayload): Observable<MonthWiseChartApiResponse> {
    return this.http.post<MonthWiseChartApiResponse>(this.salesUrl, this.buildBody(payload));
  }

  searchPurchaseMonthWise(payload: MonthWiseTransactionChartSearchPayload): Observable<MonthWiseChartApiResponse> {
    return this.http.post<MonthWiseChartApiResponse>(this.purchaseUrl, this.buildBody(payload));
  }

  searchPaymentDoneMonthWise(payload: MonthWiseTransactionChartSearchPayload): Observable<MonthWiseChartApiResponse> {
    return this.http.post<MonthWiseChartApiResponse>(this.paymentDoneUrl, this.buildBody(payload));
  }

  // TOP_CUSTOMER_CHART (existing-chart-extension)
  searchSaleReturnMonthWise(payload: MonthWiseTransactionChartSearchPayload): Observable<MonthWiseChartApiResponse> {
    return this.http.post<MonthWiseChartApiResponse>(this.saleReturnUrl, this.buildBody(payload));
  }

  // TOP_CUSTOMER_CHART (existing-chart-extension)
  searchPurchaseReturnMonthWise(payload: MonthWiseTransactionChartSearchPayload): Observable<MonthWiseChartApiResponse> {
    return this.http.post<MonthWiseChartApiResponse>(this.purchaseReturnUrl, this.buildBody(payload));
  }

  private buildBody(payload: MonthWiseTransactionChartSearchPayload): Record<string, unknown> {
    const body: Record<string, unknown> = {
      startDate: payload.startDate,
      endDate: payload.endDate
    };

    const customerId = payload.customerId;
    if (customerId !== undefined && customerId !== null && String(customerId).trim() !== '') {
      body['customerId'] = Number(customerId);
    }

    return body;
  }
}

