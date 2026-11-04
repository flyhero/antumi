export const VISUALIZATION_SCHEME = 'antumi-visualization'
export const VISUALIZATION_RESOURCE_DOMAINS = ['https://persistent.oaistatic.com/plugins/visualize/', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://esm.sh', 'https://fonts.bunny.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://unpkg.com']
const resources = ['blob:', 'data:', ...VISUALIZATION_RESOURCE_DOMAINS].join(' ')
export const VISUALIZATION_POLICY = ["default-src 'none'", `script-src 'unsafe-inline' ${resources}`, `style-src 'unsafe-inline' ${resources}`, `img-src ${resources}`, `font-src ${resources}`, `media-src ${resources}`, "connect-src blob: data:", 'worker-src blob:', "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ')
