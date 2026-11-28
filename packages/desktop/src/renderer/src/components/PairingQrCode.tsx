import { useMemo } from 'react'
import QRCode from 'qrcode'
import { t } from '../i18n'

export function PairingQrCode({ text, label = t('MobileSettings.qrLabel') }: { text: string; label?: string }) {
  // One path of squares, drawn from the code's modules: no image, no innerHTML.
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
    let d = ''
    for (let row = 0; row < modules.size; row++) {
      for (let column = 0; column < modules.size; column++) {
        if (modules.get(row, column)) d += `M${column} ${row}h1v1h-1z`
      }
    }
    return { size: modules.size, path: d }
  }, [text])
  return (
    <svg className="mobile-qr" viewBox={`-4 -4 ${size + 8} ${size + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={size + 8} height={size + 8} className="mobile-qr-back" />
      <path d={path} className="mobile-qr-modules" />
    </svg>
  )
}
