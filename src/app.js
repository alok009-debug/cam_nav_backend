const pool = require('./db/sql.db');
const cors = require('cors');
const express = require('express');


const app = express();

const adminRoutes = require('./routes/admin.route');
const navigationRoutes = require('./routes/navigation.route');



app.use(cors());
app.use(express.json());

app.use('/api/admin', adminRoutes);
app.use('/api/navigation', navigationRoutes);


app.get('/',(req,res)=>{
    res.send('backend running HTTPS');
})
app.get('/api/health', (req, res) => {
    res.send(Date())
});



// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});



module.exports = app
