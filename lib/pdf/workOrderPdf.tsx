import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

const c = {
  brand:    '#d35400',
  dark:     '#1a1a2e',
  gray:     '#6b7280',
  lightGray:'#f3f4f6',
  border:   '#e5e7eb',
  white:    '#ffffff',
  green:    '#16a34a',
}

const s = StyleSheet.create({
  page:       { fontSize: 9, color: c.dark, backgroundColor: c.white, paddingHorizontal: 36, paddingVertical: 32 },
  // Header
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: c.brand },
  company:    { flexDirection: 'column', gap: 2 },
  companyName:{ fontSize: 14, fontWeight: 'bold', color: c.brand },
  companyInfo:{ fontSize: 8, color: c.gray },
  titleBlock: { alignItems: 'flex-end' },
  woTitle:    { fontSize: 18, fontWeight: 'bold', color: c.dark, letterSpacing: 1 },
  woDate:     { fontSize: 8, color: c.gray, marginTop: 3 },
  woBadge:    { marginTop: 4, backgroundColor: c.brand, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  woBadgeText:{ fontSize: 8, color: c.white, fontWeight: 'bold' },
  // Client bar
  clientBar:  { backgroundColor: c.lightGray, borderRadius: 6, padding: 12, marginBottom: 14, flexDirection: 'row', gap: 20 },
  clientCol:  { flex: 1 },
  clientLabel:{ fontSize: 7, color: c.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  clientValue:{ fontSize: 9, fontWeight: 'bold', color: c.dark },
  // Section
  section:    { marginBottom: 12 },
  sectionHead:{ backgroundColor: c.dark, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, marginBottom: 6 },
  sectionTitle:{ fontSize: 8, fontWeight: 'bold', color: c.white, textTransform: 'uppercase', letterSpacing: 0.8 },
  // Grid
  row2:       { flexDirection: 'row', gap: 10, marginBottom: 6 },
  field:      { flex: 1 },
  label:      { fontSize: 7, color: c.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value:      { fontSize: 9, color: c.dark, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 3 },
  valueEmpty: { fontSize: 9, color: '#d1d5db', borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 3 },
  // Textarea
  textArea:   { fontSize: 9, color: c.dark, borderWidth: 1, borderColor: c.border, borderRadius: 4, padding: 8, minHeight: 48, lineHeight: 1.5 },
  textAreaEmpty:{ fontSize: 9, color: '#d1d5db', borderWidth: 1, borderColor: c.border, borderRadius: 4, padding: 8, minHeight: 32 },
  // Photos
  photoGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoImg:   { width: 120, height: 90, objectFit: 'cover', borderRadius: 3 },
  // Footer
  footer:     { marginTop: 24, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 7, color: c.gray },
  signRow:    { flexDirection: 'row', gap: 32, marginTop: 24 },
  signBlock:  { flex: 1 },
  signLine:   { borderBottomWidth: 1, borderBottomColor: c.dark, marginBottom: 4, height: 24 },
  signLabel:  { fontSize: 7, color: c.gray },
})

function Field({ label, value, flex }: { label: string; value: string; flex?: number }) {
  return (
    <View style={[s.field, flex ? { flex } : {}]}>
      <Text style={s.label}>{label}</Text>
      <Text style={value ? s.value : s.valueEmpty}>{value || '—'}</Text>
    </View>
  )
}

export interface WorkOrderPdfData {
  clientName:         string
  clientAddress:      string
  clientEmail:        string
  clientPhone:        string
  jobNumber:          string
  crmLink:            string
  projectTotal:       string
  painterPay:         string
  totalHours:         string
  materialsPrice:     string
  colorChange:        string
  numberOfColors:     string
  jobType:            string
  budgetHours:        string
  materialsBudget:    string
  paintsAndGallons:   string
  colorIds:           string
  scopeOfWork:        string
  exclusionsAndNotes: string
  status:             string
  createdAt:          string
  companyName:        string
  companyPhone:       string
  companyEmail:       string
  companyAddress:     string
  companyLicense:     string
  photoUrls:          string[]
}

export function WorkOrderPdf({ data }: { data: WorkOrderPdfData }) {
  const date = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const statusColors: Record<string, string> = {
    new:         '#2563eb',
    in_progress: '#d97706',
    completed:   '#16a34a',
  }
  const statusLabels: Record<string, string> = {
    new:         'NEW',
    in_progress: 'IN PROGRESS',
    completed:   'COMPLETED',
  }

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.company}>
            <Text style={s.companyName}>{data.companyName}</Text>
            <Text style={s.companyInfo}>{data.companyAddress}</Text>
            <Text style={s.companyInfo}>{data.companyPhone}  ·  {data.companyEmail}</Text>
            {data.companyLicense && <Text style={s.companyInfo}>Lic # {data.companyLicense}</Text>}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.woTitle}>WORK ORDER</Text>
            <Text style={s.woDate}>{date}</Text>
            <View style={[s.woBadge, { backgroundColor: statusColors[data.status] ?? c.brand }]}>
              <Text style={s.woBadgeText}>{statusLabels[data.status] ?? data.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Client Bar */}
        <View style={s.clientBar}>
          <View style={s.clientCol}>
            <Text style={s.clientLabel}>Client</Text>
            <Text style={s.clientValue}>{data.clientName || '—'}</Text>
          </View>
          <View style={[s.clientCol, { flex: 2 }]}>
            <Text style={s.clientLabel}>Address</Text>
            <Text style={s.clientValue}>{data.clientAddress || '—'}</Text>
          </View>
        </View>

        {/* Job Details */}
        <View style={s.section}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Job Details</Text></View>
          <View style={s.row2}>
            <Field label="Job #" value={data.jobNumber} />
            <Field label="Job Type" value={data.jobType} />
            <Field label="CRM Link" value={data.crmLink} />
          </View>
          <View style={s.row2}>
            <Field label="Painter Pay (L&M)" value={data.painterPay ? `$${data.painterPay}` : ''} />
            <Field label="Total Hours" value={data.totalHours ? `${data.totalHours} hrs` : ''} />
            <Field label="Materials (Paint + Sundries)" value={data.materialsPrice ? `$${data.materialsPrice}` : ''} />
          </View>
          <View style={s.row2}>
            <Field label="Color Change" value={data.colorChange} />
            <Field label="# of Colors" value={data.numberOfColors} />
          </View>
        </View>

        {/* Paints & Gallons */}
        <View style={s.section}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Paints &amp; Rough Estimate of Gallons</Text></View>
          {data.paintsAndGallons ? (
            <Text style={s.textArea}>{data.paintsAndGallons}</Text>
          ) : (
            <Text style={s.textAreaEmpty}>—</Text>
          )}
        </View>

        {/* Color IDs */}
        {data.colorIds ? (
          <View style={s.section}>
            <View style={s.sectionHead}><Text style={s.sectionTitle}>Color ID&apos;s</Text></View>
            <Text style={s.textArea}>{data.colorIds}</Text>
          </View>
        ) : null}

        {/* Scope of Work */}
        <View style={s.section}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Scope of Work</Text></View>
          {data.scopeOfWork ? (
            <Text style={s.textArea}>{data.scopeOfWork}</Text>
          ) : (
            <Text style={s.textAreaEmpty}>—</Text>
          )}
        </View>

        {/* Exclusions */}
        {data.exclusionsAndNotes ? (
          <View style={s.section}>
            <View style={s.sectionHead}><Text style={s.sectionTitle}>Exclusions &amp; Notes</Text></View>
            <Text style={s.textArea}>{data.exclusionsAndNotes}</Text>
          </View>
        ) : null}

      </Page>

      {/* Photos page — one per 6 photos */}
      {data.photoUrls.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <View style={s.section}>
            <View style={s.sectionHead}><Text style={s.sectionTitle}>Project Photos ({data.photoUrls.length})</Text></View>
            <View style={s.photoGrid}>
              {data.photoUrls.map((url, i) => (
                <Image key={i} src={url} style={s.photoImg} />
              ))}
            </View>
          </View>
        </Page>
      )}

    </Document>
  )
}
