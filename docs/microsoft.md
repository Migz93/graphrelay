# Microsoft Setup

GraphRelay uses a single Microsoft account for To Do and optional Outlook Calendar access. The GraphRelay admin password is a separate sign-in for the web UI.

## Register The App

1. In the Microsoft Entra admin center, open **App registrations → New registration**. Choose a supported account type that includes personal Microsoft accounts if you use Outlook.com or another personal Microsoft account.
2. Under **Authentication**, add a redirect URI on the **Web** platform. Use the full **Microsoft Redirect URI** displayed in **Settings → General → Network**.
3. Under **API permissions**, add the Microsoft Graph delegated permission `Tasks.ReadWrite`. Add delegated `Calendars.Read` if you plan to use Calendar.
4. Under **Certificates & secrets**, create a client secret and copy its **Value** when it appears. Copy the **Application (client) ID** from the app overview.
5. In **Settings → General → Microsoft Connection**, open **Microsoft App Credentials** and save those values. Select **Connect Microsoft** and sign in with the account you want GraphRelay to use. For a shared shopping list, use the owner’s account.
6. To enable Calendar, select **Enable Calendar Access** and consent using the same account.

See [Microsoft’s registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) and [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference).

## Redirect URI And Reverse Proxy

GraphRelay appends `/api/microsoft/callback` to the configured **Public URL**. The default is `http://localhost:9304/api/microsoft/callback`. For a reverse proxy, use your HTTPS origin, such as `https://graphrelay.example.com`, and register the resulting full callback alongside any loopback entry you still use.

Begin the Microsoft flow from the configured origin in a tab already signed in to GraphRelay. The browser needs to reach the callback and carry the same session cookie. See [Deployment](deployment.md) for proxy configuration and [Microsoft’s redirect URI rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

## Troubleshooting

| Symptom | Check |
|---|---|
| Microsoft rejects the redirect URI | Compare the full callback in GraphRelay with the registered Web URI, including scheme, host and path. |
| The browser redirects to localhost on a remote deployment | Open the matching tunnel in the browser or configure the instance’s HTTPS origin and register its callback. |
| Callback is unauthorized or the sign-in session expired | Sign in to GraphRelay at the configured origin and start the flow again in the same tab. |
| `AADSTS7000215` | Confirm the app ID and secret **Value**, check expiry, and save a new value if needed. |
| Calendar still asks for access | Check delegated `Calendars.Read` and select **Enable Calendar Access** again. |
| GraphRelay asks you to reconnect with the original account | An enrolled list or calendar feed still belongs to the previous account. Reconnect that account. |

## Implementation

GraphRelay uses MSAL’s confidential web application flow with state and PKCE. The OAuth flow expires after ten minutes. It requests `offline_access` for background work and stores its token cache encrypted. Reconnect after consent changes or when the Microsoft token can no longer be refreshed. [Architecture](architecture.md)
