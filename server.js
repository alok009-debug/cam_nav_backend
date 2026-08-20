require('dotenv').config();
const app = require('./src/app');

const environment = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;

console.log(`Environment: ${environment}`);
console.log(`Running on port: ${PORT}`);

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});