# /docker-build — Docker Build & Test

Build and test the Docker image locally before deploying.

## Steps

### 1. Pre-Build Check
- Read `Dockerfile` to understand the build stages
- Verify `package.json` has the correct build and start scripts
- Check that `.dockerignore` exists and excludes `node_modules`, `.env`, etc.

### 2. Build Image
```bash
cd "/Users/mattysquarzoni/test questions /hmn-cascade"
docker build -t hmn-cascade:test .
```

Report:
- Build success/failure
- Build time
- Image size (`docker images hmn-cascade:test`)
- Any build warnings

### 3. Test Run
```bash
docker run -d --name hmn-cascade-test \
  -p 3099:3001 \
  -e JWT_SECRET=test-secret-for-docker \
  -e ADMIN_PASSWORD=test-password \
  -e ANTHROPIC_API_KEY=sk-ant-test \
  hmn-cascade:test
```

Wait 5 seconds, then:
- Check container is running: `docker ps | grep hmn-cascade-test`
- Check logs: `docker logs hmn-cascade-test`
- Test health: `curl -s http://localhost:3099/`

### 4. Cleanup
```bash
docker stop hmn-cascade-test
docker rm hmn-cascade-test
```

### 5. Report
| Metric | Value |
|--------|-------|
| Build Status | ✓/✗ |
| Build Time | Xs |
| Image Size | XMB |
| Container Start | ✓/✗ |
| Health Check | ✓/✗ |

If any step fails, diagnose the issue and suggest fixes.
