// Fallback currency symbols, keyed by uppercased currency code/name, used only
// when the contest's currency record has no `symbol` of its own.
const SYMBOLS = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
};

// Resolve the display symbol for a currency object ({ name, symbol }).
export function currencySymbol(currency) {
  if (currency?.symbol) return currency.symbol;
  const key = String(currency?.name || '').toUpperCase();
  return SYMBOLS[key] || (currency?.name ? `${currency.name} ` : '');
}

// Format a money amount in the given currency. Two decimal places, grouped
// thousands. Display-only rounding — callers keep full precision in their math.
export function formatMoney(amount, currency) {
  if (amount == null || isNaN(amount)) return '—';
  const formatted = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currencySymbol(currency)}${formatted}`;
}
