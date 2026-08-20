/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Start latitude
 * @param {number} lon1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lon2 - End longitude
 * @param {string} unit - 'km', 'm', or 'mi'
 * @returns {number} - Distance in specified unit
 */
function calculateDistance(lat1, lon1, lat2, lon2, unit = 'm') {
    const R = 6371; // Earth's radius in km
    
    const toRad = (deg) => (deg * Math.PI) / 180;
    
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    let distance = R * c; // Distance in km
    
    // Convert to desired unit
    switch(unit) {
        case 'm':
            return distance * 1000; // meters
        case 'mi':
            return distance * 0.621371; // miles
        case 'km':
            return distance; // kilometers
        default:
            return distance * 1000; // default to meters
    }
}

/**
 * Calculate bearing between two coordinates
 * @param {number} lat1 - Start latitude
 * @param {number} lon1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lon2 - End longitude
 * @returns {number} - Bearing in degrees (0-360)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    
    const dLon = toRad(lon2 - lon1);
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    let bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360; // Normalize to 0-360
}

// ✅ EXPORT the functions
module.exports = { 
    calculateDistance, 
    calculateBearing 
};