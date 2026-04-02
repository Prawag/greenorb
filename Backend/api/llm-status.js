import llmRouter from '../lib/llm-router.js';

export default async (req, res) => {
  try {
    const status = llmRouter.getStatus();
    res.json({
      data: status,
      cached_at: new Date().toISOString(),
      stale: false,
      source: 'LLM Router',
      ttl: 30
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
