import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class EncryptionService {
  private readonly secretKey = 'your-secret-key'; // Replace with your actual secret key

  encrypt(value: string): string {
    try {
      if (!value) return '';
      
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(value), this.secretKey);
      return encrypted.toString();
    } catch (error) {
      console.error('Encryption error:', error);
      return '';
    }
  }

  decrypt(encryptedValue: string): string {
    try {
      if (!encryptedValue) return '';
      
      const decrypted = CryptoJS.AES.decrypt(encryptedValue, this.secretKey);
      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedString) return '';
      
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Decryption error:', error);
      return '';
    }
  }
} 