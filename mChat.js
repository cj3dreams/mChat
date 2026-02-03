const express = require('express');
const app = express();

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`Chat app running on port ${PORT}`);
});
