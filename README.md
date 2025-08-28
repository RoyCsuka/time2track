# Ritregistratie Tool

Kleine tool om ritten te loggen (klant of woon-werk), met km + reistijd via Google Maps API. Data wordt direct opgeslagen in Google Sheets.

## Stap 1 — Repo & GitHub Pages
1. Maak een GitHub repo aan.
2. Upload `index.html`, `style.css`, `script.js`.
3. Ga naar **Settings → Pages** en zet GitHub Pages aan.
4. Jouw site staat dan live op `https://<username>.github.io/<repo>/`.

## Stap 2 — Google Maps API Key
1. Ga naar [Google Cloud Console](https://console.cloud.google.com/).
2. Maak project + koppel billing (nodig, maar gebruik blijft meestal gratis).
3. Enable:
    - Maps JavaScript API
    - Places API
    - Distance Matrix API
4. Maak een **API key** bij *Credentials*.
5. Beperk:
    - **Application restriction**: HTTP referrers → `https://<username>.github.io/*`
    - **API restrictions**: vink alleen de 3 API’s aan.
6. Zet de key in `index.html` → vervang `YOUR_API_KEY`.

## Stap 3 — Google Sheets koppeling
1. Maak een Google Sheet en kopieer het ID uit de URL.
2. Open *Extensions → Apps Script* en plak `Code.gs`.
3. Vervang `SHEET_ID` door jouw sheet-ID.
4. Deploy → New deployment → Webapp → Access: “Anyone with link”.
5. Kopieer de webapp-URL.
6. Plak deze URL in `script.js` bij `SHEETS_WEBAPP_URL`.

## Klaar 🎉
- Open je GitHub Pages site.
- Vul ritgegevens in.
- Klik “Opslaan in Google Sheet”.
- Gegevens staan direct in je spreadsheet.