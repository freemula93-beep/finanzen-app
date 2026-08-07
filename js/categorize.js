export const DEFAULT_CATEGORIES = [
  { name: 'Gehalt', type: 'income', color: '#22d3ee', budget: 0 },
  { name: 'Nebeneinkommen', type: 'income', color: '#38bdf8', budget: 0 },
  { name: 'Sonstige Einnahmen', type: 'income', color: '#818cf8', budget: 0 },

  { name: 'Lebensmittel', type: 'expense', color: '#f97316', budget: 0 },
  { name: 'Wohnen & Miete', type: 'expense', color: '#ef4444', budget: 0 },
  { name: 'Nebenkosten', type: 'expense', color: '#f43f5e', budget: 0 },
  { name: 'Transport', type: 'expense', color: '#eab308', budget: 0 },
  { name: 'Versicherung', type: 'expense', color: '#a3e635', budget: 0 },
  { name: 'Gesundheit', type: 'expense', color: '#34d399', budget: 0 },
  { name: 'Freizeit & Hobby', type: 'expense', color: '#2dd4bf', budget: 0 },
  { name: 'Restaurants & Café', type: 'expense', color: '#fb923c', budget: 0 },
  { name: 'Shopping', type: 'expense', color: '#c084fc', budget: 0 },
  { name: 'Abos & Streaming', type: 'expense', color: '#e879f9', budget: 0 },
  { name: 'Bildung', type: 'expense', color: '#60a5fa', budget: 0 },
  { name: 'Sonstiges', type: 'expense', color: '#94a3b8', budget: 0 },
];

// keyword -> Kategoriename (case-insensitive, Teilstring-Suche im Verwendungszweck)
export const DEFAULT_RULES = [
  { keyword: 'REWE', category: 'Lebensmittel' },
  { keyword: 'EDEKA', category: 'Lebensmittel' },
  { keyword: 'LIDL', category: 'Lebensmittel' },
  { keyword: 'ALDI', category: 'Lebensmittel' },
  { keyword: 'KAUFLAND', category: 'Lebensmittel' },
  { keyword: 'NETTO', category: 'Lebensmittel' },
  { keyword: 'PENNY', category: 'Lebensmittel' },
  { keyword: 'DM ', category: 'Lebensmittel' },
  { keyword: 'ROSSMANN', category: 'Lebensmittel' },

  { keyword: 'MIETE', category: 'Wohnen & Miete' },
  { keyword: 'HAUSVERWALTUNG', category: 'Wohnen & Miete' },
  { keyword: 'NEBENKOSTEN', category: 'Nebenkosten' },
  { keyword: 'STROM', category: 'Nebenkosten' },
  { keyword: 'STADTWERKE', category: 'Nebenkosten' },
  { keyword: 'GAS', category: 'Nebenkosten' },
  { keyword: 'WASSER', category: 'Nebenkosten' },
  { keyword: 'TELEKOM', category: 'Nebenkosten' },
  { keyword: 'VODAFONE', category: 'Nebenkosten' },
  { keyword: 'O2 ', category: 'Nebenkosten' },
  { keyword: 'INTERNET', category: 'Nebenkosten' },

  { keyword: 'TANKSTELLE', category: 'Transport' },
  { keyword: 'SHELL', category: 'Transport' },
  { keyword: 'ARAL', category: 'Transport' },
  { keyword: 'ESSO', category: 'Transport' },
  { keyword: 'DB VERTRIEB', category: 'Transport' },
  { keyword: 'BAHN', category: 'Transport' },
  { keyword: 'BVG', category: 'Transport' },
  { keyword: 'MVV', category: 'Transport' },
  { keyword: 'UBER', category: 'Transport' },
  { keyword: 'FREE NOW', category: 'Transport' },
  { keyword: 'PARKEN', category: 'Transport' },

  { keyword: 'VERSICHERUNG', category: 'Versicherung' },
  { keyword: 'ALLIANZ', category: 'Versicherung' },
  { keyword: 'HUK', category: 'Versicherung' },

  { keyword: 'APOTHEKE', category: 'Gesundheit' },
  { keyword: 'ARZT', category: 'Gesundheit' },
  { keyword: 'ZAHNARZT', category: 'Gesundheit' },
  { keyword: 'FITNESS', category: 'Gesundheit' },
  { keyword: 'MCFIT', category: 'Gesundheit' },

  { keyword: 'NETFLIX', category: 'Abos & Streaming' },
  { keyword: 'SPOTIFY', category: 'Abos & Streaming' },
  { keyword: 'DISNEY', category: 'Abos & Streaming' },
  { keyword: 'AMAZON PRIME', category: 'Abos & Streaming' },
  { keyword: 'YOUTUBE PREMIUM', category: 'Abos & Streaming' },
  { keyword: 'DAZN', category: 'Abos & Streaming' },
  { keyword: 'APPLE.COM/BILL', category: 'Abos & Streaming' },

  { keyword: 'AMAZON', category: 'Shopping' },
  { keyword: 'ZALANDO', category: 'Shopping' },
  { keyword: 'H&M', category: 'Shopping' },
  { keyword: 'MEDIAMARKT', category: 'Shopping' },
  { keyword: 'SATURN', category: 'Shopping' },
  { keyword: 'IKEA', category: 'Shopping' },

  { keyword: 'RESTAURANT', category: 'Restaurants & Café' },
  { keyword: 'MCDONALD', category: 'Restaurants & Café' },
  { keyword: 'BURGER KING', category: 'Restaurants & Café' },
  { keyword: 'LIEFERANDO', category: 'Restaurants & Café' },
  { keyword: 'STARBUCKS', category: 'Restaurants & Café' },
  { keyword: 'CAFE', category: 'Restaurants & Café' },

  { keyword: 'GEHALT', category: 'Gehalt' },
  { keyword: 'LOHN', category: 'Gehalt' },
  { keyword: 'GA-VOLKSBANK', category: 'Gehalt' },
];

export function categorizeDescription(description, rules) {
  if (!description) return null;
  const upper = description.toUpperCase();
  const match = rules.find((r) => upper.includes(r.keyword.toUpperCase()));
  return match ? match.category : null;
}
