# Demo target

A tiny app you can break on purpose while recording the demo.

## Run

```bash
cd demo-target
npm install
npm start
```

Open http://localhost:4000 and use the links to switch between up, slow and down.

## Routes

| Route | What it does |
|---|---|
| `/health` | 200 when up, 503 when down, answers after 3 seconds when slow |
| `/page` | HTML page containing the text "Sign in" (for the keyword check) |
| `/redirect` | 301 redirect to `/health` |
| `/hang` | never answers (for the timeout case) |
| `/control/up`, `/control/slow`, `/control/down` | switch the mode |
