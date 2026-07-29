# Eztren

**Eztren** is a global debate sport, played and ranked online at **[eztren.xyz](https://eztren.xyz)**.

Two players argue live. One judge scores it, in real time. Players climb from the lower alphabet leagues — starting near **Z** — toward becoming **A**, the top rank in the game. Every match is recorded: video, transcript, and an AI-generated summary, building a searchable public archive of debate and reasoning over time.

The project started under the name **One Alphabet**, and the in-game league names — *One Alphabet League*, *Two Alphabet League* — still reflect that origin.

> Eztren is a debate sport platform. It is unrelated to Honeywell's "eZtrend" industrial data recorder software — different product, different industry, similar-sounding name only.

## Links

- Live site: [eztren.xyz](https://eztren.xyz)
- What is Eztren?: [eztren.xyz/about](https://eztren.xyz/about)
- Rankings: [eztren.xyz/rankings](https://eztren.xyz/rankings)
- Constitution (rules): [eztren.xyz/constitution](https://eztren.xyz/constitution)

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com) v4
- [Supabase](https://supabase.com) — Postgres, Auth, Realtime
- [Daily.co](https://daily.co) — live text/audio battles
- Deployed on [Vercel](https://vercel.com)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). See `.env.local.example` for required environment variables.
