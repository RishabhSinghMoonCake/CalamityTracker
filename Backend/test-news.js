import axios from 'axios';

async function test() {
  const queries = ["mass casualty", "war", "missile", "attack", "flood"];
  for (const q of queries) {
    try {
      const res = await axios.get('https://newsdata.io/api/1/latest', {
        params: { apikey: process.env.NEWS_API_KEY, q: q },
        timeout: 5000
      });
      console.log(`Success ${q}: ${res.data.results.length}`);
    } catch (err) {
      console.log(`Error for ${q}: message='${err.message}', statusText='${err.response?.statusText}', status=${err.response?.status}`);
      console.log('Raw error:', err.response?.data);
    }
  }
}
test();
