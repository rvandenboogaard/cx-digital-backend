const axios = require('axios');
require('dotenv').config();

const config = {
  apiUrl: 'https://dev.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

async function getFCR(periodType = 'PreviousWeek') {
  try {
    const response = await axios.post(
      `${config.apiUrl}/analytics/metrics`,
      {
        id: 'fcr',
        periodFilter: {
          value: { _type: periodType },
          _type: 'Preset',
        },
        filters: [],
        aggregations: ['Percentage'],
        timezone: 'Europe/Amsterdam',
      },
      {
        headers: {
          Authorization: `bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const aggregates = response.data?.data?.aggregates || [];
    const fcrValue = aggregates.find(a => a.measure === 'Percentage')?.value || 0;
    return Math.round(fcrValue * 10) / 10;
  } catch (error) {
    console.warn(`⚠️ Dixa Analytics FCR failed: ${error.message}`);
    return null;
  }
}

module.exports = { getFCR };
