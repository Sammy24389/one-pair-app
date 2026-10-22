# Optional PWA installation

Outcome: after onboarding, browser users see a compact prominent install suggestion with an explicit Continue in browser option. Nothing gates browser access. Native APK and standalone/home-screen launches suppress the suggestion. Dismissal persists locally; Settings > Install app reopens the installation guide.

A captured beforeinstallprompt event is consumed once, directly from the install button user gesture. Browser acceptance closes the suggestion, appinstalled confirms installation, cancellation and errors provide manual instructions while leaving the app usable. Desktop/Android supporting browsers use their real installer. iOS/iPadOS instructions describe Safari Share > Add to Home Screen > Add. Other browsers receive menu guidance including Safari Mac Add to Dock. No fake installer, automatic download or prompt on page load.

The manifest has a stable relative id/start_url/scope, standalone display, PNG192/512 icons exported from existing linked-ring artwork, and an Apple180 icon. Relative paths preserve subdirectory hosting. Icons are included in precache; Capacitor builds still disable the service worker. There are no new runtime dependencies, APIs, accounts or storage services. Local storage contains only a dismissal flag; clearing browser data resets it. Installation does not guarantee background/closed-app delivery and browser profiles remain separate local data stores.

Verification: event lifecycle tests (native/standalone exclusion, single-use prompt, accept/cancel/failure, persistent dismissal and Settings reopening), keyboard-accessible labeled actions, typecheck, production build and generated manifest/icon size checks. OS/browser installation itself requires a secure-context physical device check because browser installability heuristics and OS UI cannot be proven by synthetic events. Rollback is code and static assets only.

References: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt and https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest .

Visual verification uses an opaque neutral panel with explicit foreground colors in both light and dark schemes; glass/gradient themes must not allow QR codes or underlying text to bleed through the install instructions.
