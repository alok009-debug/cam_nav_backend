const QRCode = require('qrcode');
const pool = require('../db/sql.db');

// ============ GENERATE QR CODE FOR A LOCATION ============
const generateQR = async (req, res) => {
  try {
    const { locId } = req.params;
    const adminId = req.adminId;

    // Check if location exists and belongs to this admin
    const [location] = await pool.query(
      'SELECT locId, name, latitude, longitude, admin_id FROM locations WHERE locId = ? AND admin_id = ?',
      [locId, adminId]
    );

    if (location.length === 0) {
      return res.status(404).json({ error: 'Location not found or unauthorized' });
    }

    // ✅ Check if QR already exists for this location
    const [existingQR] = await pool.query(
      'SELECT qr_hash FROM qr_codes WHERE location_id = ? AND admin_id = ?',
      [locId, adminId]
    );

    let qrHash;
    if (existingQR.length > 0) {
      // ✅ Use existing QR hash
      qrHash = existingQR[0].qr_hash;
      console.log(`✅ Reusing existing QR for location ${locId}: ${qrHash}`);
    } else {
      // ✅ Generate new QR hash
      const timestamp = Date.now().toString(36).toUpperCase();
      qrHash = `CAMPUS_${adminId}_LOC_${locId}_${timestamp}`;

      // Save to database
      await pool.query(
        `INSERT INTO qr_codes (qr_hash, location_id, admin_id) 
         VALUES (?, ?, ?)`,
        [qrHash, locId, adminId]
      );
      console.log(`✅ Generated new QR for location ${locId}: ${qrHash}`);
    }

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


// ============ BULK GENERATE QR CODES ============
const generateAllQRs = async (req, res) => {
  try {
    const adminId = req.adminId;

    const [locations] = await pool.query(
      'SELECT locId, name FROM locations WHERE admin_id = ? ORDER BY locId',
      [adminId]
    );

    if (locations.length === 0) {
      return res.status(404).json({ error: 'No locations found for this admin' });
    }

    const results = [];
    for (const location of locations) {
      // ✅ Check if QR already exists
      const [existingQR] = await pool.query(
        'SELECT qr_hash FROM qr_codes WHERE location_id = ? AND admin_id = ?',
        [location.locId, adminId]
      );

      let qrHash;
      if (existingQR.length > 0) {
        qrHash = existingQR[0].qr_hash;
      } else {
        const timestamp = Date.now().toString(36).toUpperCase();
        qrHash = `CAMPUS_${adminId}_LOC_${location.locId}_${timestamp}`;
        await pool.query(
          `INSERT INTO qr_codes (qr_hash, location_id, admin_id) 
           VALUES (?, ?, ?)`,
          [qrHash, location.locId, adminId]
        );
      }

      const qrBuffer = await QRCode.toBuffer(qrHash, {
        type: 'png',
        margin: 1,
        width: 200
      });

      results.push({
        locId: location.locId,
        name: location.name,
        qrHash: qrHash,
        qrData: qrBuffer.toString('base64')
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

// ============ VALIDATE QR CODE ============
const validateQR = async (req, res) => {
  try {
    const { qrHash } = req.body;

    if (!qrHash) {
      return res.status(400).json({ error: 'QR hash is required' });
    }

    // Extract admin_id from QR hash
    const parts = qrHash.split('_');
    const adminId = parts[1]; // CAMPUS_{adminId}_LOC_{locId}_{timestamp}

    // Query to find location by QR hash
    const [rows] = await pool.query(
      `SELECT l.locId, l.name, l.latitude, l.longitude, l.building, l.admin_id
       FROM qr_codes q 
       JOIN locations l ON q.location_id = l.locId 
       WHERE q.qr_hash = ?`,
      [qrHash]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Invalid QR code' 
      });
    }

    // Get all locations for this admin (campus)
    const [allLocations] = await pool.query(
      `SELECT locId, name, latitude, longitude, building 
       FROM locations 
       WHERE admin_id = ?`,
      [rows[0].admin_id]
    );

    res.json({
      success: true,
      location: rows[0],
      campusLocations: allLocations,
      adminId: rows[0].admin_id
    });

  } catch (error) {
    console.error('Error validating QR:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to validate QR code' 
    });
  }
};

// ============ GET QR DATA ============
const getQRData = async (req, res) => {
  try {
    const { locId } = req.params;
    const adminId = req.adminId;

    const [rows] = await pool.query(
      `SELECT q.qr_hash, q.location_id, q.admin_id, l.name, l.latitude, l.longitude 
       FROM qr_codes q 
       JOIN locations l ON q.location_id = l.locId 
       WHERE q.location_id = ? AND q.admin_id = ?`,
      [locId, adminId]
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

// ============ REGENERATE QR CODE (Force New) ============
const regenerateQR = async (req, res) => {
  try {
    const { locId } = req.params;
    const adminId = req.adminId;

    // Check if location exists
    const [location] = await pool.query(
      'SELECT locId, name FROM locations WHERE locId = ? AND admin_id = ?',
      [locId, adminId]
    );

    if (location.length === 0) {
      return res.status(404).json({ error: 'Location not found or unauthorized' });
    }

    // ✅ Delete existing QR
    await pool.query(
      'DELETE FROM qr_codes WHERE location_id = ? AND admin_id = ?',
      [locId, adminId]
    );

    // Generate new QR hash
    const timestamp = Date.now().toString(36).toUpperCase();
    const qrHash = `CAMPUS_${adminId}_LOC_${locId}_${timestamp}`;

    await pool.query(
      `INSERT INTO qr_codes (qr_hash, location_id, admin_id) 
       VALUES (?, ?, ?)`,
      [qrHash, locId, adminId]
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

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr_location_${locId}.png"`);
    res.send(qrBuffer);

  } catch (error) {
    console.error('Error regenerating QR:', error);
    res.status(500).json({ error: 'Failed to regenerate QR code' });
  }
};


module.exports = {
  generateQR,
  generateAllQRs,
  validateQR,
  getQRData,
  regenerateQR
};