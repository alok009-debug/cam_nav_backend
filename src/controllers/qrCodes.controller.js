const QRCode = require('qrcode');
const pool = require('../db/sql.db');

// ============ GENERATE QR CODE FOR A LOCATION ============
const generateQR = async (req, res) => {
  try {
    const { locId } = req.params;

    // Check if location exists
    const [location] = await pool.query(
      'SELECT locId, name, latitude, longitude FROM locations WHERE locId = ?',
      [locId]
    );

    if (location.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Create a unique hash for this location
    // Format: CAMPUS_LOC_{locId}_{timestamp_hash}
    const timestamp = Date.now().toString(36).toUpperCase();
    const qrHash = `CAMPUS_LOC_${locId}_${timestamp}`;

    // Save the QR hash to database (if it doesn't exist, update it)
    await pool.query(
      `INSERT INTO qr_codes (qr_hash, location_id) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE qr_hash = VALUES(qr_hash)`,
      [qrHash, locId]
    );

    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(qrHash, {
      type: 'png',
      margin: 1,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Send the QR code as an image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr_location_${locId}.png"`);
    res.send(qrBuffer);

  } catch (error) {
    console.error('Error generating QR:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
};

// ============ BULK GENERATE QR CODES FOR ALL LOCATIONS ============
const generateAllQRs = async (req, res) => {
  try {
    // Get all locations
    const [locations] = await pool.query(
      'SELECT locId, name FROM locations ORDER BY locId'
    );

    if (locations.length === 0) {
      return res.status(404).json({ error: 'No locations found' });
    }

    // Generate QR for each location
    const results = [];
    for (const location of locations) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const qrHash = `CAMPUS_LOC_${location.locId}_${timestamp}`;

      // Save to database
      await pool.query(
        `INSERT INTO qr_codes (qr_hash, location_id) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE qr_hash = VALUES(qr_hash)`,
        [qrHash, location.locId]
      );

      // Generate QR buffer
      const qrBuffer = await QRCode.toBuffer(qrHash, {
        type: 'png',
        margin: 1,
        width: 200
      });

      results.push({
        locId: location.locId,
        name: location.name,
        qrHash: qrHash,
        qrData: qrBuffer.toString('base64') // Convert to base64 for JSON response
      });
    }

    res.json({
      success: true,
      message: `Generated QR codes for ${results.length} locations`,
      locations: results
    });

  } catch (error) {
    console.error('Error generating QR codes:', error);
    res.status(500).json({ error: 'Failed to generate QR codes' });
  }
};

// ============ GET QR CODE DATA ============
const getQRData = async (req, res) => {
  try {
    const { locId } = req.params;

    const [rows] = await pool.query(
      `SELECT q.qr_hash, q.location_id, l.name, l.latitude, l.longitude 
       FROM qr_codes q 
       JOIN locations l ON q.location_id = l.locId 
       WHERE q.location_id = ?`,
      [locId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found for this location' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching QR data:', error);
    res.status(500).json({ error: 'Failed to fetch QR data' });
  }
};

// ============ VALIDATE QR CODE (Public Endpoint) ============
const validateQR = async (req, res) => {
  try {
    const { qrHash } = req.body;

    if (!qrHash) {
      return res.status(400).json({ error: 'QR hash is required' });
    }

    const [rows] = await pool.query(
      `SELECT l.locId, l.name, l.latitude, l.longitude, l.building 
       FROM qr_codes q 
       JOIN locations l ON q.location_id = l.locId 
       WHERE q.qr_hash = ?`,
      [qrHash]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid QR code' });
    }

    res.json({
      success: true,
      location: rows[0]
    });

  } catch (error) {
    console.error('Error validating QR:', error);
    res.status(500).json({ error: 'Failed to validate QR code' });
  }
};

module.exports = {
  generateQR,
  generateAllQRs,
  getQRData,
  validateQR
};