import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Sale, SaleResponse, SaleSearchRequest } from '../models/sale.model';

@Injectable({
  providedIn: 'root'
})
export class SaleService {
  private apiUrl = `${environment.apiUrl}/api/sales`;

  constructor(private http: HttpClient) {}

  searchSales(params: SaleSearchRequest): Observable<SaleResponse> {
    return this.http.post<SaleResponse>(`${this.apiUrl}/searchSale`, params);
  }

  createSale(sale: Sale): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, sale);
  }

  updateSale(sale: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, sale);
  }

  deleteSale(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getSaleDetails(id: number, isSalesReturn: boolean = false): Observable<any> {
    return this.http.post(`${this.apiUrl}/detail`, { id, isSalesReturn });
  }

  createSaleReturn(payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/sale-returns/create`, payload);
  }

  searchSaleReturn(params: any): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/api/sale-returns/searchSaleReturn`, params);
  }

  deleteSaleReturn(id: number): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/api/sale-returns/delete`, { id });
  }

  getSaleReturnDetail(id: number): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/api/sale-returns/detail`, { id });
  }

  createFromQuotationItems(quotationItemIds: number[], packagingAndForwadingCharges?: number): Observable<any> {
    const payload: any = { quotationItemIds };
    if (packagingAndForwadingCharges !== undefined && packagingAndForwadingCharges !== null) {
      payload.packagingAndForwadingCharges = packagingAndForwadingCharges;
    }
    return this.http.post(`${this.apiUrl}/createFromQuotationItems`, payload);
  }

  generatePdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'sale.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  generateSaleReturnPdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${environment.apiUrl}/api/sale-returns/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'sale-return.pdf';
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
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || `sale_export_${params.startDate}_${params.endDate}.xlsx`;
        const blob = new Blob([response.body!], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return { blob, filename };
      })
    );
  }

  exportSaleReturnExcel(params: { startDate: string; endDate: string }): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${environment.apiUrl}/api/sale-returns/export-excel`, params, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || `sale_return_export_${params.startDate}_${params.endDate}.xlsx`;
        const blob = new Blob([response.body!], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return { blob, filename };
      })
    );
  }
}