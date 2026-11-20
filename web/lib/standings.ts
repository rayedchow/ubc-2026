import type { RankedBot } from "./types";

export function standings(bots: RankedBot[], gym: string) {
  const mean = (scores: number[]) =>
    scores.length ? Math.round((10 * scores.reduce((a, b) => a + b, 0)) / scores.length) / 10 : null;
  const botRows = bots.map((bot) => {
    const scores = bot.scores.filter((s) => !gym || s.gymId === gym);
    return { ...bot, scores, score: mean(scores.map((s) => s.score)) };
  });
  const trainers = new Map<string, typeof botRows>();
  for (const bot of botRows) {
    const roster = trainers.get(bot.trainer) ?? [];
    roster.push(bot);
    trainers.set(bot.trainer, roster);
  }
  const users = Array.from(trainers, ([id, roster]) => {
    const best = new Map<string, number>();
    for (const bot of roster)
      for (const s of bot.scores) best.set(s.gymId, Math.max(best.get(s.gymId) ?? 0, s.score));
    return { id, name: id, roster, gyms: best.size, score: mean([...best.values()]) };
  });
  function rank<T extends { id: string; name: string; score: number | null }>(rows: T[]) {
    let previous: number | null = null,
      position = 0;
    return rows
      .sort(
        (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      )
      .map((row, i) => {
        if (row.score !== previous) position = i + 1;
        previous = row.score;
        return { ...row, rank: row.score === null ? null : position };
      });
  }
  return { users: rank(users), bots: rank(botRows) };
}
