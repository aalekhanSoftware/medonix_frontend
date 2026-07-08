export interface GstSplitResult {
  adjustedTaxAmount: number;
  sgst: number;
  cgst: number;
  igst: number;
}

function roundHalfUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Number((Math.round((value + Number.EPSILON) * factor) / factor).toFixed(decimals));
}

export function calculateGstTaxes(taxAmount: number, customerGst: string | null | undefined): GstSplitResult {
  let sgst = 0;
  let cgst = 0;
  let igst = 0;
  let adjustedTaxAmount = taxAmount;

  const trimmedGst = customerGst ? customerGst.trim() : '';
  const useSgstCgst = !trimmedGst || trimmedGst.startsWith('24');

  if (useSgstCgst) {
    const taxAmountScaled = roundHalfUp(taxAmount, 2);
    const halfTax = roundHalfUp(taxAmountScaled / 2, 2);
    sgst = halfTax;
    cgst = halfTax;
    adjustedTaxAmount = roundHalfUp(sgst + cgst, 2);
    igst = 0;
  } else {
    igst = roundHalfUp(taxAmount, 2);
    sgst = 0;
    cgst = 0;
    adjustedTaxAmount = igst;
  }

  return { adjustedTaxAmount, sgst, cgst, igst };
}

export function getCustomerGst(customers: any[], customerId: number | null): string | null {
  if (!customerId || !customers?.length) return null;
  const customer = customers.find((c: any) => c.id === customerId);
  return customer?.gst || null;
}
