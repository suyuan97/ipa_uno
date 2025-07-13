# IPA UNO Deployment Guide

## Prerequisites

- GitHub account with your IPA UNO repository
- Render.com account (free)

## Step-by-Step Deployment

### 1. Prepare Your Repository

Make sure your repository contains:

- ✅ `server.js` (main server file)
- ✅ `package.json` (with start script)
- ✅ `public/` folder (with all game files)
- ✅ `render.yaml` (deployment config)

### 2. Deploy to Render

1. **Go to [render.com](https://render.com)** and sign up/login
2. **Click "New +"** and select **"Web Service"**
3. **Connect your GitHub repository**:

   - Click "Connect a repository"
   - Select your IPA UNO repository
   - Grant Render access if prompted

4. **Configure the service**:

   - **Name**: `ipa-uno-game` (or any name you prefer)
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your default branch)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

5. **Click "Create Web Service"**

### 3. Wait for Deployment

- Render will automatically build and deploy your app
- This usually takes 2-5 minutes
- You'll see build logs in real-time
- Once complete, you'll get a URL like: `https://your-app-name.onrender.com`

### 4. Test Your Deployment

1. **Visit your Render URL** in a browser
2. **Test the game**:
   - Start a new game
   - Play a few turns
   - Verify WebSocket connections work
   - Test both consonant and vowel modes

### 5. Update Your Frontend (Optional)

If you want to host the frontend separately (e.g., on GitHub Pages), update the WebSocket connection:

```javascript
// In public/game.html, change:
const socket = io();

// To:
const socket = io("https://your-app-name.onrender.com");
```

## Automatic Updates

Once deployed, your game will automatically update when you:

1. Make changes to your code
2. Push to your GitHub repository
3. Render detects the changes and redeploys

## Troubleshooting

### Common Issues:

**Build fails:**

- Check that `package.json` has correct dependencies
- Verify `start` script exists: `"start": "node server.js"`

**App won't start:**

- Check Render logs for errors
- Verify PORT environment variable is set (Render sets this automatically)

**WebSocket connection fails:**

- Ensure your app is using `process.env.PORT || 3000`
- Check that Socket.IO is properly configured

**Game doesn't work:**

- Check browser console for JavaScript errors
- Verify all files in `public/` folder are included

### Getting Help:

- Check Render's [documentation](https://render.com/docs)
- View your app's logs in the Render dashboard
- Test locally first: `npm start` and visit `http://localhost:3000`

## Environment Variables

Your app uses these environment variables (set automatically by Render):

- `PORT`: Set by Render (usually 10000)
- `NODE_ENV`: Set to "production" in render.yaml

## Cost

- **Free tier**: 750 hours/month
- **Your game**: Very lightweight, will stay within free limits
- **Upgrade**: Only if you need more resources or custom domains
