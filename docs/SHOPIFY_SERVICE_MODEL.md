# SHOPIFY SERVICE MODEL DESIGN
## CX Digital Order Integration

**Datum**: 26 Feb 2025  
**Owner**: Rob van den Boogaard  
**Status**: Design (awaiting API keys)

---

## VISION

Fetch order data from Shopify with minimal required fields. Design for extensibility—add fields later without breaking existing logic.

---

## ORDER DATA MODEL (MINIMAL MVP)
```typescript
interface Order {
  id: string;                 // Shopify order ID
  store_id: string;           // CX Digital store identifier
  order_date: string;         // ISO 8601
  order_hour: string;         // Hour bucket
  product_count: number;      // Line items total
  source: string;             // "shopify"
}
```

---

## IMPLEMENTATION ROADMAP

### Phase 1: Shopify (ASAP)
- [ ] Receive API keys from Jeffrey
- [ ] Add keys to Vercel env vars
- [ ] Build shopify.service.js
- [ ] Create `orders` table in Supabase
- [ ] Build `/api/dashboard/orders` endpoint
- [ ] Test with live Shopify data

### Phase 2: OTC Calculation
- [ ] Add order_count to daily_metrics
- [ ] Implement OTC ratio formula

### Phase 3: Bol.com Integration
- [ ] Build bol.service.js
- [ ] Aggregate orders by source

---

**Status: Ready for implementation once Jeffrey provides Shopify API keys.**
