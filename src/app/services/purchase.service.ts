import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Purchase, PurchaseRecentResponse, PurchaseResponse, PurchaseSearchRequest } from '../models/purchase.model';
import { StandalonePurchaseReturnRequest, StandalonePurchaseReturnUpdateRequest } from '../models/purchase-return.model';

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {
  private apiUrl = `${environment.apiUrl}/api/purchases`;
  private purchaseReturnApiUrl = `${environment.apiUrl}/api/purchase-returns`;

  constructor(private http: HttpClient) {}

  searchPurchases(params: PurchaseSearchRequest): Observable<PurchaseResponse> {
    return this.http.post<PurchaseResponse>(`${this.apiUrl}/searchPurchase`, params);
  }

  /**
   * Recent purchases for quick selection (append PO items into an existing Purchase).
   * API: `GET /api/purchases/last-6-months`
   */
  getPurchasesLast6Months(): Observable<PurchaseRecentResponse> {
    return this.http.get<PurchaseRecentResponse>(`${this.apiUrl}/last-6-months`);
  }

  createPurchase(purchase: Purchase): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, purchase);
  }

  updatePurchase(purchase: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, purchase);
  }

  deletePurchase(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getPurchaseDetails(id: number, isPurchaseReturn: Boolean = false): Observable<any> {
    return this.http.post(`${this.apiUrl}/detail`, { id, isPurchaseReturn });
  }

  updateQcPass(payload: { purchaseItemId: number; qcPass: number | null }): Observable<any> {
    return this.http.post(`${this.apiUrl}/update-qc-pass`, payload);
  }

  createPurchaseReturn(payload: any): Observable<any> {
    return this.http.post(`${this.purchaseReturnApiUrl}/create`, payload);
  }

  createStandalonePurchaseReturn(payload: StandalonePurchaseReturnRequest): Observable<any> {
    return this.http.post(`${this.purchaseReturnApiUrl}/create-standalone`, payload);
  }

  /** Update standalone purchase return. API: POST /api/purchase-returns/create-standalone */
  updateStandalonePurchaseReturn(payload: StandalonePurchaseReturnUpdateRequest): Observable<any> {
    return this.http.post(`${this.purchaseReturnApiUrl}/create-standalone`, payload);
  }

  getPurchaseReturnDetail(id: number): Observable<any> {
    return this.http.post(`${this.purchaseReturnApiUrl}/detail`, { id });
  }

  searchPurchaseReturn(params: any): Observable<any> {
    return this.http.post<any>(`${this.purchaseReturnApiUrl}/searchPurchaseReturn`, params);
  }

  deletePurchaseReturn(id: number): Observable<any> {
    return this.http.post<any>(`${this.purchaseReturnApiUrl}/delete`, { id });
  }

  generatePdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'purchase.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  generatePurchaseReturnPdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.purchaseReturnApiUrl}/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'purchase-return.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  exportExcel(params: { startDate: string; endDate: string }): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/export-excel`, params, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || `purchase_export_${params.startDate}_${params.endDate}.xlsx`;
        const blob = new Blob([response.body!], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return { blob, filename };
      })
    );
  }

  exportPurchaseReturnExcel(params: { startDate: string; endDate: string }): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.purchaseReturnApiUrl}/export-excel`, params, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || `purchase_return_export_${params.startDate}_${params.endDate}.xlsx`;
        const blob = new Blob([response.body!], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return { blob, filename };
      })
    );
  }
}