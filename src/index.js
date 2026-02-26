const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/admin/sync', async (req, res) => {
  res.json({ success: true, message: 'Sync triggered', timestamp: new Date().toISOString() });
});

app.get('/api/dashboard/summary', (req, res) => {
  res.json({ success: true, data: {}, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
