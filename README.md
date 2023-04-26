## NTL Function to Produce dynamic charts

I tried creating dynamic charts given

1. `base`
2. `target`
3. `interval`

with the moshi API -> `http://api.mochi.pod.town/api/v1/defi/coins/compare?base=${base}&target=${target}&interval=${interval}`

Given a URL `FUNCTION_URL?base=solana&target=ethereum&interval=1` it produces a chart
like

<img alt="chart" src="./chart.png"/>

---

##### To run locallay

1. `ntl run dev` and hit the URL with query params

---

The canvas thing on serverless envs is real challenge.
[This](https://github.com/okwme/serverless-canvas/) was a life safer

add the following environment variables to netlify deploy settings (not to the .env file)
`LD_LIBRARY_PATH` to `/var/task/node_modules/canvas/build/Release`

---

ntl dev --live lets you locally replicate prod but needs live-server installed and repo linked to the one hosted in netlify. NOICE.
