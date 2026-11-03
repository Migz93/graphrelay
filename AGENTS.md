# GraphRelay agent guidelines

Read README.md, docs/workflow.md and any LOCAL.md before development. Keep source and integration details scoped to GraphRelay.

GraphRelay runs on Node.js, TypeScript, Express, SQLite, React, Vite and Tailwind. The app listens on port 9304 and stores its data in /config. Pacearr is the UI reference. Keep list activity within To Do.

Use the private workspace runbook for direct SSH development. Edit the server checkout in the dedicated GraphRelay devcontainer at /workspaces/graphrelay. Install dependencies and run checks inside that container. Use a task branch from develop and synchronize through GitHub. Run npm run check, npm test and npm run build before review. Read docs/workflow.md for review and release gates.

Keep credentials, token cache data, internal host details and live list contents out of Git and logs. Build a uniquely tagged candidate and smoke-test it with disposable data. Deploy the exact tested image only when requested.
