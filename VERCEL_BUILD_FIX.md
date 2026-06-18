# Vercel Build Fix Summary

## Issues Identified & Fixed

Your repository had module resolution failures on Vercel despite working locally. This is a common CI/CD environment issue. The error messages indicated:

```
Module not found: Can't resolve '@/components/ui/textarea'
Module not found: Can't resolve '@/components/sources-panel'
Module not found: Can't resolve '@/lib/utils'
Module not found: Can't resolve '@/lib/embed'
Error: Command "cd web && npm install && npm run build" exited with 1
```

## Root Causes

1. **Build Tool Inconsistency**: Using `npm install` in CI/CD instead of `npm ci` can cause race conditions
2. **Path Resolution**: Webpack resolution wasn't explicitly configured for TypeScript extensions
3. **Environment Cache**: Vercel's build cache might contain stale artifacts
4. **Missing Configuration**: No `.npmrc` for consistent package manager behavior

## Changes Applied

### 1. Updated `vercel.json`
- ✅ Changed from `npm install` to `npm ci` (more reliable in CI/CD)
- ✅ Added explicit `nodeVersion: "18.x"` to ensure consistent environment

**Before:**
```json
{
    "buildCommand": "cd web && npm install && npm run build",
    "installCommand": "npm install",
    "framework": "nextjs",
    "outputDirectory": "web/.next"
}
```

**After:**
```json
{
    "buildCommand": "cd web && npm ci && npm run build",
    "installCommand": "npm ci",
    "framework": "nextjs",
    "outputDirectory": "web/.next",
    "nodeVersion": "18.x"
}
```

### 2. Enhanced `web/next.config.js`
- ✅ Added webpack configuration for explicit file extension resolution
- ✅ Ensures TypeScript files are properly recognized during build

### 3. Updated `web/tsconfig.json`
- ✅ Added `forceConsistentCasingInFileNames: true` (prevents case sensitivity issues)
- ✅ Disabled `sourceMap` and `declaration` for faster production builds
- ✅ Better optimization for Vercel's build environment

### 4. Created `.vercelignore`
- ✅ Excludes unnecessary directories (crawler, indexer, local, infra)
- ✅ Reduces build context and Vercel cache overhead
- ✅ Faster deployments by ignoring non-web dependencies

### 5. Created `web/.npmrc`
- ✅ Ensures consistent npm behavior across local and CI/CD environments
- ✅ Prevents peer dependency conflicts

## How to Deploy

1. **Push the changes to GitHub:**
```bash
git add vercel.json web/next.config.js web/tsconfig.json web/.npmrc .vercelignore
git commit -m "fix: resolve Vercel build module resolution issues"
git push origin main
```

2. **Clear Vercel Cache (if needed):**
   - Go to Vercel Dashboard → Project Settings → Git
   - If the build still fails, manually clear the build cache:
     - Vercel Dashboard → Deployments → Settings → Clear Build Cache

3. **Trigger a new deployment:**
   - Push a new commit OR
   - Click "Deploy" in Vercel dashboard OR
   - Use Vercel CLI: `vercel --prod`

## What Each Change Does

| File | Change | Impact |
|------|--------|--------|
| `vercel.json` | Use `npm ci` + explicit Node.js version | Ensures clean, reproducible installs in CI/CD |
| `next.config.js` | Add webpack extension resolution | Prevents module not found errors |
| `tsconfig.json` | Add casing + build optimizations | Better path resolution + faster builds |
| `.vercelignore` | Exclude non-web folders | Reduces build context + faster deploys |
| `web/.npmrc` | Consistent package manager config | Prevents environment-specific issues |

## Expected Results After Deploy

- ✅ All modules should resolve correctly
- ✅ Build should complete successfully
- ✅ Faster deployment times
- ✅ No more "Module not found" errors

## If Issues Persist

1. **Hard reset Vercel cache:**
   - Vercel Dashboard → Project → Settings → Environment Variables
   - Add temporary variable: `VERCEL_FORCE_NO_BUILD_CACHE=true`
   - Redeploy, then remove the variable

2. **Check Node modules:**
   ```bash
   # Local verification
   cd web
   rm -rf node_modules package-lock.json
   npm ci
   npm run build
   ```

3. **Verify path aliases:**
   ```bash
   # In web directory, check if path resolution works
   npx tsc --listFiles --noEmit
   ```

## Files Modified

- ✅ `/vercel.json` - Vercel deployment config
- ✅ `/web/next.config.js` - Next.js build config
- ✅ `/web/tsconfig.json` - TypeScript compiler options
- ✅ `/web/.npmrc` (created) - npm configuration
- ✅ `/.vercelignore` (created) - Vercel ignore patterns

## Resources

- [Vercel Environment Variables & Caching](https://vercel.com/docs/concepts/projects/environment-variables)
- [Next.js Module Resolution](https://nextjs.org/docs/advanced-features/module-path-aliases)
- [npm ci vs npm install](https://docs.npmjs.com/cli/v7/commands/npm-ci)

---

**Status:** ✅ Ready to deploy

Push these changes and your Vercel deployment should work correctly!
