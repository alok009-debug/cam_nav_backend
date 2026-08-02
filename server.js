const app = require("./src/app");


app.get('/', (req, res) => {
    res.send("<h2>sever running</h2>")
})

app.get('/about', (req, res) => {
    res.send("<h2>about us</h2>")
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});