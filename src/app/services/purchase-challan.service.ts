import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PurchaseChallan, PurchaseChallanResponse, PurchaseChallanSearchRequest } from '../models/purchase-challan.model';

@Injectable({
  providedIn: 'root'
})
export class PurchaseChallanService {
  private apiUrl = `${environment.apiUrl}/api/purchase-challans`;

  constructor(private http: HttpClient) {}

  searchPurchaseChallans(params: PurchaseChallanSearchRequest): Observable<PurchaseChallanResponse> {
    return this.http.post<PurchaseChallanResponse>(`${this.apiUrl}/search`, params);
  }

  createPurchaseChallan(purchaseChallan: PurchaseChallan): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, purchaseChallan);
  }

  updatePurchaseChallan(purchaseChallan: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, purchaseChallan);
  }

  deletePurchaseChallan(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getPurchaseChallanDetails(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/detail`, { id });
  }

  updateQcPass(payload: { challanItemId: number; qcPass: number }): Observable<any> {
    return this.http.post(`${this.apiUrl}/update-qc-pass`, payload);
  }

  generatePdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'purchase-challan.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  convertToPurchase(challanId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/convert-to-purchase`, { challanId });
  }
}