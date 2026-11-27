import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ArFifoPageResponse, ArFifoSearchPayload, ArFifoSearchResult } from '../models/ar-fifo-report.model';

/**
 * AR_FIFO — Accounts Receivable FIFO report API client.
 *
 * Backend:
 *   POST /api/reports/ar-fifo/search
 *   POST /api/reports/ar-fifo/export-excel
 */
@Injectable({
  providedIn: 'root'
})
export class ArFifoReportService {
  private readonly baseUrl = `${environment.apiUrl}/api/reports/ar-fifo`;

  constructor(private http: HttpClient) {}

  search(payload: ArFifoSearchPayload): Observable<ArFifoSearchResult> {
    return this.http
      .post<ArFifoPageResponse>(`${this.baseUrl}/search`, payload, { observe: 'response' })
      .pipe(
        map(response => ({
          page: response.body as ArFifoPageResponse,
          asOn: response.headers.get('X-Report-As-On') || undefined
        }))
      );
  }

  exportExcel(payload: ArFifoSearchPayload): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .post(`${this.baseUrl}/export-excel`, payload, {
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        map(response => {
          const contentDisposition = response.headers.get('Content-Disposition');
          const filename =
            contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ||
            `ar_fifo_receivable_${new Date().toISOString().slice(0, 10)}.xlsx`;
          const blob = new Blob([response.body!], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          return { blob, filename };
        })
      );
  }
}
