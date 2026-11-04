# Development workflow

1. Read the project instructions and the private workspace runbook. Check branch and dirty state on the server and client. Fetch and fast-forward the intended branch.
2. Use a task branch from develop. Edit the server checkout over SSH and run dependency installation, type checks, tests and builds inside the GraphRelay devcontainer as node.
3. Build a uniquely tagged production image and smoke-test it with disposable /config storage. Keep candidate and live configuration separate.
4. Commit and push the task branch, then fetch and fast-forward it on the local computer. Use the sibling apps' cross-AI review and CodeRabbit review sequence before requesting a PR into develop. Use main for releases. Initial repository creation establishes the two base branches.
5. For changes to the running app, replace the GDLXGS GraphRelay test container with the exact tested image as part of the task. Preserve the configuration volume, verify health, and record the revision, image ID and verification in the private Homelab notes.
