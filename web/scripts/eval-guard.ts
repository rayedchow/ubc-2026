/**
 * Creator-side diagnostic for the Transaction Guard Gym: fresh tasks from the
 * same generator (a different seed, so never seen in training or in the sealed
 * held-out set), labels known, scored with the same deterministic grader.
 * Gives per-category breakdowns the sealed test deliberately does not return.
 *
 *   npx tsx scripts/eval-guard.ts <endpoint>/v1 base:<sha> trained:<sha> [n]
 */
import { generateGuardTasks, gradeGuard, parseGuardAnswer, REASONS } from "../lib/server/gyms/solana-guard";

const [baseUrl, ...rest] = process.argv.slice(2);
const n = Number(rest.find((a) => /^\d+$/.test(a)) ?? 240);
const models = rest.filter((a) => a.includes(":")).map((a) => { const [name, sha] = a.split(":"); return { name, sha }; });
const tasks = generateGuardTasks(n, 4242); // seed 4242: disjoint from the sealed bundle (seed 11)

async function ask(model: string, sha: string, prompt: string): Promise<string> {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 64, messages: [{ role: "user", content: prompt }] }),
      });
      const b = await r.json();
      if (b.weights_sha256 !== sha) throw new Error(`wrong weights ${b.weights_sha256}`);
      return String(b.choices[0].message.content);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  }
  return "";
}

(async () => {
  const out: Record<string, unknown> = { n, seed: 4242, models: {} };
  for (const m of models) {
    const rows: { reason: string; decisionOk: boolean; reasonOk: boolean; solved: boolean; valid: boolean; reward: number; said: string }[] = [];
    for (let i = 0; i < tasks.length; i += 8) {
      const batch = tasks.slice(i, i + 8);
      const answers = await Promise.all(batch.map((t) => ask(m.name, m.sha, t.prompt)));
      batch.forEach((t, j) => {
        const g = gradeGuard(t, answers[j]);
        const p = parseGuardAnswer(answers[j]);
        const reward = g.status === "ok" ? g.reward : 0;
        rows.push({
          reason: t.hidden.reason,
          valid: !!p && (p.decision === "sign" || p.decision === "reject"),
          decisionOk: p?.decision === t.hidden.decision,
          reasonOk: p?.reason === t.hidden.reason,
          solved: reward === 1,
          reward,
          said: p?.decision ?? "none",
        });
      });
    }
    const rate = (f: (r: (typeof rows)[0]) => boolean, rs = rows) => (rs.length ? rs.filter(f).length / rs.length : 0);
    const unsafe = rows.filter((r) => r.reason !== "safe");
    const safe = rows.filter((r) => r.reason === "safe");
    (out.models as Record<string, unknown>)[m.name] = {
      sha: m.sha,
      solved: rate((r) => r.solved),
      meanReward: rows.reduce((a, r) => a + r.reward, 0) / rows.length,
      validJson: rate((r) => r.valid),
      decisionAccuracy: rate((r) => r.decisionOk),
      reasonAccuracy: rate((r) => r.reasonOk),
      unsafeSigned: rate((r) => r.said === "sign", unsafe),
      safeRejected: rate((r) => r.said === "reject", safe),
      perCategory: Object.fromEntries(REASONS.map((c) => {
        const rs = rows.filter((r) => r.reason === c);
        return [c, { n: rs.length, solved: rate((r) => r.solved, rs), decision: rate((r) => r.decisionOk, rs) }];
      })),
    };
    console.error(`${m.name} done`);
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})();
