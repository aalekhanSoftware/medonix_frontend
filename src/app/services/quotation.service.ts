import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { CreateQuotationRequest, QuotationResponse } from '../models/quotation.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface QuotationItemSearchRequest {
  search?: string;
  currentPage: number;
  perPageRecord: number;
  sortBy?: string;
  sortDir?: string;
  quotationItemStatuses?: ('O' | 'IP' | 'C' | 'B')[];
  quotationId?: number;
  productId?: number;
  isProduction: boolean;
  quotationStatuses?: ('Q' | 'A')[];
  customerId?: number;
  startDate?: string;
  endDate?: string;
}

export interface QuotationItemDetail {
  id: number;
  quantity: number;
  unitPrice: number;
  weight: number;
  discountPercentage: number;
  discountAmount: number;
  discountPrice: number;
  taxPercentage: number;
  taxAmount: number;
  finalPrice: number;
  loadingCharge: number;
  accessoriesSize: string;
  nos: number;
  calculationType: string;
  calculationBase: string;
  itemRemarks: string;
  isProduction: boolean;
  quotationItemStatus: 'O' | 'IP' | 'C' | 'B';
  quotationDiscountAmount: number;
  productId: number;
  productName: string;
  productType: string;
  quotationId: number;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  quotationStatus: string;
  customerName: string;
  contactNumber: string;
  address: string;
  quotationTotalAmount: number;
  quotationDiscount: number;
  customerId: number;
}

export interface QuotationItemSearchResponse {
  content: QuotationItemDetail[];
  currentPage: number;
  totalItems: number;
  totalPages: number;
}

@Injectable({
  providedIn: 'root'
})
export class QuotationService {
  private apiUrl = `${environment.apiUrl}/api/quotations`;
  private quotationItemsApiUrl = `${environment.apiUrl}/api/quotation-items`;

  constructor(private http: HttpClient) { }

  createQuotation(quotation: CreateQuotationRequest): Observable<QuotationResponse> {
    return this.http.post<QuotationResponse>(`${this.apiUrl}/create`, quotation);
  }

  updateQuotation(id: number, data: any): Observable<any> {
    data.quotationId = id;
    return this.http.put<any>(`${this.apiUrl}/update`, data);
  }

  searchQuotations(params: any): Observable<QuotationResponse> {
    return this.http.post<QuotationResponse>(`${this.apiUrl}/search`, params);
  }

  deleteQuotation(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/delete`, { quotationId: id });
  }

  generatePdf(id: number): Observable<{ blob: Blob; filename: string | undefined }> {
    return this.http.post(`${this.apiUrl}/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '');
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  generateDispatchPdf(id: number, quotationItemIds: any): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/generate-dispatch-slip`, { id, quotationItemIds }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'dispatch-slip.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  updateQuotationStatus(id: number, status: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/update-status`, { id, status });
  }

  getQuotationDetail(id: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/detail`, { id }).pipe(
      map(response => {
        if (response && response.data) {
          return {
            success: true,
            data: response.data
          };
        }
        return {
          success: false,
          message: 'Invalid response format'
        };
      })
    );
  }

  // New methods for updating quotation item status and production flag
  updateQuotationItemStatus(id: number, status: 'O' | 'IP' | 'C' | 'B' | null): Observable<any> {
    return this.http.put(`${this.quotationItemsApiUrl}/status`, { id, quotationItemStatus: status });
  }

  updateQuotationItemProduction(id: number, isProduction: boolean): Observable<any> {
    return this.http.put(`${this.quotationItemsApiUrl}/production`, { id, isProduction });
  }

  // Method for searching quotation items with details
  searchQuotationItemsWithDetails(params: QuotationItemSearchRequest): Observable<QuotationItemSearchResponse> {
    return this.http.post<QuotationItemSearchResponse>(`${this.quotationItemsApiUrl}/search-with-details`, params);
  }

  // Method for searching pending items
  searchPendingItems(params: {
    customerId?: number;
    productId?: number;
    page: number;
    size: number;
    sortBy: string;
    sortDir: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.quotationItemsApiUrl}/pending-item/search`, params);
  }

  // Method for getting status chart data
  getStatusChartData(params: {
    startDate: string;
    endDate: string;
    customerId?: number | null;
    statuses?: string[];
  }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/charts/status`, params);
  }

  updateQuotationItemQuantity(quotationItemId: number, quantity: number): Observable<any> {
    return this.http.put<any>(`${this.quotationItemsApiUrl}/quantity`, { id: quotationItemId, quantity });
  }

  updateQuotationItemDispatch(quotationItemId: number, isDispatch: boolean): Observable<any> {
    return this.http.put<any>(`${this.quotationItemsApiUrl}/dispatch`, { id: quotationItemId, isDispatch });
  }

  updateQuotationItemProductionStatus(quotationItemId: number, isProduction: boolean): Observable<any> {
    return this.http.put<any>(`${this.quotationItemsApiUrl}/production`, { id: quotationItemId, isProduction });
  }

  updateQuotationItemCreatedRoll(quotationItemId: number, createdRoll: number): Observable<any> {
    return this.http.put<any>(`${this.quotationItemsApiUrl}/created-roll`, { id: quotationItemId, createdRoll });
  }
}