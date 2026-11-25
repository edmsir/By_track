const fs = require('fs')
const path = require('path')

const logoBase64 = fs.readFileSync(path.join(__dirname, 'public/logo.png')).toString('base64')
const logoUri = 'data:image/png;base64,' + logoBase64

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#FFFFFF" />
  <rect x="20" y="20" width="472" height="472" rx="100" fill="#FAF9F6" stroke="#C81D77" stroke-width="4" stroke-opacity="0.18" />
  <g transform="translate(56, 120)">
    <image href="${logoUri}" width="400" height="230" preserveAspectRatio="xMidYMid meet" />
  </g>
  <rect x="176" y="380" width="160" height="36" rx="18" fill="#C81D77" />
  <text x="256" y="403" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="3">TRACK</text>
</svg>`

fs.writeFileSync(path.join(__dirname, 'public/app-icon.svg'), svg)
console.log('App icon SVG successfully written!')
