// Serverless function Vercel: POST /api/tool/question/reply
// Menyambungkan jawaban user dari form pertanyaan ke loop agent yang sedang jalan.
import { resolveQuestion } from '../_agent.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let input = req.body;
  if (!input || typeof input === 'string') {
    try {
      input = JSON.parse(input || '{}');
    } catch {
      res.status(400).json({ error: 'Body bukan JSON valid' });
      return;
    }
  }

  const ok = resolveQuestion(input.id, input.answers);
  if (!ok) {
    res.status(404).json({ error: 'Request tidak ditemukan / sudah dijawab' });
    return;
  }
  res.status(200).json({ ok: true });
}
