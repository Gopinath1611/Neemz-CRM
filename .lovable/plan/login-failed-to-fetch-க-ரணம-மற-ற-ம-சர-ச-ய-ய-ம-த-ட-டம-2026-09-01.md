# Login "Failed to fetch" — காரணம் மற்றும் சரிசெய்யும் திட்டம்

## காரணம் (இப்போது மறுபரிசோதனை செய்தது)

உங்கள் login request இப்படி இருக்கிறது:

```
POST /auth/v1/token?grant_type=password  →  Failed to fetch
```

Browser-இல் "Failed to fetch" என்று வருவதற்குக் காரணம், request-க்கு பதிலே வராமல் நிற்கிறது. நேரடியாகச் சோதித்தபோது:

| சோதனை | முடிவு |
|---|---|
| Auth health endpoint | **522** — 20 வினாடி காத்திருந்து timeout |
| Data (REST) endpoint | **522** — 20 வினாடி காத்திருந்து timeout |
| Direct SQL / connection pooler | கிடைக்கவில்லை (pooler unavailable) |
| DB metrics | timeout |
| Edge function logs | வழக்கமான boot/shutdown மட்டும் — application error இல்லை |
| `.env` keys (URL + anon key) | சரியானவை, expire ஆகவில்லை |
| Backend lifecycle state | "active" — pause/suspend ஆகவில்லை |

Cloudflare-இன் 522 பக்கம் தெளிவாகச் சொல்கிறது: **Browser: Working · Cloudflare: Working · Host: Error**. அதாவது பிரச்சினை உங்கள் browser-இலோ, app code-இலோ, keys-இலோ இல்லை — backend instance-இன் gateway (auth + data API + pooler-ஐ முன்னிலைப்படுத்துவது) connection-ஐ ஏற்கிறது ஆனால் request-ஐ முடிக்கவில்லை. இது infrastructure-side outage; app code மாற்றத்தால் சரிசெய்ய முடியாது. **Keys-ஐ rotate செய்ய வேண்டாம்** — அவை சரியாக இருக்கின்றன, outage நேரத்தில் rotate செய்வது இன்னொரு பிரச்சினையை உருவாக்கும்.

Password தவறு, RLS, user deactivate — இவை எதுவும் காரணம் அல்ல. server-இல் இருந்து எந்தப் பதிலும் வராததால் "Invalid credentials" கூட காட்ட முடியாமல் "Failed to fetch" ஆகிறது.

## சரிசெய்யும் வழி (உங்கள் பக்கம் ஒன்றும் செய்ய வேண்டாம்)

இதற்குச் சரியான தீர்வு backend restart — wedge ஆன gateway/pooler processes-ஐ அது clear செய்யும். அதற்கு உங்கள் ஒப்புதல் தேவை. இந்தத் திட்டத்தை approve செய்தால் நான் செய்வது:

1. Hosted backend-ஐ restart செய்வது.
2. Healthy என்று வரும் வரை status-ஐ poll செய்வது (பொதுவாக 1-3 நிமிடம்; அந்த நேரத்தில் auth/data கிடைக்காது).
3. அதே மூன்று probes-ஐ மீண்டும் ஓட்டுவது — auth login endpoint, data API read, direct SQL — 522 போய் சரியான பதில் வருகிறதா என உறுதி செய்ய.
4. Restart-க்குப் பிறகும் pooler வரவில்லை என்றால், DB health snapshot எடுத்து disk நிரம்பியதா அல்லது memory/connection saturation-ஆ என்று பார்த்து, அதற்கேற்ற resize-ஐ (disk size vs. database server size) பரிந்துரைப்பது.

Restart-க்குப் பிறகும் சரியாகவில்லை என்றால் அது self-serve layer-க்குக் கீழே உள்ள fault — அப்போது support-ஐ அணுக வேண்டும் என்று நேரடியாகச் சொல்லிவிடுவேன்.

## இதில் செய்யாதவை

- Backend degraded நிலையில் இருக்கும்போது code changes, migrations, writes எதுவும் இல்லை.
- Key rotation இல்லை, `.env` edits இல்லை.
