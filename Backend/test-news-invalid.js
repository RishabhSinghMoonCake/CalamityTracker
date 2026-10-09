import axios from 'axios';

async function test() {
  try {
    const res = await axios.get('https://newsdata.io/api/1/latest', {
      params: { apikey: 'invalid_key', q: 'flood' },
      timeout: 5000
    });
    console.log(`Success`);
  } catch (err) {
    console.log(`message: "${err.message}"`);
    console.log(`statusText: "${err.response?.statusText}"`);
    console.log(`status: ${err.response?.status}`);
    console.log(`raw:`, Object.keys(err));
  }
}
test();
