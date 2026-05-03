import {
  Document, Page, View, Text, Image, StyleSheet, Font,
} from '@react-pdf/renderer'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposalPdfData {
  // Company
  companyName: string
  companyAddress: string
  companyCityStateZip: string
  companyPhone: string
  companyEmail: string
  companyWebsite?: string
  companyLicense?: string
  companyLogoUrl?: string
  // Client
  clientName: string
  clientAddress: string
  clientPhone?: string
  clientEmail?: string
  // Scope
  scopeProject?: string
  scopePrepWork?: string
  scopePainting?: string
  scopeCleanUp?: string
  scopeWalkThrough?: string
  scopePaintProducts?: string
  totalColors?: string
  totalCoats?: string
  // Pricing
  selectedBrandLabel: string
  paintingSubtotal: number
  woodTotal: number
  customItems: { description: string; price: number }[]
  combinedSubtotal: number
  applyDiscount: boolean
  discountAmount: number
  taxRate: number | null
  taxCity: string
  taxAmount: number
  grandTotal: number
  depositPercent: number
  depositAmount: number
  balanceDue: number
  // Signature
  signatureName: string
  signatureDate: string
  signatureDataUrl?: string
  // Meta
  generatedDate: string
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BRAND   = '#df6437'
const DARK    = '#1f2937'
const GRAY    = '#6b7280'
const LGRAY   = '#f3f4f6'
const WHITE   = '#ffffff'

const s = StyleSheet.create({
  page:           { fontFamily: 'Helvetica', fontSize: 9, color: DARK, backgroundColor: WHITE, paddingBottom: 40 },
  // Header
  header:         { backgroundColor: BRAND, padding: 24, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  logo:           { width: 52, height: 52, borderRadius: 6, backgroundColor: WHITE, padding: 4, objectFit: 'contain' },
  companyName:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: WHITE, marginBottom: 4 },
  companyDetail:  { fontSize: 8, color: '#fcd9c4', marginTop: 1 },
  dateLabel:      { fontSize: 7, color: '#fcd9c4', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' },
  dateValue:      { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE, textAlign: 'right', marginTop: 2 },
  // Section cards
  card:           { marginHorizontal: 24, marginTop: 16, borderRadius: 8, border: '1pt solid #e5e7eb', padding: 16 },
  cardRow:        { flexDirection: 'row', gap: 16 },
  cardHalf:       { flex: 1 },
  sectionLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  clientName:     { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 },
  clientDetail:   { fontSize: 9, color: GRAY, marginTop: 2 },
  // Scope
  scopeLabel:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BRAND, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 10, marginBottom: 3 },
  scopeText:      { fontSize: 8.5, color: DARK, lineHeight: 1.5 },
  // Pricing
  priceRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  priceLabel:     { fontSize: 9, color: DARK },
  priceValue:     { fontSize: 9, color: DARK, fontFamily: 'Helvetica-Bold' },
  divider:        { borderTop: '1pt solid #e5e7eb', marginVertical: 6 },
  discountLabel:  { fontSize: 9, color: '#15803d' },
  discountValue:  { fontSize: 9, color: '#15803d', fontFamily: 'Helvetica-Bold' },
  taxLabel:       { fontSize: 9, color: DARK },
  // Deposit band
  depositBand:    { backgroundColor: '#fff4ef', marginHorizontal: 24, marginTop: 8, borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  depositTitle:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND },
  depositSub:     { fontSize: 8, color: '#c4572f', marginTop: 2 },
  depositAmt:     { fontSize: 14, fontFamily: 'Helvetica-Bold', color: BRAND },
  // Total row
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 24, marginTop: 8, paddingTop: 8, borderTop: '1.5pt solid #1f2937' },
  totalLabel:     { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK },
  totalValue:     { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BRAND },
  // Signature
  sigBox:         { marginHorizontal: 24, marginTop: 16, borderRadius: 8, border: '1pt solid #e5e7eb', padding: 16 },
  sigTitle:       { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 10 },
  sigName:        { fontSize: 10, color: DARK, marginBottom: 4 },
  sigDate:        { fontSize: 9, color: GRAY },
  sigImg:         { height: 48, maxWidth: 200, objectFit: 'contain', marginTop: 8, marginBottom: 4 },
  sigLine:        { borderTop: '1pt solid #d1d5db', marginTop: 4 },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── PDF Document ────────────────────────────────────────────────────────────

export function ProposalPdf({ data }: { data: ProposalPdfData }) {
  const hasScope = data.scopeProject || data.scopePrepWork || data.scopePainting ||
                   data.scopeCleanUp || data.scopeWalkThrough || data.scopePaintProducts

  return (
    <Document title={`${data.clientName} - Signed Contract - ${data.generatedDate}`}>
      <Page size="LETTER" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {data.companyLogoUrl && (
              <Image style={s.logo} src={data.companyLogoUrl} />
            )}
            <View>
              <Text style={s.companyName}>{data.companyName}</Text>
              <Text style={s.companyDetail}>{data.companyAddress} · {data.companyCityStateZip}</Text>
              <Text style={s.companyDetail}>{data.companyPhone} · {data.companyEmail}</Text>
              {data.companyWebsite && <Text style={s.companyDetail}>{data.companyWebsite}</Text>}
              {data.companyLicense && <Text style={s.companyDetail}>License #: {data.companyLicense}</Text>}
            </View>
          </View>
          <View>
            <Text style={s.dateLabel}>Date</Text>
            <Text style={s.dateValue}>{data.generatedDate}</Text>
          </View>
        </View>

        {/* ── Prepared For / Project Location ── */}
        <View style={[s.card, { marginTop: 20 }]}>
          <View style={s.cardRow}>
            <View style={s.cardHalf}>
              <Text style={s.sectionLabel}>Prepared For</Text>
              <Text style={s.clientName}>{data.clientName}</Text>
              {data.clientPhone && <Text style={s.clientDetail}>{data.clientPhone}</Text>}
              {data.clientEmail && <Text style={s.clientDetail}>{data.clientEmail}</Text>}
            </View>
            {data.clientAddress && (
              <View style={s.cardHalf}>
                <Text style={s.sectionLabel}>Project Location</Text>
                <Text style={[s.clientName, { fontSize: 10 }]}>{data.clientAddress}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Scope of Work ── */}
        {hasScope && (
          <View style={s.card}>
            <Text style={[s.sectionLabel, { fontSize: 9, color: DARK, marginBottom: 8 }]}>Scope of Work</Text>
            {data.scopeProject     && <><Text style={s.scopeLabel}>Project</Text><Text style={s.scopeText}>{data.scopeProject}</Text></>}
            {data.scopePrepWork    && <><Text style={s.scopeLabel}>Prep Work</Text><Text style={s.scopeText}>{data.scopePrepWork}</Text></>}
            {data.scopePainting    && <><Text style={s.scopeLabel}>Painting</Text><Text style={s.scopeText}>{data.scopePainting}</Text></>}
            {data.scopeCleanUp     && <><Text style={s.scopeLabel}>Clean Up</Text><Text style={s.scopeText}>{data.scopeCleanUp}</Text></>}
            {data.scopeWalkThrough && <><Text style={s.scopeLabel}>Walk Through</Text><Text style={s.scopeText}>{data.scopeWalkThrough}</Text></>}
            {data.scopePaintProducts && <><Text style={s.scopeLabel}>Paint Products</Text><Text style={s.scopeText}>{data.scopePaintProducts}</Text></>}
            {(data.totalColors || data.totalCoats) && (
              <View style={[s.priceRow, { marginTop: 6, borderTop: '1pt solid #f3f4f6', paddingTop: 6 }]}>
                {data.totalColors && <Text style={s.scopeText}>Colors: {data.totalColors}</Text>}
                {data.totalCoats  && <Text style={s.scopeText}>Coats: {data.totalCoats}</Text>}
              </View>
            )}
          </View>
        )}

        {/* ── Pricing ── */}
        <View style={s.card} wrap={false}>
          <Text style={[s.sectionLabel, { fontSize: 9, color: DARK, marginBottom: 8 }]}>Your Estimate</Text>

          {/* Line items */}
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Exterior Painting — {data.selectedBrandLabel}</Text>
            <Text style={s.priceValue}>{fmtD(data.paintingSubtotal)}</Text>
          </View>
          {data.woodTotal > 0 && (
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Wood Replacement</Text>
              <Text style={s.priceValue}>{fmtD(data.woodTotal)}</Text>
            </View>
          )}
          {data.customItems.filter(i => i.description && i.price > 0).map((item, idx) => (
            <View key={idx} style={s.priceRow}>
              <Text style={s.priceLabel}>{item.description}</Text>
              <Text style={s.priceValue}>{fmtD(item.price)}</Text>
            </View>
          ))}

          <View style={s.divider} />

          {/* Subtotal + discount + tax */}
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Subtotal</Text>
            <Text style={s.priceValue}>{fmtD(data.combinedSubtotal)}</Text>
          </View>
          {data.applyDiscount && data.discountAmount > 0 && (
            <View style={s.priceRow}>
              <Text style={s.discountLabel}>Discount (10% — Sign Today)</Text>
              <Text style={s.discountValue}>− {fmtD(data.discountAmount)}</Text>
            </View>
          )}
          {data.taxRate != null && (
            <View style={s.priceRow}>
              <Text style={s.taxLabel}>
                Sales Tax ({(data.taxRate * 100).toFixed(1)}%{data.taxCity ? ` — ${data.taxCity}` : ''})
              </Text>
              <Text style={s.priceValue}>+ {fmtD(data.taxAmount)}</Text>
            </View>
          )}

          {/* Balance */}
          <View style={s.divider} />
          <View style={s.priceRow}>
            <Text style={[s.priceLabel, { color: GRAY }]}>Balance due on completion</Text>
            <Text style={[s.priceValue, { color: GRAY }]}>{fmtD(data.balanceDue)}</Text>
          </View>
        </View>

        {/* ── Deposit + Total + Signature (keep together) ── */}
        <View wrap={false}>
          {/* Deposit band */}
          <View style={s.depositBand}>
            <View>
              <Text style={s.depositTitle}>Deposit Due ({Math.round(data.depositPercent * 100)}%)</Text>
              <Text style={s.depositSub}>Required to secure your project start date</Text>
            </View>
            <Text style={s.depositAmt}>{fmtD(data.depositAmount)}</Text>
          </View>

          {/* Grand total */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{fmtD(data.grandTotal)}</Text>
          </View>

          {/* Signature */}
          <View style={s.sigBox}>
            <Text style={s.sigTitle}>Signed &amp; Accepted</Text>
            <Text style={s.sigName}>{data.signatureName}</Text>
            {data.signatureDataUrl && (
              <Image style={s.sigImg} src={data.signatureDataUrl} />
            )}
            <View style={s.sigLine} />
            <Text style={s.sigDate}>{data.signatureDate}</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
