# Focus-Core
It is a productivity timer app with a option to set goals and rewards, and the progress bar system to increase focus and satisfaction.

## Run locally

Service workers require a secure context. Start the site with a local server instead of opening `index.html` directly:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000` and allow notifications when starting a session. For production, serve the site over HTTPS.
