import { Injectable } from '@angular/core';
import { AuthService, UserRole } from '../../services/auth.service';

type SwapRule = { pattern: RegExp; replacement: string };

@Injectable({
  providedIn: 'root'
})
export class TransactionLabelService {
  private readonly swapRules: SwapRule[] = [
    { pattern: /Purchase Returns/gi, replacement: 'Sale Returns' },
    { pattern: /Purchase Return/gi, replacement: 'Sale Return' },
    { pattern: /Sale Returns/gi, replacement: 'Purchase Returns' },
    { pattern: /Sale Return/gi, replacement: 'Purchase Return' },
    { pattern: /Pur\. returns/gi, replacement: 'Sal. returns' },
    { pattern: /Pur\. Return/gi, replacement: 'Sal. Return' },
    { pattern: /PO Pending Items/g, replacement: 'SO Pending Items' },
    { pattern: /Purchases/gi, replacement: 'Sales' },
    { pattern: /Purchase/gi, replacement: 'Sale' },
    { pattern: /Sales/gi, replacement: 'Purchases' },
    { pattern: /Sale/gi, replacement: 'Purchase' },
  ];

  constructor(private authService: AuthService) {}

  isDealer(): boolean {
    return this.authService.hasRole(UserRole.DEALER);
  }

  swap(text: string): string {
    if (!text || !this.isDealer()) {
      return text;
    }

    const placeholders: Record<string, string> = {};
    let index = 0;
    let result = text;

    for (const rule of this.swapRules) {
      result = result.replace(rule.pattern, (match) => {
        const key = `\x00${index++}\x00`;
        placeholders[key] = this.applyCase(match, rule.replacement);
        return key;
      });
    }

    return result.replace(/\x00\d+\x00/g, (key) => placeholders[key] ?? key);
  }

  private applyCase(original: string, replacement: string): string {
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (original === original.toLowerCase()) {
      return replacement.toLowerCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }
}
