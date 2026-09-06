import autocannon from "autocannon";

const url = process.env.BENCHMARK_URL ||
  "http://localhost:8000/api/incidents?status=candidate,active&limit=17";

const instance = autocannon({
  url,
  connections: Number(process.env.BENCHMARK_CONNECTIONS || 20),
  duration: Number(process.env.BENCHMARK_DURATION_SECONDS || 10)
});

autocannon.track(instance, { renderProgressBar: false });

instance.on("done", (result) => {
  console.log(JSON.stringify({
    url,
    requestsPerSecond: result.requests.average,
    latencyAverageMs: result.latency.average,
    latencyP99Ms: result.latency.p99,
    non2xxResponses: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts
  }, null, 2));
});
