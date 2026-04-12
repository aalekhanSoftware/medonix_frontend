import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DateUtils {
  formatDate(dateString: string): string {
    if (!dateString) return '';
    
    try {
      // Create a date object from the UTC string
      const date = new Date(dateString);
      
      // Format the date according to local timezone
      return date.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-').replace(',', '');
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  }

  formatDateForApi(dateStr: string, isStartDate: boolean = false): string {
    if (!dateStr) return '';
    
    try {
      // Create date object and adjust for IST
      const date = new Date(dateStr);
      const istDate = new Date(date.getTime() - (5.5 * 60 * 60 * 1000));
      
      if (isNaN(istDate.getTime())) return '';

      const day = istDate.getDate().toString().padStart(2, '0');
      const month = (istDate.getMonth() + 1).toString().padStart(2, '0');
      const year = istDate.getFullYear();
      const time = isStartDate ? '00:00:00' : '23:59:59';

      return `${day}-${month}-${year} ${time}`;
    } catch (error) {
      console.error('Error formatting date for API:', error);
      return '';
    }
  }
  

  formatDateDDMMYYYY(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    } catch (error) {
      console.error('Error formatting date DD-MM-YYYY:', error);
      return '';
    }
  }

  formatDateTimeForApi(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day}-${month}-${year} ${hours}:${minutes}:00`;
  }

  formatDateTimeForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
} 