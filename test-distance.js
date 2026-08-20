const { calculateDistance, calculateBearing } = require('./src/utils/distance');

// Your test locations
const locations = [
    { id: 14, name: 'Store room', lat: 23.67008250, lon: 85.51245900 },
    { id: 15, name: 'Mountains view', lat: 23.66818540, lon: 85.51991350 },
    { id: 16, name: 'Water tank', lat: 23.66746220, lon: 85.51979210 },
    { id: 17, name: 'T intersection', lat: 23.66833510, lon: 85.52051370 }
];

console.log('📏 Distance Calculations:\n');

// Store room → Mountains view
const dist1 = calculateDistance(
    locations[0].lat, locations[0].lon,
    locations[1].lat, locations[1].lon
);
console.log(`Store room → Mountains view: ${Math.round(dist1)}m`);

// Store room → Water tank
const dist2 = calculateDistance(
    locations[0].lat, locations[0].lon,
    locations[2].lat, locations[2].lon
);
console.log(`Store room → Water tank: ${Math.round(dist2)}m`);

// Mountains view → Water tank
const dist3 = calculateDistance(
    locations[1].lat, locations[1].lon,
    locations[2].lat, locations[2].lon
);
console.log(`Mountains view → Water tank: ${Math.round(dist3)}m`);

// Store room → T intersection
const dist4 = calculateDistance(
    locations[0].lat, locations[0].lon,
    locations[3].lat, locations[3].lon
);
console.log(`Store room → T intersection: ${Math.round(dist4)}m`);

// Bearing: Store room → Mountains view
const bearing = calculateBearing(
    locations[0].lat, locations[0].lon,
    locations[1].lat, locations[1].lon
);
console.log(`\n🧭 Bearing Store room → Mountains view: ${Math.round(bearing)}°`);