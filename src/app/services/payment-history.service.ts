import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  PaymentHistoryUpsertRequest,
  PaymentHistoryUpsertResponse,
  PaymentHistorySearchRequest,
  PaymentHistorySearchResponse,
  PaymentHistoryDetailsResponse,
  PaymentHistoryDeleteResponse
} from '../models/payment-history.model';

@Injectable({ providedIn: 'root' })
export class PaymentHistoryService {
  private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  // Create new payment history
  createPaymentHistory(request: PaymentHistoryUpsertRequest): Observable<PaymentHistoryUpsertResponse> {
    return this.http.post<PaymentHistoryUpsertResponse>(`${this.apiUrl}/api/payment-history/save`, request);
  }

  // Update payment history (with ID in body)
  updatePaymentHistory(request: PaymentHistoryUpsertRequest): Observable<PaymentHistoryUpsertResponse> {
    return this.http.post<PaymentHistoryUpsertResponse>(`${this.apiUrl}/api/payment-history/update`, request);
  }

  // Update payment history (with ID in path)
  updatePaymentHistoryById(id: number, request: Omit<PaymentHistoryUpsertRequest, 'id'>): Observable<PaymentHistoryUpsertResponse> {
    // Encrypt the ID for URL
    return this.http.put<PaymentHistoryUpsertResponse>(`${this.apiUrl}/api/payment-history/${id}`, request);
  }

  // Delete payment history (with ID in body)
  deletePaymentHistory(id: number): Observable<PaymentHistoryDeleteResponse> {
    return this.http.post<PaymentHistoryDeleteResponse>(`${this.apiUrl}/api/payment-history/delete`, { id });
  }

  // Get / search payment histories (same search API; forwards all filter fields)
  getPaymentHistories(request: PaymentHistorySearchRequest): Observable<PaymentHistorySearchResponse> {
    const searchRequest: PaymentHistorySearchRequest = {
      ...request,
      search: request.search ?? ''
    };
    return this.http.post<PaymentHistorySearchResponse>(`${this.apiUrl}/api/payment-history/search`, searchRequest);
  }

  searchPaymentHistories(request: PaymentHistorySearchRequest): Observable<PaymentHistorySearchResponse> {
    return this.getPaymentHistories(request);
  }

  // Get payment history details (with ID in body)
  getPaymentHistoryDetails(id: number): Observable<PaymentHistoryDetailsResponse> {
    return this.http.post<PaymentHistoryDetailsResponse>(`${this.apiUrl}/api/payment-history/get-detail`, { id });
  }

  // Get payment history details (with ID in path - encrypted)
  getPaymentHistoryDetailsById(id: number): Observable<PaymentHistoryDetailsResponse> {
    return this.http.get<PaymentHistoryDetailsResponse>(`${this.apiUrl}/api/payment-history/${id}`);
  }
}