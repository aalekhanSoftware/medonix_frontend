import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { LedgerPdfDataApiResponse } from '../models/ledger-pdf-data.model';

@Injectable({
  providedIn: 'root'
})
export class LedgerService {
  private apiUrl = `${environment.apiUrl}/api/ledger`;

  constructor(private http: HttpClient) {}

  generatePdf(params: { customerId: number; startDate: string; endDate: string }): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/generate-pdf`, params, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'ledger_report.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  generatePdfData(params: { customerId: number; startDate: string; endDate: string }): Observable<LedgerPdfDataApiResponse> {
    return this.http.post<LedgerPdfDataApiResponse>(`${this.apiUrl}/generate-pdf-data`, params);
  }
}