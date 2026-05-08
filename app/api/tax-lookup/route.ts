import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { addr, city, zip } = await req.json() as {
    addr?: string
    city?: string
    zip?: string
  }

  const params = new URLSearchParams({
    output: 'text',
    addr: addr ?? '',
    city: city ?? '',
    zip:  zip  ?? '',
  })

  const url = `https://webgis.dor.wa.gov/webapi/AddressRates.aspx?${params.toString()}`

  try {
    const res  = await fetch(url, {
      next: { revalidate: 0 },
      headers: { 'Accept-Encoding': 'identity' },
    })
    const text = await res.text()

    // Response format: "LocationCode=3406  Rate=0.084  ResultCode=0"
    const rateMatch = text.match(/Rate=([\d.]+)/)
    const codeMatch = text.match(/ResultCode=(\d+)/)

    const rate       = rateMatch ? parseFloat(rateMatch[1]) : null
    const resultCode = codeMatch ? parseInt(codeMatch[1])   : null

    console.log('[tax-lookup] addr=%s city=%s zip=%s → rate=%s resultCode=%s', addr, city, zip, rate, resultCode)

    // Result codes 0-5 = found at some level; 6+ = not found at all
    if (rate === null || resultCode === null || resultCode >= 6) {
      console.warn('[tax-lookup] Address not found — resultCode=%s raw=%s', resultCode, text.trim())
      return NextResponse.json({ error: 'Address not found', resultCode }, { status: 422 })
    }

    return NextResponse.json({ rate, resultCode })
  } catch (err) {
    console.error('[tax-lookup] Fetch failed:', err)
    return NextResponse.json({ error: 'Tax lookup failed' }, { status: 500 })
  }
}
