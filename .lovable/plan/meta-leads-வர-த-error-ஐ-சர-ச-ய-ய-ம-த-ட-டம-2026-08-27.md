# Meta Leads வராத Error-ஐ சரிசெய்யும் திட்டம்

## இப்போது உறுதியாக கண்ட நிலை

- Active Meta App: **Dr Neemz CRM** (`1436600324896173`)
- Facebook Page: **Dr Neemz Dentistry** (`109620181969864`)
- Token valid, never-expiring **System User token**.
- Token-ல் Ads permissions உள்ளன; ஆனால் lead retrieval-க்கு அவசியமான **`leads_retrieval` permission இல்லை**.
- Page-க்கு தற்போது subscribed Meta apps எதுவும் இல்லை; `messages`, `messaging_postbacks`, `leadgen` மூன்றும் subscribe ஆகவில்லை.
- 10-minute backup sync இயங்குகிறது; கடைசி run-ல் 29 pending workflows process ஆனது. Fresh lead pull மட்டும் Meta `(#4) Application request limit reached` காரணமாக fail ஆனது.

## நீங்கள் Meta-வில் செய்ய வேண்டியது

1. Meta Business Settings-ல் **Dr Neemz CRM** app, **Dr Neemz Dentistry** Page, மற்றும் சம்பந்தப்பட்ட Ad Account-ஐ பயன்படுத்தும் System User-க்கு full/manage access கொடுக்கவும்.
2. Leads Access / CRM access பகுதியில் Dr Neemz CRM app அல்லது System User-க்கு Page leads access கொடுக்கவும்.
3. Dr Neemz CRM app-க்காக புதிய System User token உருவாக்கும்போது குறைந்தபட்சம் இவற்றை select செய்யவும்:
   - `leads_retrieval` — கட்டாயம்
   - `pages_manage_metadata` — Page webhook subscription-க்கு
   - `pages_show_list`
   - `pages_read_engagement`
   - `ads_read`
   - `ads_management`
   - `business_management`
4. Meta app-க்கு `leads_retrieval` Advanced Access தேவைப்பட்டால் App Review / Permissions பகுதியில் அதை enable செய்யவும்.
5. புதிய token-ஐ chat-ல் paste செய்ய வேண்டாம். Secure secret form மூலம் `META_PAGE_ACCESS_TOKEN`-ஐ update செய்ய வேண்டும்.

## எனக்கு உங்களிடமிருந்து தேவையானது

- **“New token generated with leads_retrieval”** என்று confirmation.
- இயன்றால் permission selection screen screenshot மட்டும்; token value screenshot/paste வேண்டாம்.
- ஒரு test lead submit செய்யக்கூடிய Meta Instant Form பெயர் அல்லது Form ID.

## Confirmation கிடைத்ததும் நான் செய்வது

1. Secure form திறந்து புதிய token-ஐ `META_PAGE_ACCESS_TOKEN`-ல் update செய்யச் செய்வேன்.
2. Live diagnostic மூலம் token validity மற்றும் `leads_retrieval` scope-ஐ verify செய்வேன்.
3. Page-க்கு `messages`, `messaging_postbacks`, `leadgen` fields-ஐ மீண்டும் subscribe செய்வேன்.
4. Meta rate limit குறைந்த பிறகு ஒரே controlled manual sync run செய்வேன்; repeated refresh calls செய்யமாட்டேன்.
5. Test form lead database-க்கு வந்ததா, அதன் workflow உடனே execute ஆனதா, duplicate உருவாகவில்லையா என்பதை end-to-end verify செய்வேன்.
6. `(#4)` தொடர்ந்தால் duplicate polling/API calls-ஐ audit செய்து exponential backoff மற்றும் request throttling சேர்க்கும் தனி targeted fix செய்வேன்.

## எதிர்பார்க்கப்படும் முடிவு

- புதிய leads webhook வழியாக உடனடியாக CRM-க்கு வரும்.
- Webhook தவறினாலும் 10-minute scheduled sync fallback ஆக இருக்கும்.
- Rate-limit நேரத்தில் repeated requests குறைந்து, அடுத்த eligible run தானாக recover ஆகும்.
