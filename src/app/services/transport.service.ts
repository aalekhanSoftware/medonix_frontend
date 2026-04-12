import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class TransportService {
  private apiUrl = `${environment.apiUrl}/api/transports`;

  constructor(private http: HttpClient) {}

  createTransport(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, data);
  }

  getTransports(params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/list`, { params });
  }

  getTransport(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  deleteTransport(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  searchTransports(params: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/search`, params );
  }

  getTransportDetail(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/detail`, { id });
  }

  updateTransport(data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/update`, data);
  }

  generatePdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'transport.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }
} 