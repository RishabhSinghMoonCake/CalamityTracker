import { getProcessedDisasters } from "../services/disaster.service.js";

async function main(req, res) {
  try {
    const disasters = await getProcessedDisasters();
    res.json({ data: disasters });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default main;