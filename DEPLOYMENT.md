# Netlify Deployment Guide

## Prerequisites

1. A Netlify account
2. GitHub OAuth App credentials (see MCP_OAUTH_SETUP.md)
3. Git repository connected to your Netlify account

## Deployment Options

### Option 1: Deploy via Netlify UI (Recommended for first deploy)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Add MCP OAuth 2.1 authentication"
   git push
   ```

2. **Go to Netlify Dashboard**
   - Log in to https://app.netlify.com
   - Click "Add new site" → "Import an existing project"
   - Connect your Git provider and select this repository

3. **Configure Build Settings**
   - Build command: `npm run build`
   - Publish directory: `docs`
   - These should be auto-detected from `netlify.toml`

4. **Set Environment Variables**
   - Go to Site settings → Environment variables
   - Add the following variables:

     ```
     GITHUB_CLIENT_ID=your_github_oauth_app_client_id
     GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
     TOKEN_SECRET=your_secure_random_secret_32_chars_min
     SESSION_SECRET=your_secure_random_secret_32_chars_min
     KAPA_API_KEY=your_kapa_api_key
     KAPA_PROJECT_ID=your_kapa_project_id
     KAPA_INTEGRATION_ID=your_kapa_integration_id
     ```

     Optional (for access control):
     ```
     ALLOWED_EMAILS=user1@example.com,user2@example.com
     ALLOWED_DOMAINS=example.com,yourcompany.com
     ```

5. **Generate Secrets**
   Use this command to generate secure random secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Run it twice to generate both `TOKEN_SECRET` and `SESSION_SECRET`.

6. **Deploy**
   - Click "Deploy site"
   - Wait for the build to complete

7. **Get Your Site URL**
   - After deployment, note your site URL (e.g., `https://your-site.netlify.app`)
   - You'll need this for the GitHub OAuth App callback

8. **Update GitHub OAuth App**
   - Go to your GitHub OAuth App settings
   - Set Authorization callback URL to: `https://your-site.netlify.app/oauth/callback`
   - Save changes

9. **Redeploy** (after updating GitHub OAuth callback)
   - Trigger a new deploy from Netlify dashboard or push a new commit

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI** (if not already installed)
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize Netlify Site** (first time only)
   ```bash
   netlify init
   ```
   Follow the prompts to create or link to an existing site.

4. **Set Environment Variables**
   ```bash
   netlify env:set GITHUB_CLIENT_ID "your_client_id"
   netlify env:set GITHUB_CLIENT_SECRET "your_client_secret"
   netlify env:set TOKEN_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
   netlify env:set SESSION_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
   netlify env:set KAPA_API_KEY "your_kapa_api_key"
   netlify env:set KAPA_PROJECT_ID "your_kapa_project_id"
   netlify env:set KAPA_INTEGRATION_ID "your_kapa_integration_id"
   ```

5. **Deploy**
   ```bash
   netlify deploy --prod
   ```

### Option 3: Deploy via Git Push (After initial setup)

Once configured, every push to your main branch will automatically deploy:

```bash
git add .
git commit -m "Your commit message"
git push origin main
```

## Verify Deployment

1. **Test Discovery Endpoints**
   ```bash
   # Protected Resource Metadata
   curl https://your-site.netlify.app/.well-known/oauth-protected-resource

   # Authorization Server Metadata
   curl https://your-site.netlify.app/.well-known/oauth-authorization-server/oauth
   ```

2. **Test Authentication Required**
   ```bash
   # Should return 401 with WWW-Authenticate header
   curl -i -X POST https://your-site.netlify.app/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
   ```

3. **Check Netlify Function Logs**
   - Go to Netlify Dashboard → Functions
   - You should see your edge functions listed
   - Check logs for any errors

## Local Development

1. **Create `.env` file** (if not exists)
   ```bash
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   TOKEN_SECRET=your_token_secret
   SESSION_SECRET=your_session_secret
   KAPA_API_KEY=your_kapa_api_key
   KAPA_PROJECT_ID=your_kapa_project_id
   KAPA_INTEGRATION_ID=your_kapa_integration_id
   ```

2. **Start Netlify Dev Server**
   ```bash
   npm run mcp:dev
   # or
   netlify dev
   ```

3. **Test Locally**
   - Server runs at http://localhost:8888 (or similar)
   - Edge functions are available at the same paths
   - For OAuth callback, use ngrok or configure GitHub OAuth with localhost callback

## Troubleshooting

### Build Fails

- Check build logs in Netlify dashboard
- Verify all dependencies are in `package.json`
- Ensure Node version matches (set in `netlify.toml`)

### Edge Functions Not Working

- Verify functions are in `netlify/edge-functions/` directory
- Check function logs in Netlify dashboard
- Ensure each function exports a `config` object with `path`

### Environment Variables Not Set

- Double-check variable names (case-sensitive)
- Redeploy after setting variables
- Check "Deploy log" → "Environment variables" section

### OAuth Errors

- Verify GitHub OAuth App callback URL matches exactly
- Check that `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
- Ensure your site uses HTTPS (Netlify provides this automatically)

### "Invalid or expired token"

- Verify `TOKEN_SECRET` hasn't changed between deploys
- Check Netlify function logs for detailed error messages

## Monitoring

### View Logs

```bash
# Real-time logs
netlify dev

# Or in dashboard
Netlify Dashboard → Functions → Select function → Logs
```

### Function Analytics

- Go to Netlify Dashboard → Functions
- View invocation count, errors, and duration

## Rollback

If something goes wrong:

1. **Via Dashboard**
   - Go to Deploys → Click on a previous successful deploy
   - Click "Publish deploy"

2. **Via CLI**
   ```bash
   netlify rollback
   ```

## Production Checklist

- [ ] All environment variables set
- [ ] GitHub OAuth App callback URL configured correctly
- [ ] `TOKEN_SECRET` and `SESSION_SECRET` are strong random values
- [ ] `ALLOWED_EMAILS` or `ALLOWED_DOMAINS` configured (if access control needed)
- [ ] Tested OAuth flow end-to-end
- [ ] Verified MCP endpoint returns 401 without token
- [ ] Verified MCP endpoint works with valid token
- [ ] Function logs show no errors
- [ ] Set up monitoring/alerts (optional)

## Next Steps

After successful deployment:

1. Test the OAuth flow with an MCP client
2. Configure your MCP client to use: `https://your-site.netlify.app/mcp`
3. Monitor function invocations and errors
4. Consider setting up custom domain (optional)

## Support

For issues:
- Check Netlify function logs
- Review MCP_OAUTH_SETUP.md for OAuth configuration
- Check GitHub OAuth App settings
- Verify environment variables are set correctly