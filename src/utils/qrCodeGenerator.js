const QRCode = require('qrcode');
const sharp = require('sharp');

/**
 * Generate a QR code image with a location name label below it.
 * @param {string} qrHash - The hash to encode in the QR
 * @param {string} locationName - The name to display below the QR
 * @param {object} options - Optional settings
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function generateQRCard(qrHash, locationName, options = {}) {
    const qrSize = options.qrSize || 400;
    const margin = options.margin || 40;
    const fontSize = options.fontSize || 28;
    const labelHeight = options.labelHeight || 80;
    const background = options.background || '#FFFFFF';
    const textColor = options.textColor || '#000000';

    // 1. Generate QR code PNG
    const qrBuffer = await QRCode.toBuffer(qrHash, {
        type: 'png',
        margin: 1,
        width: qrSize,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });

    const totalWidth = qrSize + margin * 2;
    const totalHeight = qrSize + margin * 2 + labelHeight;

    // 2. ✅ SVG contains ONLY the text (no white rect covering everything!)
    const safeLabel = escapeXml(locationName || 'Unnamed Location');

    const textSvg = `
        <svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
            <text 
                x="50%" 
                y="${qrSize + margin + labelHeight / 2 + fontSize / 3}"
                text-anchor="middle"
                font-family="Arial, Helvetica, sans-serif"
                font-size="${fontSize}"
                font-weight="bold"
                fill="${textColor}"
            >${safeLabel}</text>
        </svg>
    `;

    // 3. ✅ Composite: white canvas + QR + text
    const finalImage = await sharp({
        create: {
            width: totalWidth,
            height: totalHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    })
        .composite([
            {
                input: qrBuffer,
                top: margin,
                left: margin
            },
            {
                input: Buffer.from(textSvg),
                top: 0,
                left: 0
            }
        ])
        .png()
        .toBuffer();

    return finalImage;
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

module.exports = { generateQRCard };