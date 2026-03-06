const axios = require('axios');
require('dotenv').config();

const config = {
  apiUrl: 'https://dev.dixa.io/v1',
  apiKey: process.env.DIXA_API_KEY || process.env.DIXA_API_TOKEN,
};

async function getFCR(periodType = 'PreviousWeek') {
  try {
    console.log(`📊 Dixa Analytics: fetching FCR (${periodType}), apiKey present: ${!!config.apiKey}`);
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
        timeout: 5000,
      }
    );

    const aggregates = response.data?.data?.aggregates || [];
    console.log(`📊 Dixa Analytics FCR aggregates: ${JSON.stringify(aggregates)}`);
    const fcrValue = aggregates.find(a => a.measure === 'Percentage')?.value ?? null;
    console.log(`📊 Dixa Analytics FCR result: ${fcrValue}`);
    return fcrValue !== null ? Math.round(fcrValue * 10) / 10 : null;
  } catch (error) {
    console.warn(`⚠️ Dixa Analytics FCR failed: ${error.message} | code: ${error.code}`);
    return null;
  }
}

module.exports = { getFCR };
