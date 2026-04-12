import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { EncryptionService } from '../shared/services/encryption.service';

export interface TransportMasterSearchRequest {
  search?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface TransportMaster {
  id?: number;
  name: string;
  mobile?: string;
  gst?: string;
  remarks?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class TransportMasterService {
  private apiUrl = `${environment.apiUrl}/api/transports`;
  private readonly CACHE_KEY = 'active_transports';

  constructor(private http: HttpClient, private encryptionService: EncryptionService) {}

  create(transport: TransportMaster): Observable<any> {
    return this.http.post(this.apiUrl, transport);
  }

  update(transport: TransportMaster): Observable<any> {
    return this.http.put(this.apiUrl, transport);
  }

  delete(id: number): Observable<any> {
    return this.http.request('DELETE', this.apiUrl, { body: { id } });
  }

  getTransports(params: any): Observable<any> {
    if (params?.status === 'A') {
      const encryptedData = localStorage.getItem(this.CACHE_KEY);
      if (encryptedData) {
        const decryptedData = this.encryptionService.decrypt(encryptedData);
        if (decryptedData) {
          return of(decryptedData);
        }
      }
    }

    return this.http.post<any>(`${this.apiUrl}/getTransports`, {
      search: params?.search
    }).pipe(
      tap(response => {
        if (params?.status === 'A' && response?.success) {
          const encryptedData = this.encryptionService.encrypt(response);
          localStorage.setItem(this.CACHE_KEY, encryptedData);
        }
      })
    );
  }

  refreshTransports(): Observable<any> {
    localStorage.removeItem(this.CACHE_KEY);
    return this.getTransports({ status: 'A' });
  }

  search(payload: TransportMasterSearchRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/search`, payload);
  }

  details(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/details`, { id });
  }
}